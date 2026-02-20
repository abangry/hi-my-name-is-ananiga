import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore } from '@/lib/stores/notification-store'
import { wsManager } from '@/lib/websocket-manager'

export function useUnreadMessages(userId: string | null) {
  const { fetchUnreadFromDatabase } = useNotificationStore()

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // Fetch initial unread counts
    console.log('[useUnreadMessages] Fetching initial unread counts')
    fetchUnreadFromDatabase(userId)

    // PRIMARY live-update path: sidebar:message WebSocket event.
    // This is the same reliable channel the sidebar already uses, so if the
    // sidebar updates live, so does the notification badge.
    const unsubSidebar = wsManager.onSidebarMessage((data) => {
      const currentRoom = wsManager.getCurrentRoom()
      const messageRoom = `${data.conversation_type}:${data.conversation_id}`

      // Only count as unread if the message is from someone else and we're not
      // actively looking at that conversation right now
      if (
        data.sender_id !== userId &&
        !(currentRoom === messageRoom && document.visibilityState === 'visible')
      ) {
        console.log('[useUnreadMessages] sidebar:message for unviewed conversation, refreshing counts')
        fetchUnreadFromDatabase(userId)
      }
    })

    // SECONDARY path: sidebar:read clears unread when another device/tab marks as read
    const unsubRead = wsManager.onSidebarRead(() => {
      fetchUnreadFromDatabase(userId)
    })

    // FALLBACK: Supabase postgres_changes as a backup for read-receipt clearing
    const channel = supabase
      .channel('unread_messages_subscription')
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
      console.log('[useUnreadMessages] Cleaning up subscriptions')
      unsubSidebar()
      unsubRead()
      supabase.removeChannel(channel)
    }
  }, [userId, fetchUnreadFromDatabase])
}
