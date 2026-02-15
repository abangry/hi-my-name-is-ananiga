import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore } from '@/lib/stores/notification-store'

export function useUnreadMessages(userId: string | null) {
  const { fetchUnreadFromDatabase } = useNotificationStore()

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // Fetch initial unread counts
    console.log('[useUnreadMessages] Fetching initial unread counts')
    fetchUnreadFromDatabase(userId)

    // Subscribe to message changes to refresh counts
    const channel = supabase
      .channel('unread_messages_subscription')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          console.log('[useUnreadMessages] New DM detected, refreshing counts')

          // Check if user is ACTIVELY viewing this DM (same room AND tab visible)
          const wsManager = require('@/lib/websocket-manager').wsManager
          const currentRoom = wsManager.getCurrentRoom()
          const dmChannelId = (payload.new as any)?.dm_channel_id
          const messageRoom = `dm:${dmChannelId}`

          if (currentRoom === messageRoom && document.visibilityState === 'visible') {
            console.log('[useUnreadMessages] Skipping count update - actively viewing this DM')
            return
          }

          fetchUnreadFromDatabase(userId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
        },
        (payload) => {
          console.log('[useUnreadMessages] New group message detected, refreshing counts')

          // Check if user is ACTIVELY viewing this group (same room AND tab visible)
          const wsManager = require('@/lib/websocket-manager').wsManager
          const currentRoom = wsManager.getCurrentRoom()
          const groupChatId = (payload.new as any)?.group_chat_id
          const messageRoom = `group:${groupChatId}`

          if (currentRoom === messageRoom && document.visibilityState === 'visible') {
            console.log('[useUnreadMessages] Skipping count update - actively viewing this group')
            return
          }

          fetchUnreadFromDatabase(userId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_message_read_receipts',
        },
        () => {
          console.log('[useUnreadMessages] Read receipt added, refreshing counts')
          fetchUnreadFromDatabase(userId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_chat_members',
        },
        (payload) => {
          // Only refresh if last_read_at changed
          if (payload.new && (payload.new as any).last_read_at !== (payload.old as any)?.last_read_at) {
            console.log('[useUnreadMessages] last_read_at updated, refreshing counts')
            fetchUnreadFromDatabase(userId)
          }
        }
      )
      .subscribe((status) => {
        console.log('[useUnreadMessages] Subscription status:', status)
      })

    return () => {
      console.log('[useUnreadMessages] Cleaning up subscription')
      supabase.removeChannel(channel)
    }
  }, [userId, fetchUnreadFromDatabase])
}
