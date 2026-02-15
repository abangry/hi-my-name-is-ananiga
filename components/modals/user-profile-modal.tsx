"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, MessageCircle, UserPlus, Users as UsersIcon, Ban, BellOff, Bell, Volume2, VolumeX } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Profile } from "@/lib/types/database.types"
import { useBlockStore } from "@/lib/stores/block-store"
import { wsManager } from "@/lib/websocket-manager"

interface UserProfileModalProps {
  userId: string
  isOpen: boolean
  onClose: () => void
  currentUserId?: string
}

interface ExtendedProfile extends Profile {
  bio?: string | null
  banner_url?: string | null
  profile_theme?: 'light' | 'dark'
}

export function UserProfileModal({ userId, isOpen, onClose, currentUserId }: UserProfileModalProps) {
  const [profile, setProfile] = useState<ExtendedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [mutualGroups, setMutualGroups] = useState<any[]>([])
  const [isFriend, setIsFriend] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [customStatus, setCustomStatus] = useState<string | null>(null)
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('offline')
  const [dmChannelId, setDmChannelId] = useState<string | null>(null)
  const [showMuteMenu, setShowMuteMenu] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const [muteLoading, setMuteLoading] = useState(false)
  const supabase = createClient()

  // Block store
  const { isBlocked, blockUser, unblockUser, isMuted, muteConversation, unmuteConversation, fetchBlockedUsers, fetchMutedConversations } = useBlockStore()
  const userIsBlocked = isBlocked(userId)
  const dmIsMuted = dmChannelId ? isMuted(dmChannelId) : false

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen || !userId) return

    const fetchProfile = async () => {
      setLoading(true)

      // Fetch user profile
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[UserProfileModal] Error fetching profile:', error)
        setLoading(false)
        return
      }

      setProfile(profileData)

      // Fetch user presence (status and custom status)
      const { data: presenceData, error: presenceError } = await supabase
        .from('user_presence')
        .select('status, custom_status')
        .eq('user_id', userId)
        .single()

      console.log('[UserProfileModal] Presence data for user', userId, ':', presenceData, 'Error:', presenceError);

      if (presenceData) {
        setUserStatus(presenceData.status)
        setCustomStatus(presenceData.custom_status)
        console.log('[UserProfileModal] Set custom status to:', presenceData.custom_status);
      }

      // Check if users are friends
      if (currentUserId && currentUserId !== userId) {
        const { data: friendshipData } = await supabase
          .from('friendships')
          .select('id')
          .or(`and(user_id.eq.${currentUserId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUserId})`)
          .limit(1)
          .single()

        setIsFriend(!!friendshipData)
      }

      // Fetch mutual group chats if current user is provided
      if (currentUserId && currentUserId !== userId) {
        // First, get all groups the target user is in
        const { data: targetUserGroups } = await supabase
          .from('group_chat_members')
          .select('group_chat_id')
          .eq('user_id', userId)

        if (targetUserGroups && targetUserGroups.length > 0) {
          const groupIds = targetUserGroups.map(g => g.group_chat_id)

          // Then get the current user's groups that match
          const { data: mutualGroupsData } = await supabase
            .from('group_chat_members')
            .select(`
              group_chat_id,
              group_chats:group_chat_id (
                id,
                name,
                icon_url
              )
            `)
            .eq('user_id', currentUserId)
            .in('group_chat_id', groupIds)

          if (mutualGroupsData) {
            setMutualGroups(mutualGroupsData.map((item: any) => item.group_chats).filter(Boolean))
          }
        }

        // Fetch DM channel ID for mute functionality
        const { data: channelId } = await supabase.rpc('get_or_create_dm_channel', {
          other_user_id: userId
        })
        if (channelId) {
          setDmChannelId(channelId)
        }
      }

      // Fetch blocked users and muted conversations
      await fetchBlockedUsers()
      await fetchMutedConversations()

      setLoading(false)
    }

    fetchProfile()
  }, [isOpen, userId, currentUserId, supabase, fetchBlockedUsers, fetchMutedConversations])

  // Handle block/unblock
  const handleBlockToggle = async () => {
    if (!currentUserId || currentUserId === userId) return
    setBlockLoading(true)
    try {
      if (userIsBlocked) {
        await unblockUser(userId)
        wsManager.emitUserUnblock(userId)
      } else {
        await blockUser(userId)
        wsManager.emitUserBlock(userId)
      }
    } catch (error) {
      console.error('Error toggling block:', error)
    }
    setBlockLoading(false)
  }

  // Handle mute/unmute
  const handleMuteToggle = async (duration: number | null = null) => {
    if (!dmChannelId) return
    setMuteLoading(true)
    setShowMuteMenu(false)
    try {
      if (dmIsMuted) {
        await unmuteConversation(dmChannelId, 'dm')
      } else {
        await muteConversation(dmChannelId, 'dm', duration)
      }
    } catch (error) {
      console.error('Error toggling mute:', error)
    }
    setMuteLoading(false)
  }

  if (!isOpen || !mounted) return null

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Unknown'

  const isDark = profile?.profile_theme === 'dark'

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Modal - Full screen on mobile, modal on desktop */}
      <div
        className={`relative w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] sm:rounded-2xl shadow-2xl overflow-y-auto ${isDark ? 'bg-black' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-2 right-2 sm:top-4 sm:right-4 z-10 p-2 rounded-xl transition-all duration-200 shadow-md border ${
            isDark
              ? 'bg-[#141414] hover:bg-[#1f1f1f] border-[#2a2a2a]'
              : 'bg-white hover:bg-gray-100 border-gray-200'
          }`}
        >
          <X size={18} className={`sm:w-5 sm:h-5 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`} />
        </button>

        {loading ? (
          <div className={`p-8 text-center ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
            <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-3 ${isDark ? 'border-white' : 'border-blue-600'}`}></div>
            <p>Loading profile...</p>
          </div>
        ) : profile ? (
          <>
            {/* Banner - Responsive height */}
            <div
              className={`h-24 sm:h-32 sm:rounded-t-2xl ${
                isDark && !profile.banner_url
                  ? 'bg-gradient-to-r from-[#1a1a1a] via-[#111] to-[#1a1a1a]'
                  : 'bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500'
              }`}
              style={{
                backgroundImage: profile.banner_url ? `url(${profile.banner_url})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />

            {/* Profile Content - Responsive padding */}
            <div className="px-4 sm:px-6 pb-4 sm:pb-6">
              {/* Avatar - Responsive size */}
              <div className="relative -mt-12 sm:-mt-16 mb-3 sm:mb-4">
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full  overflow-hidden bg-gradient-to-br  ring-2 ${
                  isDark ? 'border-black border-2 ring-black' : 'border-white border-2 ring-white'
                }`}>
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white">
                      {profile.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {/* Status Indicator - Responsive size */}
                <div
                  className={`
                    absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-[3px] sm:border-4 shadow-md
                    ${isDark ? 'border-black' : 'border-white'}
                    ${
                      userStatus === "online"
                        ? "bg-[#23a559]"
                        : userStatus === "idle"
                        ? "bg-[#f0b232]"
                        : userStatus === "dnd"
                        ? "bg-[#f23f43]"
                        : "bg-[#80848e]"
                    }
                  `}
                />
              </div>

              {/* User Info - Responsive */}
              <div className="mb-4 sm:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                  <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {profile.display_name || profile.username}
                  </h2>
                  {isFriend && (
                    <span className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 shadow-md ${
                      isDark
                        ? 'bg-white text-black'
                        : 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                    }`}>
                      <UserPlus size={12} />
                      Friends
                    </span>
                  )}
                </div>
                <p className={`text-sm font-medium ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                  {profile.username}#{profile.tag || '0000'}
                </p>

                {/* Custom Status */}
                {customStatus && (
                  <div className={`mt-2 sm:mt-3 px-3 py-2 rounded-xl border ${
                    isDark ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className={`text-sm font-medium ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{customStatus}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons - Responsive */}
              {currentUserId && currentUserId !== userId && (
                <div className="space-y-2 mb-4 sm:mb-6">
                  {/* Primary Actions */}
                  <div className="flex gap-2">
                    {isFriend ? (
                      <button className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 text-sm sm:text-base font-bold ${
                        isDark
                          ? 'bg-white hover:bg-neutral-200 text-black'
                          : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white'
                      }`}>
                        <MessageCircle size={14} className="sm:w-4 sm:h-4" />
                        Send Message
                      </button>
                    ) : (
                      <button className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 text-sm sm:text-base font-bold ${
                        isDark
                          ? 'bg-white hover:bg-neutral-200 text-black'
                          : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white'
                      }`}>
                        <UserPlus size={14} className="sm:w-4 sm:h-4" />
                        Add Friend
                      </button>
                    )}
                  </div>

                  {/* Secondary Actions - Block & Mute */}
                  <div className="flex gap-2">
                    {/* Block Button */}
                    <button
                      onClick={handleBlockToggle}
                      disabled={blockLoading}
                      className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base font-bold ${
                        userIsBlocked
                          ? isDark
                            ? 'bg-white hover:bg-neutral-200 text-black hover:scale-105'
                            : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white hover:scale-105'
                          : isDark
                            ? 'bg-[#141414] hover:bg-[#1f1f1f] text-neutral-300 border border-[#2a2a2a]'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                      } ${blockLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Ban size={14} className="sm:w-4 sm:h-4" />
                      {blockLoading ? 'Loading...' : userIsBlocked ? 'Unblock' : 'Block'}
                    </button>

                    {/* Mute Button with Dropdown */}
                    <div className="relative flex-1">
                      <button
                        onClick={() => dmChannelId && (dmIsMuted ? handleMuteToggle() : setShowMuteMenu(!showMuteMenu))}
                        disabled={muteLoading || !dmChannelId}
                        className={`w-full px-3 sm:px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base font-bold ${
                          dmIsMuted
                            ? isDark
                              ? 'bg-white hover:bg-neutral-200 text-black hover:scale-105'
                              : 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white hover:scale-105'
                            : isDark
                              ? 'bg-[#141414] hover:bg-[#1f1f1f] text-neutral-300 border border-[#2a2a2a]'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                        } ${muteLoading || !dmChannelId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {dmIsMuted ? (
                          <>
                            <Bell size={14} className="sm:w-4 sm:h-4" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <BellOff size={14} className="sm:w-4 sm:h-4" />
                            Mute
                          </>
                        )}
                      </button>

                      {/* Mute Duration Menu */}
                      {showMuteMenu && !dmIsMuted && (
                        <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl shadow-2xl border z-20 overflow-hidden ${
                          isDark ? 'bg-[#0a0a0a] border-[#1f1f1f]' : 'bg-white border-gray-200'
                        }`}>
                          {[
                            { label: '15 minutes', value: 15 },
                            { label: '1 hour', value: 60 },
                            { label: '8 hours', value: 480 },
                            { label: '24 hours', value: 1440 },
                          ].map(({ label, value }) => (
                            <button
                              key={value}
                              onClick={() => handleMuteToggle(value)}
                              className={`w-full px-3 py-2 text-left text-sm font-semibold transition-all duration-200 ${
                                isDark
                                  ? 'text-neutral-300 hover:bg-[#1f1f1f] hover:text-blue-400'
                                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            onClick={() => handleMuteToggle(null)}
                            className={`w-full px-3 py-2 text-left text-sm font-semibold transition-all duration-200 border-t ${
                              isDark
                                ? 'text-neutral-300 hover:bg-[#1f1f1f] hover:text-blue-400 border-[#1f1f1f]'
                                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 border-gray-200'
                            }`}
                          >
                            Until I unmute
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* About Me Section - Responsive */}
              {profile.bio && (
                <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl border shadow-sm ${
                  isDark
                    ? 'bg-[#0a0a0a] border-[#1f1f1f]'
                    : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
                }`}>
                  <h3 className={`text-xs font-bold uppercase mb-2 tracking-wider ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                    About Me
                  </h3>
                  <p className={`text-sm whitespace-pre-wrap font-medium ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>
                    {profile.bio}
                  </p>
                </div>
              )}

              {/* Member Since - Responsive */}
              <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl border shadow-sm ${
                isDark
                  ? 'bg-[#0a0a0a] border-[#1f1f1f]'
                  : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
              }`}>
                <h3 className={`text-xs font-bold uppercase mb-2 tracking-wider ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                  Member Since
                </h3>
                <p className={`text-sm font-medium ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{memberSince}</p>
              </div>

              {/* Mutual Groups - Responsive */}
              {mutualGroups.length > 0 && (
                <div className={`p-3 sm:p-4 rounded-xl border shadow-sm ${
                  isDark
                    ? 'bg-[#0a0a0a] border-[#1f1f1f]'
                    : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
                }`}>
                  <h3 className={`text-xs font-bold uppercase mb-3 flex items-center gap-2 tracking-wider ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                    <UsersIcon size={14} />
                    {mutualGroups.length} Mutual Group{mutualGroups.length !== 1 ? 's' : ''}
                  </h3>
                  <div className="space-y-2">
                    {mutualGroups.slice(0, 5).map((group) => (
                      <div key={group.id} className={`flex items-center gap-2 sm:gap-3 p-2 rounded-lg transition-all duration-200 ${
                        isDark ? 'hover:bg-[#1f1f1f]' : 'hover:bg-gray-100'
                      }`}>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-md ring-2 ${
                          isDark
                            ? 'bg-[#2a2a2a] ring-[#1f1f1f]'
                            : 'bg-gradient-to-br from-blue-500 to-purple-500 ring-gray-200'
                        }`}>
                          {group.icon_url ? (
                            <img
                              src={group.icon_url}
                              alt={group.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            group.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span className={`text-sm truncate font-medium ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{group.name}</span>
                      </div>
                    ))}
                    {mutualGroups.length > 5 && (
                      <p className={`text-xs pt-2 font-medium ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        +{mutualGroups.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={`p-8 text-center ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
            <p className="font-medium">Profile not found</p>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
