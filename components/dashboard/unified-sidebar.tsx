"use client";

import { Profile } from "@/lib/types/database.types";
import { Users, MessageCircle, Search, Plus, Settings, BellRing, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MainView } from "./main-dashboard";
import { getPendingFriendRequests, getFriends, getFriendRequestHistory } from "@/lib/actions/friends";
import { createClient } from "@/lib/supabase/client";
import { notificationSound } from "@/lib/utils/sounds";
import { getCurrentUserPresence, updateUserStatus, type UserStatus } from "@/lib/actions/presence";
import { CreateGroupChatModal } from "@/components/modals/create-group-chat-modal";
import { useGlobalSocket } from "@/lib/hooks/use-global-socket";
import { wsManager } from "@/lib/websocket-manager";
import { useNotificationStore, shouldPlaySound } from "@/lib/stores/notification-store";
import { UserContextMenu } from "@/components/ui/user-context-menu";
import { GroupContextMenu } from "@/components/ui/group-context-menu";
import { UserProfileModal as ViewProfileModal } from "@/components/modals/user-profile-modal";
import { SettingsModal } from "@/components/modals/settings-modal";
import { SetStatusModal } from "@/components/modals/set-status-modal";
import { leaveGroup } from "@/lib/actions/group-chats";
import { InviteToGroupModal } from "@/components/modals/invite-to-group-modal";
import { useBlockStore } from "@/lib/stores/block-store";

interface UnifiedSidebarProps {
  profile: Profile | null;
  currentView: MainView;
  onViewChange: (view: MainView) => void;
  onDmSelect: (dm: { name: string; tag: string; avatar: string; userId: string; profileTheme?: 'light' | 'dark' }) => void;
  onGroupChatSelect: (groupChatId: string) => void;
  selectedConversation?: { type: 'dm' | 'group'; id: string } | null;
}

