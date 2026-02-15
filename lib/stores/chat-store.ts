import { create } from 'zustand'
import { wsManager } from '@/lib/websocket-manager'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore, shouldPlaySound } from './notification-store'
import { notificationSound } from '@/lib/utils/sounds'
import { useBlockStore } from './block-store'

interface ReactionGroup {
  emoji: string
  users: { id: string; username: string }[]
}

interface Message {
  id: string
  client_id?: string
  user_id: string
  content: string
  created_at: string
  edited_at: string | null
  status: 'sending' | 'sent' | 'received' | 'failed' | 'held' | 'blocked'
  user: {
    id: string
    username: string
    tag: string
    display_name: string | null
    avatar_url: string | null
  }
  reply_to_id?: string | null
  attachment_url?: string | null
  mentions?: string[] | null
  message_type?: string
  metadata?: any
  reactions?: ReactionGroup[]
}

// Rate limiting constants
const RATE_LIMIT_WINDOW = 5000 // 5 seconds window to count messages
const RATE_LIMIT_MAX_MESSAGES = 10 // Max messages before throttling
const RATE_LIMIT_COOLDOWN = 5000 // 5 seconds cooldown for held messages

interface ChatState {
  // Current conversation
  conversationId: string | null
  conversationType: 'dm' | 'group' | null
  currentUserId: string | null
  currentUserProfile: {
    username: string
    tag: string
    display_name: string | null
    avatar_url: string | null
  } | null

  // Messages for current conversation
  messages: Message[]
  loadingMessages: boolean
  loadingOlderMessages: boolean
  hasMoreMessages: boolean

  // Typing users
  typingUsers: Map<string, string>

  // Connection status
  connectionStatus: 'connected' | 'connecting' | 'disconnected'

  // Rate limiting
  recentMessageTimestamps: number[]
  heldMessageTimer: ReturnType<typeof setTimeout> | null

  // Actions
  initializeWebSocket: (userId: string, token: string, userProfile?: { username: string; tag: string; display_name: string | null; avatar_url: string | null }) => Promise<void>
  switchConversation: (conversationId: string, conversationType: 'dm' | 'group') => Promise<void>
  loadOlderMessages: () => Promise<void>
  sendMessage: (content: string, replyToId?: string, attachmentUrl?: string, mentions?: string[]) => void
  sendBlockedMessage: (content: string, replyToId?: string, attachmentUrl?: string) => void
  sendTyping: (isTyping: boolean) => void
  addMessage: (message: Message) => void
  updateMessageStatus: (clientId: string, status: 'sent' | 'failed' | 'held', messageId?: string) => void
  editMessage: (messageId: string, newContent: string) => void
  deleteMessage: (messageId: string) => void
  addReaction: (messageId: string, emoji: string) => void
  removeReaction: (messageId: string, emoji: string) => void
  clearMessages: () => void
  processHeldMessages: () => void
}

// Check if the browser tab is actually focused/visible
function isTabVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

// Debounced mark-as-read for incoming messages while viewing a conversation
// Prevents spamming the DB on every single message during active chat
let markAsReadTimer: ReturnType<typeof setTimeout> | null = null
function debouncedMarkAsRead(conversationId: string, conversationType: 'dm' | 'group', userId: string) {
  if (markAsReadTimer) clearTimeout(markAsReadTimer)
  markAsReadTimer = setTimeout(() => {
    const supabaseClient = createClient()
    if (conversationType === 'dm') {
      supabaseClient.rpc('mark_dm_messages_as_read', {
        p_dm_channel_id: conversationId,
        p_user_id: userId
      }).then(() => console.log('[ChatStore] Debounced mark-as-read (active chat)'))
    } else {
      supabaseClient.rpc('mark_group_messages_as_read', {
        p_group_chat_id: conversationId,
        p_user_id: userId
      }).then(() => console.log('[ChatStore] Debounced mark-as-read (active chat)'))
    }
    wsManager.markAsRead(conversationId, conversationType)
  }, 1000)
}

