import { create } from 'zustand'
import {
  blockUser as blockUserAction,
  unblockUser as unblockUserAction,
  getBlockedUsers,
  muteConversation as muteConversationAction,
  unmuteConversation as unmuteConversationAction,
  getMutedConversations
} from '@/lib/actions/blocks'

interface BlockedUser {
  blocked_user_id: string
  username: string
  tag: string
  avatar_url: string | null
  blocked_at: string
}

interface MutedConversation {
  conversation_id: string
  conversation_type: 'dm' | 'group'
  muted_until: string | null
}

interface BlockState {
  blockedUsers: BlockedUser[]
  blockedUserIds: Set<string>
  mutedConversations: MutedConversation[]
  mutedConversationIds: Set<string>
  loading: boolean

  // Actions
  fetchBlockedUsers: () => Promise<void>
  fetchMutedConversations: () => Promise<void>
  blockUser: (userId: string) => Promise<{ success: boolean; error?: string }>
  unblockUser: (userId: string) => Promise<{ success: boolean; error?: string }>
  muteConversation: (conversationId: string, conversationType: 'dm' | 'group', durationMinutes: number | null) => Promise<{ success: boolean; error?: string }>
  unmuteConversation: (conversationId: string, conversationType: 'dm' | 'group') => Promise<{ success: boolean; error?: string }>
  isBlocked: (userId: string) => boolean
  isMuted: (conversationId: string) => boolean
  getMuteExpiry: (conversationId: string) => string | null
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blockedUsers: [],
  blockedUserIds: new Set(),
  mutedConversations: [],
  mutedConversationIds: new Set(),
  loading: false,

  fetchBlockedUsers: async () => {
    set({ loading: true })
    try {
      const users = await getBlockedUsers()
      const ids = new Set(users.map(u => u.blocked_user_id))
      set({ blockedUsers: users, blockedUserIds: ids })
    } catch (error) {
      console.error('Error fetching blocked users:', error)
    } finally {
      set({ loading: false })
    }
  },

  fetchMutedConversations: async () => {
    try {
      const mutes = await getMutedConversations()
      const ids = new Set(mutes.map(m => m.conversation_id))
      set({ mutedConversations: mutes, mutedConversationIds: ids })
    } catch (error) {
      console.error('Error fetching muted conversations:', error)
    }
  },

  blockUser: async (userId: string) => {
    const result = await blockUserAction(userId)
    if (result.success) {
      // Update local state immediately for instant UI response
      set(state => ({
        blockedUserIds: new Set([...state.blockedUserIds, userId])
      }))
      // Also fetch full data in background for blockedUsers array
      get().fetchBlockedUsers()
    }
    return result
  },

  unblockUser: async (userId: string) => {
    const result = await unblockUserAction(userId)
    if (result.success) {
      // Remove from local state immediately
      set(state => ({
        blockedUsers: state.blockedUsers.filter(u => u.blocked_user_id !== userId),
        blockedUserIds: new Set([...state.blockedUserIds].filter(id => id !== userId))
      }))
    }
    return result
  },

  muteConversation: async (conversationId: string, conversationType: 'dm' | 'group', durationMinutes: number | null) => {
    const result = await muteConversationAction(conversationId, conversationType, durationMinutes)
    if (result.success) {
      // Add to local state
      const mutedUntil = 'muted_until' in result ? result.muted_until : null
      const newMute: MutedConversation = {
        conversation_id: conversationId,
        conversation_type: conversationType,
        muted_until: mutedUntil || null
      }
      set(state => ({
        mutedConversations: [
          ...state.mutedConversations.filter(m => m.conversation_id !== conversationId),
          newMute
        ],
        mutedConversationIds: new Set([...state.mutedConversationIds, conversationId])
      }))
    }
    return result
  },

  unmuteConversation: async (conversationId: string, conversationType: 'dm' | 'group') => {
    const result = await unmuteConversationAction(conversationId, conversationType)
    if (result.success) {
      set(state => ({
        mutedConversations: state.mutedConversations.filter(m => m.conversation_id !== conversationId),
        mutedConversationIds: new Set([...state.mutedConversationIds].filter(id => id !== conversationId))
      }))
    }
    return result
  },

  isBlocked: (userId: string) => {
    return get().blockedUserIds.has(userId)
  },

  isMuted: (conversationId: string) => {
    const mute = get().mutedConversations.find(m => m.conversation_id === conversationId)
    if (!mute) return false

    // Check if mute has expired
    if (mute.muted_until) {
      const expiry = new Date(mute.muted_until)
      if (expiry < new Date()) {
        // Mute has expired, remove it from state
        set(state => ({
          mutedConversations: state.mutedConversations.filter(m => m.conversation_id !== conversationId),
          mutedConversationIds: new Set([...state.mutedConversationIds].filter(id => id !== conversationId))
        }))
        return false
      }
    }

    return true
  },

  getMuteExpiry: (conversationId: string) => {
    const mute = get().mutedConversations.find(m => m.conversation_id === conversationId)
    return mute?.muted_until || null
  }
}))
