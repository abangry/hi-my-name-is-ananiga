'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  client_id?: string
  user_id: string
  content: string
  created_at: string
  edited_at: string | null
  status: 'sending' | 'sent' | 'received' | 'failed'
  user: {
    id: string
    username: string
    tag: string
    display_name: string | null
    avatar_url: string | null
  }
  reply_to_id?: string | null
}

interface UseChatSocketOptions {
  conversationId: string
  conversationType: 'dm' | 'group'
  currentUserId: string
  onMessageReceived?: (message: Message) => void
}

export function useChatSocket({
  conversationId,
  conversationType,
  currentUserId,
  onMessageReceived
}: UseChatSocketOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [actualConversationId, setActualConversationId] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const socketRef = useRef<Socket | null>(null)
  const onMessageReceivedRef = useRef(onMessageReceived)
  const supabase = createClient()

  // Update callback ref when it changes
  useEffect(() => {
    onMessageReceivedRef.current = onMessageReceived
  }, [onMessageReceived])

  // Set conversation ID (already fetched by dm-chat-ws for DMs)
  useEffect(() => {
    // For both DMs and groups, use the ID directly
    // The dm-chat-ws component already fetches the DM channel ID
    if (conversationId) {
      setActualConversationId(conversationId)
    }
  }, [conversationId])

  // Initialize WebSocket connection
  useEffect(() => {
    if (!actualConversationId) return

    const initSocket = async () => {
      // Get Supabase session for JWT
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.error('[WS] No session token')
        setConnectionStatus('disconnected')
        return
      }

      console.log('[WS] Connecting to gateway...')

      const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {

        auth: {
          token: session.access_token
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      })

      // Connection events
      socket.on('connect', () => {
        console.log('[WS] Connected:', socket.id)
        setConnectionStatus('connected')

        // Join conversation room
        socket.emit('conversation:join', {
          conversation_id: actualConversationId,
          conversation_type: conversationType
        })
      })

      socket.on('disconnect', (reason) => {
        console.log('[WS] Disconnected:', reason)
        setConnectionStatus('disconnected')
      })

      socket.on('connect_error', (error) => {
        console.error('[WS] Connection error:', error.message)
        setConnectionStatus('disconnected')
      })

      // Message events
      socket.on('message:received', (msg) => {
        console.log('[WS] Message received:', msg)

        // Check if already exists (duplicate prevention)
        setMessages((prev) => {
          // Check if this exact message already exists in our array
          const exists = prev.some(m => {
            // Check by content + user_id + timestamp for exact match
            const isSameMessage =
              m.user_id === msg.user_id &&
              m.content === msg.content &&
              m.created_at === msg.created_at

            if (isSameMessage) {
              console.log('[WS] Duplicate message detected (same content+user+time):', msg.client_id)
              return true
            }

            // Also check by message_id if it's been persisted
            if (msg.message_id && m.id === msg.message_id) {
              console.log('[WS] Duplicate message detected (same message_id):', msg.message_id)
              return true
            }

            return false
          })

          if (exists) {
            console.log('[WS] Duplicate message, ignoring:', msg.client_id)
            return prev
          }

          const newMessage: Message = {
            id: msg.message_id || msg.client_id,
            client_id: msg.client_id,
            user_id: msg.user_id,
            content: msg.content,
            created_at: msg.created_at,
            edited_at: msg.edited_at,
            status: 'received',
            user: msg.user,
            reply_to_id: msg.reply_to_id
          }

          console.log('[WS] Adding new message to array:', newMessage.content)
          onMessageReceivedRef.current?.(newMessage)
          return [...prev, newMessage]
        })
      })

      socket.on('message:persisted', ({ client_id, message_id, created_at }) => {
        console.log('[WS] Message persisted:', { client_id, message_id })

        setMessages((prev) => prev.map(m =>
          m.client_id === client_id
            ? { ...m, id: message_id, created_at, status: 'sent' }
            : m
        ))
      })

      socket.on('message:failed', ({ client_id, error }) => {
        console.error('[WS] Message failed:', error)

        setMessages((prev) => prev.map(m =>
          m.client_id === client_id
            ? { ...m, status: 'failed' }
            : m
        ))
      })

      // Typing events
      socket.on('typing:update', ({ user_id, username, typing }) => {
        console.log('[WS] Typing update:', { user_id, username, typing })

        // Don't show typing indicator for self
        if (user_id === currentUserId) {
          return
        }

        setTypingUsers((prev) => {
          const next = new Map(prev)
          if (typing) {
            next.set(user_id, username)
          } else {
            next.delete(user_id)
          }
          return next
        })
      })

      socketRef.current = socket

      return () => {
        console.log('[WS] Cleaning up socket')
        socket.emit('conversation:leave', {
          conversation_id: actualConversationId,
          conversation_type: conversationType
        })
        socket.disconnect()
      }
    }

    initSocket()
  }, [actualConversationId, conversationType, currentUserId])

  // Send message
  const sendMessage = useCallback((content: string, replyToId?: string) => {
    if (!socketRef.current || !content.trim()) return

    const client_id = crypto.randomUUID()
    const created_at = new Date().toISOString()

    // Add optimistic message
    const optimisticMessage: Message = {
      id: client_id,
      client_id,
      user_id: currentUserId,
      content: content.trim(),
      created_at,
      edited_at: null,
      status: 'sending',
      user: {
        id: currentUserId,
        username: 'You',
        tag: '',
        display_name: null,
        avatar_url: null
      },
      reply_to_id: replyToId || null
    }

    console.log('[WS] Sending message:', client_id)
    setMessages((prev) => [...prev, optimisticMessage])

    // Send via WebSocket
    socketRef.current.emit('message:send', {
      client_id,
      conversation_id: actualConversationId,
      conversation_type: conversationType,
      content: content.trim(),
      reply_to_id: replyToId || null,
      created_at
    })
  }, [actualConversationId, conversationType, currentUserId])

  // Typing indicator
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!socketRef.current || !actualConversationId) return

    socketRef.current.emit(isTyping ? 'typing:start' : 'typing:stop', {
      conversation_id: actualConversationId,
      conversation_type: conversationType
    })
  }, [actualConversationId, conversationType])

  // Load initial messages from Supabase (history)
  const loadHistory = useCallback(async (limit = 50) => {
    if (!actualConversationId) return

    setLoadingHistory(true)
    try {
      let query

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
            user:profiles!direct_messages_user_id_fkey(
              id,
              username,
              tag,
              display_name,
              avatar_url
            )
          `)
          .eq('dm_channel_id', actualConversationId)
          .order('created_at', { ascending: true })
          .limit(limit)
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
            profiles:user_id(
              id,
              username,
              tag,
              display_name,
              avatar_url
            )
          `)
          .eq('group_chat_id', actualConversationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(limit)
      }

      const { data, error } = await query

      if (error) throw error

      if (data) {
        const formattedMessages: Message[] = data.map((msg: any) => ({
          id: msg.id,
          user_id: msg.user_id,
          content: msg.content,
          created_at: msg.created_at,
          edited_at: msg.edited_at,
          status: 'received',
          user: conversationType === 'dm' ? msg.user : msg.profiles,
          reply_to_id: msg.reply_to_id
        }))

        setMessages(formattedMessages)
        console.log('[History] Loaded', formattedMessages.length, 'messages')
      }
    } catch (error) {
      console.error('[History] Failed to load:', error)
    } finally {
      setLoadingHistory(false)
    }
  }, [actualConversationId, conversationType, supabase])

  // Retry failed message
  const retryMessage = useCallback((message: Message) => {
    if (!socketRef.current || !message.client_id) return

    // Update status to sending
    setMessages((prev) => prev.map(m =>
      m.id === message.id
        ? { ...m, status: 'sending' }
        : m
    ))

    // Resend
    socketRef.current.emit('message:send', {
      client_id: message.client_id,
      conversation_id: actualConversationId,
      conversation_type: conversationType,
      content: message.content,
      reply_to_id: message.reply_to_id || null,
      created_at: message.created_at
    })
  }, [actualConversationId, conversationType])

  return {
    messages,
    typingUsers,
    connectionStatus,
    loadingHistory,
    sendMessage,
    sendTyping,
    loadHistory,
    retryMessage
  }
}