export const useChatStore = create<ChatState>((set, get) => {
  // Set up WebSocket event listeners (only once)
  wsManager.onMessage((data) => {
    if (data.type === 'persisted') {
      // Update message status
      get().updateMessageStatus(data.client_id, 'sent', data.message_id)
    } else if (data.type === 'failed') {
      // Mark message as failed
      get().updateMessageStatus(data.client_id, 'failed')
    } else {
      // New message received
      const state = get()

      // Check if message already exists
      const exists = state.messages.some(m =>
        (m.user_id === data.user_id && m.content === data.content && m.created_at === data.created_at) ||
        (data.message_id && m.id === data.message_id)
      )

      if (!exists) {
        const newMessage: Message = {
          id: data.message_id || data.client_id,
          client_id: data.client_id,
          user_id: data.user_id,
          content: data.content,
          created_at: data.created_at,
          edited_at: data.edited_at,
          status: 'received',
          user: data.user,
          reply_to_id: data.reply_to_id,
          attachment_url: data.attachment_url,
          mentions: data.mentions,
          message_type: data.message_type,
          metadata: data.metadata
        }

        console.log('[ChatStore] Adding new message:', newMessage.content, 'reply_to_id:', newMessage.reply_to_id)
        set(state => ({ messages: [...state.messages, newMessage] }))

        // Handle notification if from other user
        if (data.user_id !== state.currentUserId) {
          const messageRoom = `${data.conversation_type}:${data.conversation_id}`
          const currentRoom = wsManager.getCurrentRoom()

          console.log('[ChatStore] Message from other user, current room:', currentRoom, 'message room:', messageRoom, 'tab visible:', isTabVisible())

          if (currentRoom === messageRoom && isTabVisible()) {
            // User is ACTIVELY viewing this conversation (tab focused) - mark as read in DB (debounced)
            if (state.currentUserId && state.conversationId && state.conversationType) {
              debouncedMarkAsRead(state.conversationId, state.conversationType, state.currentUserId)
            }
          } else {
            // Either different conversation OR tab is hidden - update tab title + play sound
            useNotificationStore.getState().incrementUnread(data.conversation_id, data.conversation_type)

            const userStatus = useNotificationStore.getState().userStatus
            const isMuted = useBlockStore.getState().isMuted(data.conversation_id)
            if (shouldPlaySound(userStatus) && !isMuted) {
              notificationSound?.playNotification()
            }
          }
        }
      }
    }
  })

  wsManager.onTyping(({ userId, username, typing, conversationId, conversationType }) => {
    const state = get()
    if (userId === state.currentUserId) return

    // Only show typing for the conversation we're currently viewing
    if (conversationId !== state.conversationId || conversationType !== state.conversationType) return

    set(state => {
      const newTypingUsers = new Map(state.typingUsers)
      if (typing) {
        newTypingUsers.set(userId, username)
      } else {
        newTypingUsers.delete(userId)
      }
      return { typingUsers: newTypingUsers }
    })
  })

  wsManager.onConnectionStatus((status) => {
    console.log('[ChatStore] Connection status:', status)
    set({ connectionStatus: status })
  })

  // Listen for message edits
  wsManager.onMessageEdited((data) => {
    const state = get()
    // Only update if it's for the current conversation
    if (state.conversationId === data.conversation_id && state.conversationType === data.conversation_type) {
      console.log('[ChatStore] Message edited:', data.message_id)
      set(state => ({
        messages: state.messages.map(m =>
          m.id === data.message_id
            ? { ...m, content: data.content, edited_at: data.edited_at }
            : m
        )
      }))
    }
  })

  // Listen for message deletes
  wsManager.onMessageDeleted((data) => {
    const state = get()
    // Only update if it's for the current conversation
    if (state.conversationId === data.conversation_id && state.conversationType === data.conversation_type) {
      console.log('[ChatStore] Message deleted:', data.message_id)
      set(state => ({
        messages: state.messages.filter(m => m.id !== data.message_id)
      }))
    }
  })

  // Listen for reaction updates
  wsManager.onReaction((data) => {
    const state = get()
    if (state.conversationId === data.conversation_id && state.conversationType === data.conversation_type) {
      console.log('[ChatStore] Reaction update:', data.action, data.emoji, 'on', data.message_id)
      set(state => ({
        messages: state.messages.map(m => {
          if (m.id !== data.message_id) return m

          const reactions = [...(m.reactions || [])]
          const existingIdx = reactions.findIndex(r => r.emoji === data.emoji)

          if (data.action === 'add') {
            if (existingIdx >= 0) {
              // Add user to existing emoji group (avoid duplicates)
              const existing = reactions[existingIdx]
              if (!existing.users.some(u => u.id === data.user_id)) {
                reactions[existingIdx] = {
                  ...existing,
                  users: [...existing.users, { id: data.user_id, username: data.username }]
                }
              }
            } else {
              // New emoji reaction group
              reactions.push({ emoji: data.emoji, users: [{ id: data.user_id, username: data.username }] })
            }
          } else if (data.action === 'remove') {
            if (existingIdx >= 0) {
              const filtered = reactions[existingIdx].users.filter(u => u.id !== data.user_id)
              if (filtered.length === 0) {
                reactions.splice(existingIdx, 1)
              } else {
                reactions[existingIdx] = { ...reactions[existingIdx], users: filtered }
              }
            }
          }

          return { ...m, reactions }
        })
      }))
    }
  })

  return {
    conversationId: null,
    conversationType: null,
    currentUserId: null,
    currentUserProfile: null,
    messages: [],
    loadingMessages: false,
    loadingOlderMessages: false,
    hasMoreMessages: true,
    typingUsers: new Map(),
    connectionStatus: 'disconnected',
    recentMessageTimestamps: [],
    heldMessageTimer: null,

    initializeWebSocket: async (userId: string, token: string, userProfile?: { username: string; tag: string; display_name: string | null; avatar_url: string | null }) => {
      console.log('[ChatStore] Initializing WebSocket for user:', userId)

      // Check if already connected BEFORE setting connecting status
      if (wsManager.isConnected()) {
        console.log('[ChatStore] WebSocket already connected, skipping init')
        set({ currentUserId: userId, currentUserProfile: userProfile || null })
        return
      }

      set({ currentUserId: userId, currentUserProfile: userProfile || null, connectionStatus: 'connecting' })
      await wsManager.connect(userId, token)
    },

    switchConversation: async (conversationId: string, conversationType: 'dm' | 'group') => {
      console.log('[ChatStore] Switching to:', conversationType, conversationId)

      const state = get()

      // Clear unread notifications for this conversation (locally)
      useNotificationStore.getState().clearUnread(conversationId, conversationType)

      // Mark as read in DATABASE (fire-and-forget to avoid race condition)
      // If we await this, a slow mark-as-read can cause the state set below
      // to be delayed, letting a faster second switch overwrite and then get
      // overwritten back when this finally completes
      const supabaseClient = createClient()
      if (conversationType === 'dm') {
        Promise.resolve(supabaseClient.rpc('mark_dm_messages_as_read', {
          p_dm_channel_id: conversationId,
          p_user_id: state.currentUserId
        })).then(() => console.log('[ChatStore] Marked messages as read in database'))
           .catch((error: unknown) => console.error('[ChatStore] Error marking as read:', error))
      } else {
        Promise.resolve(supabaseClient.rpc('mark_group_messages_as_read', {
          p_group_chat_id: conversationId,
          p_user_id: state.currentUserId
        })).then(() => console.log('[ChatStore] Marked messages as read in database'))
           .catch((error: unknown) => console.error('[ChatStore] Error marking as read:', error))
      }

      // Mark conversation as read via WebSocket (broadcasts to all tabs)
      wsManager.markAsRead(conversationId, conversationType)

      // Set loading and clear old messages immediately (no await above, so this runs synchronously)
      set({
        conversationId,
        conversationType,
        loadingMessages: true,
        loadingOlderMessages: false,
        hasMoreMessages: true,
        messages: [],
        typingUsers: new Map()
      })

      // Switch WebSocket room
      wsManager.switchRoom(conversationId, conversationType)

      // Load messages from database
      const supabase = supabaseClient

      try {
        let query

        // Load NEWEST 50 messages (descending order, then reverse for display)
        if (conversationType === 'dm') {
          query = supabase
            .from('direct_messages')
            .select(`
              id,
              content,
              created_at,
              edited_at,
              user_id,
              reply_to_id,
              attachment_url,
              mentions,
              user:profiles!direct_messages_user_id_fkey(
                id,
                username,
                tag,
                display_name,
                avatar_url
              )
            `)
            .eq('dm_channel_id', conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })  // Newest first
            .limit(50)
        } else {
          query = supabase
            .from('group_chat_messages')
            .select(`
              id,
              content,
              created_at,
              edited_at,
              user_id,
              reply_to_id,
              attachment_url,
              mentions,
              message_type,
              metadata,
              profiles:user_id(
                id,
                username,
                tag,
                display_name,
                avatar_url
              )
            `)
            .eq('group_chat_id', conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })  // Newest first
            .limit(50)
        }

        const { data, error } = await query

        if (error) throw error

        // CRITICAL: Check if conversation has changed while we were loading
        // This prevents race condition where slow query overwrites fast query results
        const currentState = get()
        if (currentState.conversationId !== conversationId) {
          console.log('[ChatStore] Conversation changed during load, ignoring stale results')
          return
        }

        if (data) {
          // Reverse to show oldest first (we fetched newest first)
          const formattedMessages: Message[] = data.map((msg: any) => ({
            id: msg.id,
            user_id: msg.user_id,
            content: msg.content,
            created_at: msg.created_at,
            edited_at: msg.edited_at,
            status: 'received' as const,
            user: conversationType === 'dm' ? msg.user : msg.profiles,
            reply_to_id: msg.reply_to_id,
            attachment_url: msg.attachment_url,
            mentions: msg.mentions,
            message_type: msg.message_type,
            metadata: msg.metadata
          })).reverse()  // Reverse for chronological display

          const hasMore = data.length === 50  // If we got 50, there might be more
          console.log('[ChatStore] Loaded', formattedMessages.length, 'messages, hasMore:', hasMore)

          // Load reactions for these messages
          const messageIds = formattedMessages.map(m => m.id)
          if (messageIds.length > 0) {
            const { data: reactionsData } = await supabase
              .from('message_reactions')
              .select('message_id, emoji, user_id, profiles:user_id(id, username)')
              .in('message_id', messageIds)
              .eq('message_type', conversationType)

            if (reactionsData && reactionsData.length > 0) {
              // Group reactions by message_id -> emoji -> users
              const reactionsByMessage = new Map<string, ReactionGroup[]>()
              reactionsData.forEach((r: any) => {
                if (!reactionsByMessage.has(r.message_id)) {
                  reactionsByMessage.set(r.message_id, [])
                }
                const groups = reactionsByMessage.get(r.message_id)!
                const existing = groups.find(g => g.emoji === r.emoji)
                const user = { id: r.profiles?.id || r.user_id, username: r.profiles?.username || 'Unknown' }
                if (existing) {
                  existing.users.push(user)
                } else {
                  groups.push({ emoji: r.emoji, users: [user] })
                }
              })

              // Merge reactions into messages
              formattedMessages.forEach(msg => {
                msg.reactions = reactionsByMessage.get(msg.id) || []
              })
            }
          }

          set({ messages: formattedMessages, loadingMessages: false, hasMoreMessages: hasMore })
        } else {
          set({ loadingMessages: false, hasMoreMessages: false })
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load messages:', error)
        // Only update loading state if still on the same conversation
        const currentState = get()
        if (currentState.conversationId === conversationId) {
          set({ loadingMessages: false })
        }
      }
    },

    loadOlderMessages: async () => {
      const state = get()
      if (!state.conversationId || !state.conversationType || state.loadingOlderMessages || !state.hasMoreMessages) {
        return
      }

      // Get the oldest message's timestamp to load messages before it
      const oldestMessage = state.messages[0]
      if (!oldestMessage) return

      console.log('[ChatStore] Loading older messages before:', oldestMessage.created_at)

      // Capture conversation ID to check for race conditions
      const loadingConversationId = state.conversationId
      const loadingConversationType = state.conversationType

      set({ loadingOlderMessages: true })

      const supabase = createClient()

      try {
        let query

        if (loadingConversationType === 'dm') {
          query = supabase
            .from('direct_messages')
            .select(`
              id,
              content,
              created_at,
              edited_at,
              user_id,
              reply_to_id,
              attachment_url,
              mentions,
              user:profiles!direct_messages_user_id_fkey(
                id,
                username,
                tag,
                display_name,
                avatar_url
              )
            `)
            .eq('dm_channel_id', loadingConversationId)
            .is('deleted_at', null)
            .lt('created_at', oldestMessage.created_at)  // Before oldest message
            .order('created_at', { ascending: false })  // Newest first (of the older batch)
            .limit(50)
        } else {
          query = supabase
            .from('group_chat_messages')
            .select(`
              id,
              content,
              created_at,
              edited_at,
              user_id,
              reply_to_id,
              attachment_url,
              mentions,
              message_type,
              metadata,
              profiles:user_id(
                id,
                username,
                tag,
                display_name,
                avatar_url
              )
            `)
            .eq('group_chat_id', loadingConversationId)
            .is('deleted_at', null)
            .lt('created_at', oldestMessage.created_at)  // Before oldest message
            .order('created_at', { ascending: false })  // Newest first (of the older batch)
            .limit(50)
        }

        const { data, error } = await query

        if (error) throw error

        // CRITICAL: Check if conversation has changed while we were loading
        const currentState = get()
        if (currentState.conversationId !== loadingConversationId) {
          console.log('[ChatStore] Conversation changed during older messages load, ignoring stale results')
          return
        }

        if (data && data.length > 0) {
          // Reverse to show oldest first, then prepend to existing messages
          const olderMessages: Message[] = data.map((msg: any) => ({
            id: msg.id,
            user_id: msg.user_id,
            content: msg.content,
            created_at: msg.created_at,
            edited_at: msg.edited_at,
            status: 'received' as const,
            user: loadingConversationType === 'dm' ? msg.user : msg.profiles,
            reply_to_id: msg.reply_to_id,
            attachment_url: msg.attachment_url,
            mentions: msg.mentions,
            message_type: msg.message_type,
            metadata: msg.metadata
          })).reverse()  // Reverse for chronological order

          const hasMore = data.length === 50
          console.log('[ChatStore] Loaded', olderMessages.length, 'older messages, hasMore:', hasMore)

          // Load reactions for older messages
          const olderMessageIds = olderMessages.map(m => m.id)
          if (olderMessageIds.length > 0) {
            const { data: reactionsData } = await supabase
              .from('message_reactions')
              .select('message_id, emoji, user_id, profiles:user_id(id, username)')
              .in('message_id', olderMessageIds)
              .eq('message_type', loadingConversationType)

            if (reactionsData && reactionsData.length > 0) {
              const reactionsByMessage = new Map<string, ReactionGroup[]>()
              reactionsData.forEach((r: any) => {
                if (!reactionsByMessage.has(r.message_id)) {
                  reactionsByMessage.set(r.message_id, [])
                }
                const groups = reactionsByMessage.get(r.message_id)!
                const existing = groups.find(g => g.emoji === r.emoji)
                const user = { id: r.profiles?.id || r.user_id, username: r.profiles?.username || 'Unknown' }
                if (existing) {
                  existing.users.push(user)
                } else {
                  groups.push({ emoji: r.emoji, users: [user] })
                }
              })
              olderMessages.forEach(msg => {
                msg.reactions = reactionsByMessage.get(msg.id) || []
              })
            }
          }

          set(state => ({
            messages: [...olderMessages, ...state.messages],
            loadingOlderMessages: false,
            hasMoreMessages: hasMore
          }))
        } else {
          console.log('[ChatStore] No more older messages')
          set({ loadingOlderMessages: false, hasMoreMessages: false })
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load older messages:', error)
        // Only update loading state if still on the same conversation
        const currentState = get()
        if (currentState.conversationId === loadingConversationId) {
          set({ loadingOlderMessages: false })
        }
      }
    },

    sendMessage: (content: string, replyToId?: string, attachmentUrl?: string, mentions?: string[]) => {
      const state = get()
      if (!state.conversationId || !state.conversationType || !state.currentUserId) return

      const now = Date.now()
      const clientId = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      // Clean up old timestamps outside the rate limit window
      const recentTimestamps = state.recentMessageTimestamps.filter(
        ts => now - ts < RATE_LIMIT_WINDOW
      )

      // Check if there are any held messages or if we've exceeded rate limit
      const hasHeldMessages = state.messages.some(m => m.status === 'held')
      const isRateLimited = recentTimestamps.length >= RATE_LIMIT_MAX_MESSAGES || hasHeldMessages

      // Determine message status
      const messageStatus: 'sending' | 'held' = isRateLimited ? 'held' : 'sending'

      // Add optimistic message
      const optimisticMessage: Message = {
        id: clientId,
        client_id: clientId,
        user_id: state.currentUserId,
        content: content.trim(),
        created_at: createdAt,
        edited_at: null,
        status: messageStatus,
        user: {
          id: state.currentUserId,
          username: state.currentUserProfile?.username || 'You',
          tag: state.currentUserProfile?.tag || '',
          display_name: state.currentUserProfile?.display_name || null,
          avatar_url: state.currentUserProfile?.avatar_url || null
        },
        reply_to_id: replyToId || null,
        attachment_url: attachmentUrl || null,
        mentions: mentions || null
      }

      if (isRateLimited) {
        // Message is held - add to messages but don't send yet
        console.log('[ChatStore] Rate limited - holding message:', clientId)

        // Clear existing timer and set new one (reset cooldown)
        if (state.heldMessageTimer) {
          clearTimeout(state.heldMessageTimer)
        }

        const timer = setTimeout(() => {
          get().processHeldMessages()
        }, RATE_LIMIT_COOLDOWN)

        set(state => ({
          messages: [...state.messages, optimisticMessage],
          heldMessageTimer: timer
        }))
      } else {
        // Normal send - add timestamp and send via WebSocket
        set(state => ({
          messages: [...state.messages, optimisticMessage],
          recentMessageTimestamps: [...recentTimestamps, now]
        }))

        // Send via WebSocket
        wsManager.sendMessage(
          state.conversationId!,
          state.conversationType!,
          content.trim(),
          clientId,
          replyToId,
          attachmentUrl,
          mentions
        )
      }
    },

    // Send a message that will be shown as 'blocked' - NOT sent via WebSocket
    sendBlockedMessage: (content: string, replyToId?: string, attachmentUrl?: string) => {
      const state = get()
      if (!state.currentUserId) return

      const clientId = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      // Add message with 'blocked' status - it will NOT be sent via WebSocket
      const blockedMessage: Message = {
        id: clientId,
        client_id: clientId,
        user_id: state.currentUserId,
        content: content.trim(),
        created_at: createdAt,
        edited_at: null,
        status: 'blocked',
        user: {
          id: state.currentUserId,
          username: state.currentUserProfile?.username || 'You',
          tag: state.currentUserProfile?.tag || '',
          display_name: state.currentUserProfile?.display_name || null,
          avatar_url: state.currentUserProfile?.avatar_url || null
        },
        reply_to_id: replyToId || null,
        attachment_url: attachmentUrl || null
      }

      set(state => ({ messages: [...state.messages, blockedMessage] }))
      // Note: We do NOT call wsManager.sendMessage - the message stays local only
    },

    sendTyping: (isTyping: boolean) => {
      const state = get()
      if (!state.conversationId || !state.conversationType) return

      wsManager.sendTyping(state.conversationId, state.conversationType, isTyping)
    },

    addMessage: (message: Message) => {
      set(state => ({ messages: [...state.messages, message] }))
    },

    updateMessageStatus: (clientId: string, status: 'sent' | 'failed' | 'held', messageId?: string) => {
      set(state => ({
        messages: state.messages.map(m =>
          m.client_id === clientId
            ? { ...m, status, ...(messageId ? { id: messageId } : {}) }
            : m
        )
      }))
    },

    editMessage: (messageId: string, newContent: string) => {
      const state = get()
      if (!state.conversationId || !state.conversationType) return

      console.log('[ChatStore] Editing message:', messageId, newContent)

      // Optimistic update
      const edited_at = new Date().toISOString()
      set(state => ({
        messages: state.messages.map(m =>
          m.id === messageId
            ? { ...m, content: newContent.trim(), edited_at }
            : m
        )
      }))

      // Send via WebSocket
      wsManager.emitMessageEdit(messageId, state.conversationId, state.conversationType, newContent.trim())
    },

    deleteMessage: (messageId: string) => {
      const state = get()
      if (!state.conversationId || !state.conversationType) return

      console.log('[ChatStore] Deleting message:', messageId)

      // Optimistic update - remove from list
      set(state => ({
        messages: state.messages.filter(m => m.id !== messageId)
      }))

      // Send via WebSocket
      wsManager.emitMessageDelete(messageId, state.conversationId, state.conversationType)
    },

    addReaction: (messageId: string, emoji: string) => {
      const state = get()
      if (!state.conversationId || !state.conversationType || !state.currentUserId) return

      // Optimistic update
      set(state => ({
        messages: state.messages.map(m => {
          if (m.id !== messageId) return m
          const reactions = [...(m.reactions || [])]
          const existingIdx = reactions.findIndex(r => r.emoji === emoji)
          if (existingIdx >= 0) {
            const existing = reactions[existingIdx]
            if (!existing.users.some(u => u.id === state.currentUserId)) {
              reactions[existingIdx] = { ...existing, users: [...existing.users, { id: state.currentUserId!, username: state.currentUserProfile?.username || 'You' }] }
            }
          } else {
            reactions.push({ emoji, users: [{ id: state.currentUserId!, username: state.currentUserProfile?.username || 'You' }] })
          }
          return { ...m, reactions }
        })
      }))

      wsManager.emitReactionAdd(messageId, state.conversationId, state.conversationType, emoji)
    },

    removeReaction: (messageId: string, emoji: string) => {
      const state = get()
      if (!state.conversationId || !state.conversationType || !state.currentUserId) return

      // Optimistic update
      set(state => ({
        messages: state.messages.map(m => {
          if (m.id !== messageId) return m
          const reactions = [...(m.reactions || [])]
          const existingIdx = reactions.findIndex(r => r.emoji === emoji)
          if (existingIdx >= 0) {
            const filtered = reactions[existingIdx].users.filter(u => u.id !== state.currentUserId)
            if (filtered.length === 0) {
              reactions.splice(existingIdx, 1)
            } else {
              reactions[existingIdx] = { ...reactions[existingIdx], users: filtered }
            }
          }
          return { ...m, reactions }
        })
      }))

      wsManager.emitReactionRemove(messageId, state.conversationId, state.conversationType, emoji)
    },

    clearMessages: () => {
      set({ messages: [] })
    },

    processHeldMessages: () => {
      const state = get()
      if (!state.conversationId || !state.conversationType) return

      const heldMessages = state.messages.filter(m => m.status === 'held')
      if (heldMessages.length === 0) {
        set({ heldMessageTimer: null })
        return
      }

      console.log('[ChatStore] Processing', heldMessages.length, 'held messages')

      // Update all held messages to 'sending' status
      set(state => ({
        messages: state.messages.map(m =>
          m.status === 'held' ? { ...m, status: 'sending' as const } : m
        ),
        heldMessageTimer: null,
        recentMessageTimestamps: [] // Reset timestamps after cooldown
      }))

      // Send held messages one at a time with a small delay between each
      // This prevents overwhelming the WebSocket server
      const conversationId = state.conversationId!
      const conversationType = state.conversationType!

      heldMessages.forEach((msg, index) => {
        setTimeout(() => {
          wsManager.sendMessage(
            conversationId,
            conversationType,
            msg.content,
            msg.client_id!,
            msg.reply_to_id || undefined,
            msg.attachment_url || undefined
          )
        }, index * 100) // 100ms delay between each message
      })
    }
  }
})

// When the browser tab becomes visible again, mark the current conversation as read
// This clears the unread count that accumulated while the tab was hidden
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const state = useChatStore.getState()
      if (state.conversationId && state.conversationType && state.currentUserId) {
        debouncedMarkAsRead(state.conversationId, state.conversationType, state.currentUserId)
        useNotificationStore.getState().clearUnread(state.conversationId, state.conversationType)
      }
    }
  })
}
