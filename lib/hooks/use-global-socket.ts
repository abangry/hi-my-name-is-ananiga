'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { wsManager } from '@/lib/websocket-manager'

// Typing timeout - auto-clear if no stop event received
const TYPING_TIMEOUT_MS = 5000

interface SidebarMessageUpdate {
  conversation_id: string
  conversation_type: 'dm' | 'group'
  last_message: string
  last_message_at: string
  sender_id: string
}

interface SidebarReadUpdate {
  conversation_id: string
  conversation_type: 'dm' | 'group'
}

interface GroupLeftUpdate {
  group_id: string
  user_id: string
}

interface GroupMemberLeftUpdate {
  group_id: string
  user_id: string
  username: string
}

interface GroupInvitedUpdate {
  group_id: string
  group_name: string
  group_icon_url?: string
  invited_by: string
  invited_by_id: string
}

interface GroupMembersAddedUpdate {
  group_id: string
  new_members: { id: string; username: string }[]
  invited_by: string
  invited_by_id: string
}

interface GroupUpdatedUpdate {
  group_id: string
  name?: string
  icon_url?: string
  updated_by: string
  updated_by_id: string
}

interface FriendRequestUpdate {
  type: 'received' | 'accepted' | 'declined' | 'cancelled' | 'sent'
  from_user_id: string
  to_user_id: string
  username?: string
}

interface UserBlockUpdate {
  type: 'blocked' | 'unblocked'
  blocker_user_id: string
  blocked_user_id: string
}

/**
 * Hook for sidebar-specific WebSocket features
 * Uses the shared wsManager singleton - NO duplicate connections!
 */
export function useGlobalSocket(currentUserId: string) {
  const [typingMap, setTypingMap] = useState<Map<string, boolean>>(new Map())
  const [lastMessageUpdate, setLastMessageUpdate] = useState<SidebarMessageUpdate | null>(null)
  const [readUpdate, setReadUpdate] = useState<SidebarReadUpdate | null>(null)
  const [groupLeftUpdate, setGroupLeftUpdate] = useState<GroupLeftUpdate | null>(null)
  const [groupMemberLeftUpdate, setGroupMemberLeftUpdate] = useState<GroupMemberLeftUpdate | null>(null)
  const [groupInvitedUpdate, setGroupInvitedUpdate] = useState<GroupInvitedUpdate | null>(null)
  const [groupMembersAddedUpdate, setGroupMembersAddedUpdate] = useState<GroupMembersAddedUpdate | null>(null)
  const [groupUpdatedUpdate, setGroupUpdatedUpdate] = useState<GroupUpdatedUpdate | null>(null)
  const [friendRequestUpdate, setFriendRequestUpdate] = useState<FriendRequestUpdate | null>(null)
  const [userBlockUpdate, setUserBlockUpdate] = useState<UserBlockUpdate | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Helper to clear typing for a conversation key
  const clearTypingForKey = useCallback((key: string) => {
    const existingTimeout = typingTimeoutsRef.current.get(key)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      typingTimeoutsRef.current.delete(key)
    }
    setTypingMap((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  useEffect(() => {
    if (!currentUserId) return

    console.log('[useGlobalSocket] Setting up sidebar listeners')

    // Subscribe to typing events from shared wsManager
    const unsubTyping = wsManager.onTyping((data) => {
      // Don't track own typing
      if (data.userId === currentUserId) return

      const key = `${data.conversationType}:${data.conversationId}`

      // Clear any existing timeout for this key
      const existingTimeout = typingTimeoutsRef.current.get(key)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        typingTimeoutsRef.current.delete(key)
      }

      if (data.typing) {
        // Set typing indicator
        setTypingMap((prev) => {
          const next = new Map(prev)
          next.set(key, true)
          return next
        })

        // Set auto-clear timeout in case stop event is never received
        const timeout = setTimeout(() => {
          setTypingMap((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
          typingTimeoutsRef.current.delete(key)
        }, TYPING_TIMEOUT_MS)
        typingTimeoutsRef.current.set(key, timeout)
      } else {
        // Clear typing indicator
        setTypingMap((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }
    })

    // Subscribe to sidebar message updates
    const unsubMessage = wsManager.onSidebarMessage((data) => {
      // Clear typing indicator for this conversation (someone sent a message)
      const key = `${data.conversation_type}:${data.conversation_id}`
      clearTypingForKey(key)

      setLastMessageUpdate(data)
    })

    // Subscribe to sidebar read updates
    const unsubRead = wsManager.onSidebarRead((data) => {
      setReadUpdate(data)
    })

    // Subscribe to group left updates (for own user leaving)
    const unsubGroupLeft = wsManager.onGroupLeft((data) => {
      console.log('[useGlobalSocket] Group left update:', data)
      setGroupLeftUpdate(data)
    })

    // Subscribe to group member left updates (for other members leaving)
    const unsubGroupMemberLeft = wsManager.onGroupMemberLeft((data) => {
      console.log('[useGlobalSocket] Group member left update:', data)
      setGroupMemberLeftUpdate(data)
    })

    // Subscribe to group invited updates (when you get invited to a group)
    const unsubGroupInvited = wsManager.onGroupInvited((data) => {
      console.log('[useGlobalSocket] Group invited update:', data)
      setGroupInvitedUpdate(data)
    })

    // Subscribe to group members added updates (when new members join your group)
    const unsubGroupMembersAdded = wsManager.onGroupMembersAdded((data) => {
      console.log('[useGlobalSocket] Group members added update:', data)
      setGroupMembersAddedUpdate(data)
    })

    // Subscribe to group updated events (when group settings change)
    const unsubGroupUpdated = wsManager.onGroupUpdated((data) => {
      console.log('[useGlobalSocket] Group updated:', data)
      setGroupUpdatedUpdate(data)
    })

    // Subscribe to friend request updates
    const unsubFriendRequest = wsManager.onFriendRequest((data) => {
      console.log('[useGlobalSocket] Friend request update:', data)
      setFriendRequestUpdate(data)
    })

    // Subscribe to user block/unblock updates
    const unsubUserBlock = wsManager.onUserBlock((data) => {
      console.log('[useGlobalSocket] User block update:', data)
      setUserBlockUpdate(data)
    })

    // Cleanup - unsubscribe from events
    return () => {
      console.log('[useGlobalSocket] Cleaning up sidebar listeners')
      unsubTyping()
      unsubMessage()
      unsubRead()
      unsubGroupLeft()
      unsubGroupMemberLeft()
      unsubGroupInvited()
      unsubGroupMembersAdded()
      unsubGroupUpdated()
      unsubFriendRequest()
      unsubUserBlock()
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout))
      typingTimeoutsRef.current.clear()
    }
  }, [currentUserId, clearTypingForKey])

  return {
    typingMap,
    lastMessageUpdate,
    readUpdate,
    groupLeftUpdate,
    groupMemberLeftUpdate,
    groupInvitedUpdate,
    groupMembersAddedUpdate,
    groupUpdatedUpdate,
    friendRequestUpdate,
    userBlockUpdate
  }
}
