import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

interface UnreadCount {
  conversationId: string
  conversationType: 'dm' | 'group'
  count: number
  lastMessageAt: string
}

interface NotificationState {
  // Unread counts per conversation (FROM DATABASE)
  unreadCounts: Map<string, UnreadCount>

  // Total unread count
  totalUnread: number

  // User status (for DND check)
  userStatus: 'online' | 'idle' | 'dnd' | 'offline'

  // Actions
  fetchUnreadFromDatabase: (userId: string) => Promise<void>
  incrementUnread: (conversationId: string, conversationType: 'dm' | 'group') => void
  clearUnread: (conversationId: string, conversationType: 'dm' | 'group') => void
  setUserStatus: (status: 'online' | 'idle' | 'dnd' | 'offline') => void
  getUnreadForConversation: (conversationId: string, conversationType: 'dm' | 'group') => number
  getTotalUnread: () => number
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCounts: new Map(),
  totalUnread: 0,
  userStatus: 'online',

  // FETCH UNREAD FROM DATABASE - This is the SOURCE OF TRUTH
  fetchUnreadFromDatabase: async (userId: string) => {
    const supabase = createClient()

    console.log('[NotificationStore] Fetching unread counts from database for user:', userId)

    const { data, error } = await supabase.rpc('get_all_unread_counts', {
      p_user_id: userId
    })

    if (error) {
      console.error('[NotificationStore] Error fetching unread counts:', error)
      return
    }

    if (data) {
      // CRITICAL: Don't show notifications for currently open conversation
      const wsManager = require('@/lib/websocket-manager').wsManager
      const currentRoom = wsManager.getCurrentRoom()

      console.log('[NotificationStore] Current room:', currentRoom)

      const newCounts = new Map<string, UnreadCount>()
      data.forEach((item: any) => {
        const key = `${item.conversation_type}:${item.conversation_id}`

        // Skip notification for currently open conversation ONLY if tab is visible
        // When tab is hidden, we want the count to show in the tab title
        if (currentRoom === key && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          console.log('[NotificationStore] Skipping notification for actively open conversation:', key)
          return
        }

        newCounts.set(key, {
          conversationId: item.conversation_id,
          conversationType: item.conversation_type,
          count: item.unread_count,
          lastMessageAt: new Date().toISOString()
        })
      })

      const totalUnread = Array.from(newCounts.values()).reduce((sum, item) => sum + item.count, 0)
      updateTabTitle(totalUnread)

      console.log('[NotificationStore] Loaded unread from DB:', totalUnread, 'Breakdown:', Array.from(newCounts.entries()))
      set({ unreadCounts: newCounts, totalUnread })
    }
  },

  // Increment unread count locally - used for immediate tab title updates
  // when a message arrives via WebSocket (no DB roundtrip needed)
  incrementUnread: (conversationId: string, conversationType: 'dm' | 'group') => {
    set((state) => {
      const newCounts = new Map(state.unreadCounts)
      const key = `${conversationType}:${conversationId}`
      const existing = newCounts.get(key)

      if (existing) {
        newCounts.set(key, { ...existing, count: existing.count + 1, lastMessageAt: new Date().toISOString() })
      } else {
        newCounts.set(key, { conversationId, conversationType, count: 1, lastMessageAt: new Date().toISOString() })
      }

      const totalUnread = Array.from(newCounts.values()).reduce((sum, item) => sum + item.count, 0)

      console.log('[NotificationStore] Increment unread:', key, 'Total:', totalUnread)
      updateTabTitle(totalUnread)

      return { unreadCounts: newCounts, totalUnread }
    })
  },

  // Clear unread - ONLY used locally, database is updated separately
  clearUnread: (conversationId: string, conversationType: 'dm' | 'group') => {
    set((state) => {
      const newCounts = new Map(state.unreadCounts)
      const key = `${conversationType}:${conversationId}`
      newCounts.delete(key)

      const totalUnread = Array.from(newCounts.values()).reduce((sum, item) => sum + item.count, 0)

      console.log('[NotificationStore] Clear unread:', key, 'Total:', totalUnread)

      // Update browser tab title
      updateTabTitle(totalUnread)

      return { unreadCounts: newCounts, totalUnread }
    })
  },

  setUserStatus: (status) => {
    set({ userStatus: status })
  },

  getUnreadForConversation: (conversationId: string, conversationType: 'dm' | 'group') => {
    const key = `${conversationType}:${conversationId}`
    return get().unreadCounts.get(key)?.count || 0
  },

  getTotalUnread: () => {
    return get().totalUnread
  }
}))

// Helper function to update browser tab title
function updateTabTitle(unreadCount: number) {
  const baseTitle = 'Chappy'

  if (unreadCount === 0) {
    document.title = baseTitle
  } else if (unreadCount > 99) {
    document.title = `99+ - ${baseTitle}`
  } else {
    document.title = `${unreadCount} - ${baseTitle}`
  }
}

// Helper to check if sound should play
export function shouldPlaySound(userStatus: 'online' | 'idle' | 'dnd' | 'offline'): boolean {
  return userStatus !== 'dnd'
}