export function UnifiedSidebar({ profile, currentView, onViewChange, onDmSelect, onGroupChatSelect, selectedConversation }: UnifiedSidebarProps) {
  const router = useRouter();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [inviteModalGroup, setInviteModalGroup] = useState<{ id: string; name: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [userStatus, setUserStatus] = useState<UserStatus>("online");
  const [customStatus, setCustomStatus] = useState("");
  const [contextMenu, setContextMenu] = useState<{ userId: string; username: string; tag: string; x: number; y: number } | null>(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Fetch user presence status
  useEffect(() => {
    if (!profile) return;

    const fetchPresence = async () => {
      const result = await getCurrentUserPresence();
      if (result.success && result.data) {
        const status = result.data.status as UserStatus;

        if (status === "offline") {
          // Restore the last active status (dnd/idle/online) the user had
          const preferred = (localStorage.getItem("preferredStatus") as UserStatus) || "online";
          await updateUserStatus(preferred);
          setUserStatus(preferred);
          setCustomStatus(result.data.custom_status || "");
          useNotificationStore.getState().setUserStatus(preferred as 'online' | 'idle' | 'dnd' | 'offline');
        } else {
          // Save current active status so we can restore it after reconnects
          localStorage.setItem("preferredStatus", status);
          setUserStatus(status);
          setCustomStatus(result.data.custom_status || "");
          useNotificationStore.getState().setUserStatus(status as 'online' | 'idle' | 'dnd' | 'offline');
        }
      }
    };

    fetchPresence();

    // Send offline beacon when tab closes so status updates quickly
    const handleBeforeUnload = () => {
      const endpoint = window.location.origin + "/api/presence/offline";
      const blob = new Blob([JSON.stringify({ userId: profile.id })], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Subscribe to presence changes
    const presenceChannel = supabase
      .channel(`own_presence_sidebar_${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new) {
            const newData = payload.new as { status: string; custom_status: string | null };
            setUserStatus(newData.status as UserStatus);
            setCustomStatus(newData.custom_status || "");
            // Sync to notification store so DND suppresses sounds
            useNotificationStore.getState().setUserStatus(newData.status as 'online' | 'idle' | 'dnd' | 'offline');
          }
        }
      )
      .subscribe();

    return () => {
      presenceChannel.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [profile, supabase]);

  // Fetch pending friend requests count
  useEffect(() => {
    if (!profile) return;

    const fetchPendingCount = async () => {
      const result = await getPendingFriendRequests();
      if (result.success) {
        const incomingCount = result.data.filter(req => req.incoming).length;
        setPendingCount(incomingCount);
      }
    };

    fetchPendingCount();

    // Subscribe to friend_requests changes
    const channel = supabase
      .channel('friend_requests_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${profile.id}`,
        },
        () => {
          setPendingCount(prev => prev + 1);
          notificationSound?.playNotification();
          fetchPendingCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${profile.id}`,
        },
        () => fetchPendingCount()
      )
      .subscribe();

    const friendshipChannel = supabase
      .channel('friendships_pending_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => fetchPendingCount()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(friendshipChannel);
    };
  }, [profile, supabase]);

  // WebSocket for real-time friend request updates
  const { friendRequestUpdate } = useGlobalSocket(profile?.id || '');

  useEffect(() => {
    if (!friendRequestUpdate || !profile) return;

    if (friendRequestUpdate.type === 'received') {
      setPendingCount((prev) => prev + 1);
      notificationSound?.playNotification();
    } else if (friendRequestUpdate.type === 'accepted' || friendRequestUpdate.type === 'declined' || friendRequestUpdate.type === 'cancelled') {
      if (friendRequestUpdate.to_user_id === profile.id) {
        setPendingCount((prev) => Math.max(0, prev - 1));
      }
    }
  }, [friendRequestUpdate, profile]);

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case "online": return "#23a559";
      case "idle": return "#f0b232";
      case "dnd": return "#f23f43";
      case "offline": return "#80848e";
      default: return "#23a559";
    }
  };

  return (
    <>
      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSearchModal(false)}>
          <div className="bg-white rounded-lg w-[500px] max-w-[90vw] max-h-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Search</h2>
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="mt-4 text-center text-gray-500 text-sm py-6">Start typing to search...</div>
            </div>
          </div>
        </div>
      )}

      {/* Group Creation Modal */}
      {showGroupModal && profile && (
        <CreateGroupChatModal
          isOpen={showGroupModal}
          onClose={() => setShowGroupModal(false)}
          onGroupCreated={(groupId) => {
            setShowGroupModal(false);
            onGroupChatSelect(groupId);
          }}
          currentUserId={profile.id}
        />
      )}

      {/* Inbox Modal */}
      {showInboxModal && <InboxModal onClose={() => setShowInboxModal(false)} />}

      {/* Status Modal */}
      {showProfileModal && profile && (
        <SetStatusModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          profile={profile}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        profile={profile}
      />

      {/* Invite to Group Modal */}
      {inviteModalGroup && (
        <InviteToGroupModal
          isOpen={true}
          onClose={() => setInviteModalGroup(null)}
          groupId={inviteModalGroup.id}
          groupName={inviteModalGroup.name}
        />
      )}

      {/* View Profile Modal */}
      <ViewProfileModal
        userId={viewingProfileUserId || ''}
        isOpen={!!viewingProfileUserId}
        onClose={() => setViewingProfileUserId(null)}
      />

      <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-white">
        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <button
            onClick={() => setShowSearchModal(true)}
            className="w-full h-10 rounded-xl px-4 bg-white border border-gray-200 text-gray-600 text-sm font-medium flex items-center gap-2 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
          >
            <Search className="w-4 h-4" />
            <span>Find or start a conversation</span>
          </button>
        </div>

        {/* Navigation */}
        <div className="p-2 border-b border-gray-200 space-y-0.5">
          <button
            onClick={() => onViewChange("friends")}
            className={`group w-full px-3 py-2 flex items-center gap-2.5 rounded-lg transition-all duration-200 ${
              currentView === "friends"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "hover:bg-gray-100 text-gray-700 hover:translate-x-0.5 border border-transparent"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
              currentView === "friends"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-200 text-gray-600 group-hover:bg-gray-300"
            }`}>
              <Users className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold flex-1 text-left">Friends</span>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onViewChange("message-requests")}
            className={`group w-full px-3 py-2 flex items-center gap-2.5 rounded-lg transition-all duration-200 ${
              currentView === "message-requests"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "hover:bg-gray-100 text-gray-700 hover:translate-x-0.5 border border-transparent"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
              currentView === "message-requests"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-200 text-gray-600 group-hover:bg-gray-300"
            }`}>
              <MessageCircle className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold flex-1 text-left">Message Requests</span>
          </button>

          <button
            onClick={() => setShowInboxModal(true)}
            className="group w-full px-3 py-2 flex items-center gap-2.5 rounded-lg hover:bg-gray-100 text-gray-700 transition-all duration-200 hover:translate-x-0.5 border border-transparent"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 group-hover:bg-gray-300 flex items-center justify-center transition-all duration-200">
              <BellRing className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold flex-1 text-left">Inbox</span>
          </button>
        </div>

        {/* Direct Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Direct Messages</span>
            <button
              onClick={() => setShowGroupModal(true)}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white transition-all duration-200"
              title="Create Group"
            >
              <Plus className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <DirectMessagesTab
              onDmClick={onDmSelect}
              onGroupChatClick={onGroupChatSelect}
              currentUserId={profile?.id || ''}
              onInviteToGroup={(groupId, groupName) => setInviteModalGroup({ id: groupId, name: groupName })}
              onViewChange={onViewChange}
              selectedConversation={selectedConversation}
            />
          </div>
        </div>

        {/* User Bar */}
        <div className="p-3 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            {/* Profile Section */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 hover:bg-white/80 hover:shadow-md hover:scale-[1.02] rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.username} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-white text-sm font-bold">
                      {profile?.username?.charAt(0).toUpperCase() || "U"}
                    </span>
                  )}
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: getStatusColor(userStatus) }}
                />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-gray-900 text-sm font-semibold truncate">
                  {profile?.display_name || profile?.username || "User"}
                </div>
                <div className="text-gray-500 text-xs truncate">
                  {customStatus || (userStatus === "offline" ? "Offline" : "Online")}
                </div>
              </div>
            </button>

            {/* Settings Icon */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/80 text-gray-600 hover:text-gray-900 transition-all duration-200"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================
// DirectMessagesTab with FULL functionality
// ============================================

interface Friend {
  friend_id: string;
  username: string;
  tag: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  custom_status: string | null;
  dm_channel_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_from_user_id: string | null;
  unread_count: number;
  is_typing: boolean;
  profile_theme?: 'light' | 'dark';
}

interface GroupChat {
  id: string;
  name: string;
  icon_url: string | null;
  member_count: number;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface DirectMessagesTabProps {
  onDmClick: (dm: { name: string; tag: string; avatar: string; userId: string; profileTheme?: 'light' | 'dark' }) => void;
  onGroupChatClick: (groupChatId: string) => void;
  currentUserId: string;
  onInviteToGroup: (groupId: string, groupName: string) => void;
  onViewChange: (view: MainView) => void;
  selectedConversation?: { type: 'dm' | 'group'; id: string } | null;
}

function DirectMessagesTab({ onDmClick, onGroupChatClick, currentUserId, onInviteToGroup, onViewChange, selectedConversation }: DirectMessagesTabProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    type: 'dm' | 'group';
    userId?: string;
    groupId?: string;
    dmChannelId?: string;
    username: string;
    tag?: string;
    x: number;
    y: number
  } | null>(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false);
  const [groupToLeave, setGroupToLeave] = useState<{ id: string; name: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const { blockUser, muteConversation, unmuteConversation, isMuted, fetchBlockedUsers, fetchMutedConversations } = useBlockStore();

  useEffect(() => {
    fetchBlockedUsers();
    fetchMutedConversations();
  }, [fetchBlockedUsers, fetchMutedConversations]);

  // WebSocket for real-time updates
  const {
    typingMap,
    lastMessageUpdate,
    readUpdate,
    groupLeftUpdate,
    groupInvitedUpdate,
    groupUpdatedUpdate,
    userBlockUpdate
  } = useGlobalSocket(currentUserId);

  const [localBlockedUsers, setLocalBlockedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const store = useBlockStore.getState();
    setLocalBlockedUsers(new Set(store.blockedUserIds));

    const unsubscribe = useBlockStore.subscribe((state) => {
      setLocalBlockedUsers(new Set(state.blockedUserIds));
    });

    return () => unsubscribe();
  }, []);

  // Handle block updates
  useEffect(() => {
    if (!userBlockUpdate || !currentUserId) return;

    if (userBlockUpdate.blocker_user_id === currentUserId) {
      if (userBlockUpdate.type === 'blocked') {
        setLocalBlockedUsers((prev) => {
          const next = new Set(prev);
          next.add(userBlockUpdate.blocked_user_id);
          return next;
        });
      } else if (userBlockUpdate.type === 'unblocked') {
        setLocalBlockedUsers((prev) => {
          const next = new Set(prev);
          next.delete(userBlockUpdate.blocked_user_id);
          return next;
        });
      }
    }
  }, [userBlockUpdate, currentUserId]);

  // Fetch data
  useEffect(() => {
    const fetchData = async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
      }

      const friendsResult = await getFriends();
      if (friendsResult.success) {
        // Fetch profile_theme for all friends (RPC doesn't return it)
        const friendIds = friendsResult.data.map((f: Friend) => f.friend_id);
        let themeMap = new Map<string, 'light' | 'dark'>();
        if (friendIds.length > 0) {
          const { data: themeData } = await supabase
            .from('profiles')
            .select('id, profile_theme')
            .in('id', friendIds);
          if (themeData) {
            themeMap = new Map(themeData.map((p: any) => [p.id, p.profile_theme || 'light']));
          }
        }

        // Merge with existing state to preserve local unread_count changes from WebSocket
        setFriends(prev => {
          if (prev.length === 0) {
            return friendsResult.data.map((f: Friend) => ({
              ...f,
              profile_theme: themeMap.get(f.friend_id) || 'light'
            }));
          }

          // Create a map of existing friends with their local state
          const existingMap = new Map(prev.map(f => [f.friend_id, f]));

          // Merge fetched data with local state
          return friendsResult.data.map((friend: Friend) => {
            const existing = existingMap.get(friend.friend_id);
            // If we have local state, preserve unread_count and is_typing (they're managed by WebSocket)
            if (existing) {
              return {
                ...friend,
                profile_theme: themeMap.get(friend.friend_id) || 'light',
                unread_count: existing.unread_count,
                is_typing: existing.is_typing
              };
            }
            return { ...friend, profile_theme: themeMap.get(friend.friend_id) || 'light' };
          });
        });
      }

      const { data: groupChatsData } = await supabase
        .rpc('get_user_group_chats', { p_user_id: currentUserId });
      if (groupChatsData) {
        // Merge with existing state for groups too
        setGroupChats(prev => {
          if (prev.length === 0) return groupChatsData; // Initial load

          const existingMap = new Map(prev.map(g => [g.id, g]));

          return groupChatsData.map((group: GroupChat) => {
            const existing = existingMap.get(group.id);
            if (existing) {
              return {
                ...group,
                unread_count: existing.unread_count
              };
            }
            return group;
          });
        });
      }

      if (showLoading) {
        setLoading(false);
      }
    };

    // Initial load with loading state
    fetchData(true);

    // Subscribe to presence changes - update silently without loading spinner
    const presenceChannel = supabase
      .channel('friends_presence_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => fetchData(false))
      .subscribe();

    // Subscribe to friendships changes (when friends are added/removed)
    const friendshipsChannel = supabase
      .channel('friendships_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => fetchData())
      .subscribe();

    // Subscribe to group_chat_members for real-time group additions
    const groupMembersChannel = supabase
      .channel('group_members_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_members',
          filter: `user_id=eq.${currentUserId}`
        },
        () => {
          console.log('[DirectMessagesTab] New group membership detected');
          fetchData(false);
        }
      )
      .subscribe();

    // Subscribe to group_chats for real-time name/icon updates
    const groupChatsChannel = supabase
      .channel('group_chats_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_chats'
        },
        (payload) => {
          console.log('[DirectMessagesTab] Group updated via realtime:', payload);
          setGroupChats(prev => prev.map(group => {
            if (group.id === payload.new.id) {
              return {
                ...group,
                name: payload.new.name,
                icon_url: payload.new.icon_url
              };
            }
            return group;
          }));
        }
      )
      .subscribe();

    // Note: We DON'T subscribe to message inserts here because WebSocket already handles:
    // - Updating last_message via lastMessageUpdate
    // - Incrementing unread_count via lastMessageUpdate
    // - Playing notification sounds (via chat-store)
    // Subscribing to postgres_changes for messages would cause double-counting

    return () => {
      presenceChannel.unsubscribe();
      friendshipsChannel.unsubscribe();
      groupMembersChannel.unsubscribe();
      groupChatsChannel.unsubscribe();
    };
  }, [currentUserId, supabase]);

  // Handle typing indicator updates
  useEffect(() => {
    if (!typingMap) return;

    // Update friends with typing state - even when typingMap is empty, we need to clear is_typing
    setFriends(prev => prev.map(friend => {
      if (friend.dm_channel_id) {
        const roomKey = `dm:${friend.dm_channel_id}`;
        const isTyping = typingMap.get(roomKey) || false;
        return { ...friend, is_typing: isTyping };
      }
      return friend;
    }));
  }, [typingMap]);

  // Handle last message updates
  useEffect(() => {
    if (!lastMessageUpdate) return;

    // Get current room to check if this conversation is currently open
    const wsManagerModule = require('@/lib/websocket-manager').wsManager;
    const currentRoom = wsManagerModule.getCurrentRoom();
    const messageRoom = `${lastMessageUpdate.conversation_type}:${lastMessageUpdate.conversation_id}`;

    if (lastMessageUpdate.conversation_type === 'dm') {
      setFriends(prev => prev.map(friend => {
        if (friend.dm_channel_id === lastMessageUpdate.conversation_id) {
          return {
            ...friend,
            last_message: lastMessageUpdate.last_message,
            last_message_at: lastMessageUpdate.last_message_at,
            last_message_from_user_id: lastMessageUpdate.sender_id,
            // Only increment unread if: message is not from me AND conversation is not currently open
            unread_count: lastMessageUpdate.sender_id !== currentUserId && currentRoom !== messageRoom
              ? (friend.unread_count || 0) + 1
              : friend.unread_count
          };
        }
        return friend;
      }));
    } else if (lastMessageUpdate.conversation_type === 'group') {
      setGroupChats(prev => prev.map(group => {
        if (group.id === lastMessageUpdate.conversation_id) {
          return {
            ...group,
            last_message: lastMessageUpdate.last_message,
            last_message_at: lastMessageUpdate.last_message_at,
            // Only increment unread if: message is not from me AND conversation is not currently open
            unread_count: lastMessageUpdate.sender_id !== currentUserId && currentRoom !== messageRoom
              ? (group.unread_count || 0) + 1
              : group.unread_count
          };
        }
        return group;
      }));
    }
  }, [lastMessageUpdate, currentUserId]);

  // Handle read updates
  useEffect(() => {
    if (!readUpdate) return;

    if (readUpdate.conversation_type === 'dm') {
      // Update local state immediately
      setFriends(prev => prev.map(friend => {
        if (friend.dm_channel_id === readUpdate.conversation_id) {
          return { ...friend, unread_count: 0 };
        }
        return friend;
      }));

      // Persist to database so it survives page refresh
      (async () => {
        const { markDmMessagesAsRead } = await import('@/lib/actions/messages');
        await markDmMessagesAsRead(readUpdate.conversation_id);
      })();
    } else if (readUpdate.conversation_type === 'group') {
      // Update local state immediately
      setGroupChats(prev => prev.map(group => {
        if (group.id === readUpdate.conversation_id) {
          return { ...group, unread_count: 0 };
        }
        return group;
      }));

      // Persist to database for groups
      (async () => {
        const { markGroupMessagesAsRead } = await import('@/lib/actions/messages');
        await markGroupMessagesAsRead(readUpdate.conversation_id);
      })();
    }
  }, [readUpdate]);

  // Handle group left
  useEffect(() => {
    if (!groupLeftUpdate) return;
    setGroupChats(prev => prev.filter(g => g.id !== groupLeftUpdate.group_id));
  }, [groupLeftUpdate]);

  // Handle group invited
  useEffect(() => {
    if (!groupInvitedUpdate) return;

    const fetchNewGroup = async () => {
      const { data } = await supabase
        .rpc('get_user_group_chats', { p_user_id: currentUserId });
      if (data) {
        setGroupChats(data);
      }
    };
    fetchNewGroup();
  }, [groupInvitedUpdate, currentUserId, supabase]);

  // Handle group updated
  useEffect(() => {
    if (!groupUpdatedUpdate) return;

    setGroupChats(prev => prev.map(group => {
      if (group.id === groupUpdatedUpdate.group_id) {
        return {
          ...group,
          name: groupUpdatedUpdate.name || group.name,
          icon_url: groupUpdatedUpdate.icon_url !== undefined ? groupUpdatedUpdate.icon_url : group.icon_url
        };
      }
      return group;
    }));
  }, [groupUpdatedUpdate]);

  // Sort by last message
  const sortedFriends = [...friends]
    .filter(f => !localBlockedUsers.has(f.friend_id))
    .sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

  const sortedGroups = [...groupChats].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-500";
      case "idle": return "bg-yellow-500";
      case "dnd": return "bg-red-500";
      default: return "bg-gray-400";
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'dm' | 'group', data: { userId?: string; groupId?: string; dmChannelId?: string; username: string; tag?: string }) => {
    e.preventDefault();
    setContextMenu({
      type,
      ...data,
      x: e.clientX,
      y: e.clientY
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      {/* Context Menus */}
      {contextMenu && contextMenu.type === 'dm' && contextMenu.userId && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          tag={contextMenu.tag || ''}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onViewProfile={() => {
            setViewingProfileUserId(contextMenu.userId!);
            setContextMenu(null);
          }}
        />
      )}

      {contextMenu && contextMenu.type === 'group' && contextMenu.groupId && (
        <GroupContextMenu
          groupId={contextMenu.groupId}
          groupName={contextMenu.username}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onInvitePeople={(id) => {
            onInviteToGroup(id, contextMenu.username);
            setContextMenu(null);
          }}
          onLeaveGroup={(id) => {
            // Show confirmation modal before leaving
            setGroupToLeave({ id, name: contextMenu.username });
            setShowLeaveGroupConfirm(true);
            setContextMenu(null);
          }}
        />
      )}

      {/* View Profile Modal */}
      <ViewProfileModal
        userId={viewingProfileUserId || ''}
        isOpen={!!viewingProfileUserId}
        onClose={() => setViewingProfileUserId(null)}
      />

      {/* Leave Group Confirmation Modal */}
      {showLeaveGroupConfirm && groupToLeave && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLeaveGroupConfirm(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Leave Group</h3>
            </div>

            {/* body */}
            <div className="px-6 py-4">
              <p className="text-gray-700">
                Are you sure you want to leave <span className="font-semibold">{groupToLeave.name}</span>? You won't be able to see any messages or rejoin unless someone invites you again.
              </p>
            </div>

            {/* footer with buttons */}
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowLeaveGroupConfirm(false);
                  setGroupToLeave(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const result = await leaveGroup(groupToLeave.id);
                  if (result.success) {
                    wsManager.emitGroupLeft(groupToLeave.id);
                    wsManager.leaveCurrentRoom();
                    router.push('/me');
                    onViewChange('friends');
                  }
                  setShowLeaveGroupConfirm(false);
                  setGroupToLeave(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-2 space-y-1">
        {/* Friends */}
        {sortedFriends.map((friend) => {
          const isSelected = selectedConversation?.type === 'dm' && selectedConversation?.id === friend.friend_id;
          const isDarkEntry = isSelected && friend.profile_theme === 'dark';
          return (
            <button
              key={friend.friend_id}
              onClick={() => onDmClick({
                name: friend.display_name || friend.username,
                tag: friend.tag,
                avatar: friend.avatar_url || '',
                userId: friend.friend_id,
                profileTheme: friend.profile_theme
              })}
              onContextMenu={(e) => handleContextMenu(e, 'dm', {
                userId: friend.friend_id,
                username: friend.display_name || friend.username,
                tag: friend.tag,
                dmChannelId: friend.dm_channel_id || undefined
              })}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left ${
                isDarkEntry
                  ? 'bg-black hover:bg-[#141414]'
                  : isSelected ? 'bg-gray-200 hover:bg-gray-250' : 'hover:bg-gray-100'
              }`}
            >
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
                {friend.avatar_url ? (
                  <img src={friend.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-white text-sm font-medium">
                    {(friend.display_name || friend.username).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${isDarkEntry ? 'border-black' : 'border-white'} ${getStatusColor(friend.status)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium truncate ${isDarkEntry ? 'text-white' : 'text-gray-900'}`}>
                  {friend.display_name || friend.username}
                </span>
                {friend.unread_count > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {friend.unread_count}
                  </span>
                )}
              </div>
              <div className={`text-xs truncate ${isDarkEntry ? 'text-neutral-400' : 'text-gray-500'}`}>
                {friend.is_typing ? (
                  <span className="text-blue-600 font-medium">typing...</span>
                ) : (
                  friend.last_message || `@${friend.tag}`
                )}
              </div>
            </div>
          </button>
        );
        })}

        {/* Groups */}
        {sortedGroups.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Groups</span>
            </div>
            {sortedGroups.map((group) => {
              const isSelected = selectedConversation?.type === 'group' && selectedConversation?.id === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => onGroupChatClick(group.id)}
                  onContextMenu={(e) => handleContextMenu(e, 'group', {
                    groupId: group.id,
                    username: group.name
                  })}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left ${
                    isSelected ? 'bg-gray-200 hover:bg-gray-250' : 'hover:bg-gray-100'
                  }`}
                >
                <div className="w-9 h-9 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                  {group.icon_url ? (
                    <img src={group.icon_url} alt="" className="w-full h-full rounded-lg object-cover" />
                  ) : (
                    <Users className="w-4 h-4 text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{group.name}</span>
                    {group.unread_count > 0 && (
                      <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {group.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {group.last_message || `${group.member_count} members`}
                  </p>
                </div>
              </button>
            );
            })}
          </>
        )}

        {sortedFriends.length === 0 && sortedGroups.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-6">No conversations yet</p>
        )}
      </div>
    </>
  );
}

// Inbox Modal Component
function InboxModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg w-[500px] max-w-[90vw] max-h-[80vh] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Inbox</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-center text-gray-500 py-8">No notifications</p>
        </div>
      </div>
    </div>
  );
}
