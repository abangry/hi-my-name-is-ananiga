"use client"

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react"
import { Circle, Crown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { UserContextMenu } from "@/components/ui/user-context-menu"
import { useChatStore } from "@/lib/stores/chat-store"
import { wsManager } from "@/lib/websocket-manager"

interface GroupMember {
  user_id: string
  username: string
  tag: string
  display_name: string | null
  avatar_url: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  custom_status: string | null
  is_owner: boolean
  profile_theme: 'light' | 'dark'
}

interface GroupMembersSidebarProps {
  groupChatId: string
  currentUserId: string
  onViewProfile: (userId: string) => void
}

export const GroupMembersSidebar = memo(function GroupMembersSidebar({ groupChatId, currentUserId, onViewProfile }: GroupMembersSidebarProps) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    userId: string
    username: string
    tag: string
    x: number
    y: number
  } | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<any>(null)
  const isSubscribedRef = useRef(false)
  const { messages } = useChatStore()
  const lastMessageCountRef = useRef(0)

  const fetchMembers = useCallback(async () => {
    try {
      // Fetch group members with their profile and presence data
      const { data: membersData, error } = await supabase
        .from('group_chat_members')
        .select(`
          user_id,
          is_owner,
          profiles!group_chat_members_user_id_fkey (
            username,
            tag,
            display_name,
            avatar_url,
            profile_theme
          )
        `)
        .eq('group_chat_id', groupChatId)

      if (error) {
        console.error('[GroupMembersSidebar] Query error:', error)
        throw error
      }

      if (!membersData) {
        setMembers([])
        setLoading(false)
        return
      }

      // Fetch presence data for all members
      const userIds = membersData.map(m => m.user_id)
      const { data: presenceData } = await supabase
        .from('user_presence')
        .select('user_id, status, custom_status')
        .in('user_id', userIds)

      // Combine the data
      const combinedMembers: GroupMember[] = membersData.map((member: any) => {
        const presence = presenceData?.find(p => p.user_id === member.user_id)
        const profile = member.profiles

        return {
          user_id: member.user_id,
          username: profile?.username || 'Unknown',
          tag: profile?.tag || '0000',
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url,
          status: presence?.status || 'offline',
          custom_status: presence?.custom_status,
          is_owner: member.is_owner,
          profile_theme: profile?.profile_theme || 'light'
        }
      })

      // Sort: owner first, then by status (online > idle > dnd > offline), then by name
      combinedMembers.sort((a, b) => {
        if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1

        const statusOrder = { online: 0, idle: 1, dnd: 2, offline: 3 }
        if (a.status !== b.status) {
          return statusOrder[a.status] - statusOrder[b.status]
        }

        const nameA = (a.display_name || a.username).toLowerCase()
        const nameB = (b.display_name || b.username).toLowerCase()
        return nameA.localeCompare(nameB)
      })

      setMembers(combinedMembers)
    } catch (error) {
      console.error('[GroupMembersSidebar] Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }, [groupChatId, supabase])

  // Fetch members when groupChatId changes
  useEffect(() => {
    console.log('[GroupMembersSidebar] Fetching members for group:', groupChatId)
    fetchMembers()
  }, [groupChatId, fetchMembers])

  // Watch for join/leave system messages and refetch members
  useEffect(() => {
    // Only process new messages
    if (messages.length <= lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length
      return
    }

    lastMessageCountRef.current = messages.length

    // Get the latest message
    const latestMessage = messages[messages.length - 1]

    // Check if it's a system message about joining, leaving, or inviting
    if (latestMessage && latestMessage.message_type) {
      const messageType = latestMessage.message_type

      if (messageType === 'system_join' || messageType === 'system_leave' || messageType === 'system_invite') {
        console.log('[GroupMembersSidebar] 🔄 Detected join/leave event, refetching members')
        fetchMembers()
      }
    }
  }, [messages, fetchMembers])

  // Subscribe to presence updates for all group members
  useEffect(() => {
    if (members.length === 0) return

    console.log('[GroupMembersSidebar] 🎯 Setting up presence subscription for', members.length, 'members')

    const memberIds = members.map(m => m.user_id)

    // Create a unique channel for this group's member presence
    const presenceChannel = supabase.channel(`group-members-presence-${groupChatId}`)

    presenceChannel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_presence',
      },
      (payload) => {
        const updatedUser = payload.new as { user_id: string; status: string; custom_status: string | null }

        // Only process if this user is a member of the group
        if (!memberIds.includes(updatedUser.user_id)) return

        console.log('[GroupMembersSidebar] 🎯 Presence update for member:', updatedUser.user_id, 'new status:', updatedUser.status)

        setMembers(prevMembers => {
          const updatedMembers = prevMembers.map(member => {
            if (member.user_id === updatedUser.user_id) {
              return {
                ...member,
                status: updatedUser.status as 'online' | 'idle' | 'dnd' | 'offline',
                custom_status: updatedUser.custom_status
              }
            }
            return member
          })

          // Re-sort members
          updatedMembers.sort((a, b) => {
            if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1
            const statusOrder: Record<string, number> = { online: 0, idle: 1, dnd: 2, offline: 3 }
            if (a.status !== b.status) {
              return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
            }
            const nameA = (a.display_name || a.username).toLowerCase()
            const nameB = (b.display_name || b.username).toLowerCase()
            return nameA.localeCompare(nameB)
          })

          return updatedMembers
        })
      }
    )

    presenceChannel.subscribe((status) => {
      console.log('[GroupMembersSidebar] 🔔 Presence subscription status:', status)
    })

    return () => {
      console.log('[GroupMembersSidebar] Cleaning up presence subscription')
      presenceChannel.unsubscribe()
    }
  }, [members, groupChatId, supabase])

  // Listen for profile updates (avatar, display name) from any member
  useEffect(() => {
    const unsubProfile = wsManager.onProfileUpdate((data) => {
      setMembers(prev => {
        const isMember = prev.some(m => m.user_id === data.user_id)
        if (!isMember) return prev
        return prev.map(m =>
          m.user_id === data.user_id
            ? { ...m, display_name: data.display_name, avatar_url: data.avatar_url, profile_theme: data.profile_theme }
            : m
        )
      })
    })
    return () => { unsubProfile() }
  }, [])

  // Listen for typing indicators
  useEffect(() => {
    const handleTyping = (data: { userId: string; username: string; typing: boolean; conversationId: string; conversationType: 'dm' | 'group' }) => {
      // Only process typing events for this group
      if (data.conversationType === 'group' && data.conversationId === groupChatId) {
        setTypingUsers(prev => {
          const newSet = new Set(prev)
          if (data.typing) {
            newSet.add(data.userId)
          } else {
            newSet.delete(data.userId)
          }
          return newSet
        })
      }
    }

    const unsubscribe = wsManager.onTyping(handleTyping)

    return () => {
      unsubscribe()
    }
  }, [groupChatId])

  // Set up subscription for member join/leave events
  useEffect(() => {
    // Clean up old subscription if group changed
    if (channelRef.current) {
      console.log('[GroupMembersSidebar] Cleaning up old subscription')
      channelRef.current.unsubscribe()
      channelRef.current = null
      isSubscribedRef.current = false
    }

    console.log('[GroupMembersSidebar] Setting up subscription for member join/leave events for group:', groupChatId)

    // Create channel - without timestamp to keep it stable
    const channel = supabase.channel(`group-members-join-leave-${groupChatId}`)

    // Subscribe to INSERT events (member joins)
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_chat_members',
        filter: `group_chat_id=eq.${groupChatId}`
      },
      async (payload) => {
        console.log('[GroupMembersSidebar] ✅ Member JOIN event:', payload)

        // Fetch the new member's data
        if (payload.new && 'user_id' in payload.new) {
          const newUserId = (payload.new as any).user_id

          // Get profile and presence for the new member
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username, tag, display_name, avatar_url, profile_theme')
            .eq('id', newUserId)
            .single()

          const { data: presenceData } = await supabase
            .from('user_presence')
            .select('status, custom_status')
            .eq('user_id', newUserId)
            .single()

          if (profileData) {
            const newMember: GroupMember = {
              user_id: newUserId,
              username: profileData.username || 'Unknown',
              tag: profileData.tag || '0000',
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url,
              status: presenceData?.status || 'offline',
              custom_status: presenceData?.custom_status,
              is_owner: (payload.new as any).is_owner || false,
              profile_theme: profileData.profile_theme || 'light'
            }

            console.log('[GroupMembersSidebar] Adding new member:', newMember.username)

            // Add the new member and re-sort
            setMembers(prev => {
              const updated = [...prev, newMember]
              updated.sort((a, b) => {
                if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1
                const statusOrder: Record<string, number> = { online: 0, idle: 1, dnd: 2, offline: 3 }
                if (a.status !== b.status) {
                  return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
                }
                const nameA = (a.display_name || a.username).toLowerCase()
                const nameB = (b.display_name || b.username).toLowerCase()
                return nameA.localeCompare(nameB)
              })
              return updated
            })
          }
        }
      }
    )

    // Subscribe to DELETE events (member leaves)
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'group_chat_members',
        filter: `group_chat_id=eq.${groupChatId}`
      },
      (payload) => {
        console.log('[GroupMembersSidebar] ✅ Member LEAVE event:', payload)

        // Remove the member from the list immediately
        if (payload.old && 'user_id' in payload.old) {
          const removedUserId = (payload.old as any).user_id
          console.log('[GroupMembersSidebar] Removing member:', removedUserId)
          setMembers(prev => prev.filter(m => m.user_id !== removedUserId))
        }
      }
    )

    // Subscribe and save reference
    channel.subscribe((status) => {
      console.log('[GroupMembersSidebar] 🔔 Join/Leave subscription status:', status)
      if (status === 'SUBSCRIBED') {
        isSubscribedRef.current = true
        console.log('[GroupMembersSidebar] ✅ Successfully subscribed to join/leave events')
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[GroupMembersSidebar] ❌ Channel subscription error')
      }
    })

    channelRef.current = channel

    return () => {
      console.log('[GroupMembersSidebar] Component unmounting, cleaning up join/leave subscription')
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [groupChatId, supabase])

  const handleContextMenu = (e: React.MouseEvent, member: GroupMember) => {
    e.preventDefault()
    setContextMenu({
      userId: member.user_id,
      username: member.username,
      tag: member.tag,
      x: e.clientX,
      y: e.clientY
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#23a559'
      case 'idle': return '#f0b232'
      case 'dnd': return '#f23f43'
      default: return '#80848e'
    }
  }

  const onlineMembers = members.filter(m => m.status !== 'offline')
  const offlineMembers = members.filter(m => m.status === 'offline')

  if (loading) {
    return (
      <div className="w-full sm:w-60 h-full bg-white border-l border-gray-200 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading members...</div>
      </div>
    )
  }

  return (
    <>
      <div className="w-full sm:w-60 h-full bg-gradient-to-b from-white to-gray-50 border-l border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Members — {members.length}
          </h3>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Online Members */}
          {onlineMembers.length > 0 && (
            <div>
              <div className="px-2 mb-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Online — {onlineMembers.length}
                </h4>
              </div>
              <div className="space-y-1">
                {onlineMembers.map((member) => {
                  const isDark = member.profile_theme === 'dark'
                  return (
                  <button
                    key={member.user_id}
                    onContextMenu={(e) => handleContextMenu(e, member)}
                    onClick={() => onViewProfile(member.user_id)}
                    className={`w-full px-2 py-2 rounded-xl transition-all duration-200 flex items-start gap-3 group ${
                      isDark ? 'bg-[#111] hover:bg-[#1a1a1a] border border-[#2a2a2a] shadow-sm' : 'hover:bg-gray-100'
                    }`}
                  >
                    {/* Avatar with Status */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-sm ring-2 ${isDark ? 'ring-[#111]' : 'ring-white'}`}>
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.username}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-sm font-bold">
                            {member.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {/* Status Indicator / Typing Indicator */}
                      {typingUsers.has(member.user_id) ? (
                        <div className={`absolute bottom-0 right-0 flex gap-[2px] border-2 rounded-full px-[2px] py-[1px] shadow-sm ${isDark ? 'border-[#111] bg-[#111]' : 'border-white bg-white'}`}>
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '0ms',
                              animationDuration: '1s'
                            }}
                          />
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '150ms',
                              animationDuration: '1s'
                            }}
                          />
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '300ms',
                              animationDuration: '1s'
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 shadow-sm ${isDark ? 'border-[#111]' : 'border-white'}`}
                          style={{ backgroundColor: getStatusColor(member.status) }}
                        />
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {member.display_name || member.username}
                        </span>
                        {member.is_owner && (
                          <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                      {member.custom_status ? (
                        <p className={`text-xs truncate font-medium ${isDark ? 'text-neutral-400' : 'text-gray-600'}`}>
                          {member.custom_status}
                        </p>
                      ) : (
                        <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>
                          @{member.username}
                        </p>
                      )}
                    </div>
                  </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Offline Members */}
          {offlineMembers.length > 0 && (
            <div>
              <div className="px-2 mb-2">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Offline — {offlineMembers.length}
                </h4>
              </div>
              <div className="space-y-1">
                {offlineMembers.map((member) => {
                  const isDark = member.profile_theme === 'dark'
                  return (
                  <button
                    key={member.user_id}
                    onContextMenu={(e) => handleContextMenu(e, member)}
                    onClick={() => onViewProfile(member.user_id)}
                    className={`w-full px-2 py-2 rounded-xl transition-all duration-200 flex items-start gap-3 group opacity-60 hover:opacity-100 ${
                      isDark ? 'bg-[#111] hover:bg-[#1a1a1a] border border-[#2a2a2a] shadow-sm' : 'hover:bg-gray-100'
                    }`}
                  >
                    {/* Avatar with Status */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-sm ring-2 ${isDark ? 'ring-[#111]' : 'ring-white'}`}>
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.username}
                            className="w-full h-full rounded-full object-cover grayscale"
                          />
                        ) : (
                          <span className="text-white text-sm font-bold">
                            {member.username.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {/* Status Indicator / Typing Indicator */}
                      {typingUsers.has(member.user_id) ? (
                        <div className={`absolute bottom-0 right-0 flex gap-[2px] border-2 rounded-full px-[2px] py-[1px] shadow-sm ${isDark ? 'border-[#111] bg-[#111]' : 'border-white bg-white'}`}>
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '0ms',
                              animationDuration: '1s'
                            }}
                          />
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '150ms',
                              animationDuration: '1s'
                            }}
                          />
                          <div
                            className="w-[3px] h-[3px] rounded-full animate-bounce"
                            style={{
                              backgroundColor: getStatusColor(member.status),
                              animationDelay: '300ms',
                              animationDuration: '1s'
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 shadow-sm ${isDark ? 'border-[#111]' : 'border-white'}`}
                          style={{ backgroundColor: getStatusColor(member.status) }}
                        />
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {member.display_name || member.username}
                        </span>
                        {member.is_owner && (
                          <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                      {member.custom_status ? (
                        <p className={`text-xs truncate font-medium ${isDark ? 'text-neutral-400' : 'text-gray-600'}`}>
                          {member.custom_status}
                        </p>
                      ) : (
                        <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>
                          @{member.username}
                        </p>
                      )}
                    </div>
                  </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          tag={contextMenu.tag}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onViewProfile={(userId) => {
            onViewProfile(userId)
            setContextMenu(null)
          }}
          onInviteToGroup={undefined}
        />
      )}
    </>
  )
})
