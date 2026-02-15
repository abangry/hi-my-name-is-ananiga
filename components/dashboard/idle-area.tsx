"use client";

import { Profile } from "@/lib/types/database.types";
import { Users, Search, MessageCircle, Inbox } from "lucide-react";
import { useState, useEffect } from "react";
import { MainView } from "./main-dashboard";
import { DmChatStable } from "./dm-chat-stable";
import { sendFriendRequest, getPendingFriendRequests, acceptFriendRequest, declineFriendRequest } from "@/lib/actions/friends";
import { createClient } from "@/lib/supabase/client";
import { wsManager } from "@/lib/websocket-manager";
import { useTabFreezeDetection } from "@/lib/hooks/use-tab-freeze-detection";
import { useFriendsStore } from "@/lib/stores/friends-store";

interface IdleAreaProps {
  profile: Profile | null;
  currentView: MainView;
  selectedDm: { name: string; tag: string; avatar: string; userId: string; profileTheme?: 'light' | 'dark' } | null;
  selectedGroupChat: string | null;
  showMembersSidebar?: boolean;
  isMobile?: boolean;
}

type FriendTab = "online" | "all" | "pending";

interface PendingRequest {
  id: string;
  userId: string;
  username: string;
  tag: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  incoming: boolean;
}

export function IdleArea({ profile, currentView, selectedDm, selectedGroupChat, showMembersSidebar = true, isMobile = false }: IdleAreaProps) {
  const [activeTab, setActiveTab] = useState<FriendTab>("online");
  const [messageRequestTab, setMessageRequestTab] = useState<"requests" | "spam">("requests");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendTag, setFriendTag] = useState("");
  const [addFriendMessage, setAddFriendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [groupChatName, setGroupChatName] = useState<string>('');
  const [groupChatIcon, setGroupChatIcon] = useState<string>('');
  const supabase = createClient();

  // pulling friends data from the store instead of managing it here
  const { friends, loading, fetchFriends, subscribeToPresence, unsubscribeFromPresence } = useFriendsStore();

  // checks if the tab got frozen or websocket died - keeps things running smooth
  useTabFreezeDetection();

  // load up friends list and start listening for status changes
  useEffect(() => {
    if (!profile?.id) return;

    fetchFriends(profile.id);
    subscribeToPresence(profile.id);

    return () => {
      unsubscribeFromPresence();
    };
  }, [profile?.id, fetchFriends, subscribeToPresence, unsubscribeFromPresence]);

  const onlineFriends = friends.filter(f => f.status === 'online' || f.status === 'idle' || f.status === 'dnd');
  const allFriends = friends;

  const currentFriends = activeTab === "online" ? onlineFriends : activeTab === "all" ? allFriends : [];

  // grab the group name and icon whenever we switch to a different group
  useEffect(() => {
    if (!selectedGroupChat) return;

    const fetchGroupChatInfo = async () => {
      const { data, error } = await supabase
        .from('group_chats')
        .select('name, icon_url')
        .eq('id', selectedGroupChat)
        .single();

      if (error) {
        console.error('[IdleArea] Error fetching group chat info:', error);
      } else {
        setGroupChatName(data?.name || 'Group Chat');
        setGroupChatIcon(data?.icon_url || '');
      }
    };

    fetchGroupChatInfo();
  }, [selectedGroupChat, supabase]);

  // only load pending requests when you actually click that tab - saves some database calls
  useEffect(() => {
    if (activeTab === "pending") {
      fetchPendingRequests();
    }
  }, [activeTab]);

  const fetchPendingRequests = async () => {
    setLoadingRequests(true);
    const result = await getPendingFriendRequests();
    if (result.success) {
      setPendingRequests(result.data);
    }
    setLoadingRequests(false);
  };

  const handleAcceptRequest = async (requestId: string) => {
    const result = await acceptFriendRequest(requestId);
    if (result.success) {
      // sounds are annoying when you're the one clicking, only play when receiving
      setAddFriendMessage({ type: "success", text: result.message || "Friend request accepted!" });
      setTimeout(() => setAddFriendMessage(null), 2000);
      // tell the other person you accepted via websocket
      if (result.fromUserId) {
        wsManager.emitFriendRequest('accepted', result.fromUserId);
      }
      // reload the list so the request disappears
      fetchPendingRequests();
    } else {
      setAddFriendMessage({ type: "error", text: result.error || "Failed to accept request" });
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    const result = await declineFriendRequest(requestId);
    if (result.success) {
      // same deal - no annoying sounds when you click stuff yourself
      setAddFriendMessage({ type: "success", text: result.message || "Friend request declined" });
      setTimeout(() => setAddFriendMessage(null), 2000);
      // notify them via websocket
      if (result.fromUserId) {
        wsManager.emitFriendRequest('declined', result.fromUserId);
      }
      // refresh the list
      fetchPendingRequests();
    } else {
      setAddFriendMessage({ type: "error", text: result.error || "Failed to decline request" });
    }
  };

  // figure out what to show - dm chat, group chat, or friends list
  if (currentView === "dm" && selectedDm) {
    return (
      <DmChatStable
        profile={profile}
        recipientName={selectedDm.name}
        recipientTag={selectedDm.tag}
        recipientAvatar={selectedDm.avatar}
        recipientUserId={selectedDm.userId}
        recipientTheme={selectedDm.profileTheme}
        showMembersSidebar={showMembersSidebar}
        isMobile={isMobile}
      />
    );
  }

  if (currentView === "group-chat" && selectedGroupChat && profile) {
    console.log('[IdleArea] Rendering GroupChat:', {
      currentView,
      selectedGroupChat,
      groupChatName,
      groupChatIcon,
      profileId: profile.id,
      profileTag: profile.tag
    });
    return (
      <DmChatStable
        profile={profile}
        recipientName={groupChatName || 'Loading...'}
        recipientTag=""
        recipientAvatar={groupChatIcon}
        type="group"
        groupChatId={selectedGroupChat}
        showMembersSidebar={showMembersSidebar}
        isMobile={isMobile}
      />
    );
  }

  if (currentView === "message-requests") {
    return <MessageRequestsView messageRequestTab={messageRequestTab} setMessageRequestTab={setMessageRequestTab} />;
  }

  if (currentView === "inbox") {
    return <InboxView />;
  }

  // nothing special selected so show the friends view
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-white">
      {/* header with friends icon */}
      <div className="h-14 px-6 flex items-center border-b border-gray-200/80 bg-white/60 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
            <Users className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">Friends</span>
        </div>
      </div>

      {/* tabs for switching between online/all/pending + search bar */}
      <div className="px-6 py-5 border-b border-gray-200/50">
        {/* the three tabs at the top */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 bg-gray-100/60 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("online")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "online"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Online <span className="ml-1 text-xs">({onlineFriends.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "all"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All <span className="ml-1 text-xs">({allFriends.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "pending"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Pending <span className="ml-1 text-xs">({pendingRequests.length})</span>
            </button>
          </div>

          {/* the "add friend" button or input field */}
          <div className="flex items-center gap-2">
            {showAddFriend ? (
              <>
                <input
                  type="text"
                  value={friendTag}
                  onChange={(e) => {
                    setFriendTag(e.target.value);
                    setAddFriendMessage(null); // Clear message on typing
                  }}
                  onBlur={() => {
                    if (!friendTag && !addFriendMessage) setShowAddFriend(false);
                  }}
                  placeholder="Enter user tag"
                  className="w-52 px-4 py-2 bg-white border-2 border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && friendTag.trim()) {
                      // hit enter to send the request
                      const result = await sendFriendRequest(friendTag.trim());

                      if (result.success) {
                        setAddFriendMessage({ type: "success", text: result.message || "Friend request sent!" });
                        // ping the other user in real-time so they see it instantly
                        if (result.toUserId) {
                          wsManager.emitFriendRequest('sent', result.toUserId);
                        }
                        // if we're on pending tab, refresh it
                        if (activeTab === "pending") {
                          fetchPendingRequests();
                        }
                        setTimeout(() => {
                          setFriendTag("");
                          setShowAddFriend(false);
                          setAddFriendMessage(null);
                        }, 2000);
                      } else {
                        setAddFriendMessage({ type: "error", text: result.error || "Failed to send request" });
                      }
                    } else if (e.key === "Escape") {
                      setFriendTag("");
                      setShowAddFriend(false);
                      setAddFriendMessage(null);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    setFriendTag("");
                    setShowAddFriend(false);
                    setAddFriendMessage(null);
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-all duration-200"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAddFriend(true)}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#23a559] to-[#1e9450] text-white hover:shadow-md hover:scale-105 transition-all duration-200"
              >
                Add Friend
              </button>
            )}

            {/* shows success or error after you try to add someone */}
            {addFriendMessage && (
              <div className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-sm ${
                addFriendMessage.type === "success"
                  ? "bg-[#23a559]/10 text-[#23a559] border border-[#23a559]/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}>
                {addFriendMessage.text}
              </div>
            )}
          </div>
        </div>

        {/* search box - not actually hooked up yet but looks nice */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search friends..."
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-sm transition-all duration-200"
          />
        </div>
      </div>

      {/* the actual list of friends or requests */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {activeTab === "pending" ? (
          /* show pending friend requests */
          <div className="px-6 py-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
              Pending Requests
            </h3>
            {loadingRequests ? (
              <div className="text-center text-gray-400 text-sm py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => {
                  // make some nice initials for the avatar if they don't have a pic
                  const displayName = request.displayName || request.username;
                  const initials = displayName
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div
                      key={request.id}
                      className="px-4 py-3.5 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 flex items-center gap-3"
                    >
                      {/* profile pic or initials */}
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-md">
                        <span className="text-white text-sm font-bold">{initials}</span>
                      </div>

                      {/* name, tag, and whether it's incoming or outgoing */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{displayName}</div>
                        <div className="text-xs text-gray-500 truncate">{request.tag}</div>
                        <div className="text-xs font-medium text-blue-600 mt-0.5">
                          {request.incoming ? "Incoming Request" : "Outgoing Request"}
                        </div>
                      </div>

                      {/* buttons to accept/decline or just show "pending" if you sent it */}
                      {request.incoming ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptRequest(request.id)}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-[#23a559] to-[#1e9450] text-white hover:shadow-md hover:scale-105 transition-all duration-200"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(request.id)}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-md hover:scale-105 transition-all duration-200"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <div className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-500">
                          Pending
                        </div>
                      )}
                    </div>
                  );
                })}

                {pendingRequests.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-12">
                    No pending friend requests
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Friends List (Online/All) */
          <div className="px-6 py-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">
              {activeTab === "online" ? "Online" : "All Friends"} — {currentFriends.length}
            </h3>
            <div className="space-y-3">
              {currentFriends.map((friend) => {
                const displayName = friend.display_name || friend.username;
                const initials = displayName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                // Get status color
                const getStatusColor = () => {
                  switch (friend.status) {
                    case 'online': return '#23a559';
                    case 'idle': return '#f0b232';
                    case 'dnd': return '#f23f43';
                    default: return '#80848e';
                  }
                };

                return (
                  <div
                    key={friend.id}
                    className="px-4 py-3.5 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 flex items-center gap-3 cursor-pointer"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-md">
                        {friend.avatar_url ? (
                          <img
                            src={friend.avatar_url}
                            alt={displayName}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-sm font-bold">{initials}</span>
                        )}
                      </div>
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: getStatusColor() }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{displayName}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {friend.custom_status || (friend.status === 'offline' ? 'Offline' : 'Online')}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5">
                      <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-blue-50 hover:text-blue-600 text-gray-500 transition-all duration-200">
                        <MessageCircle className="w-5 h-5" />
                      </button>
                      <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 hover:text-gray-700 text-gray-500 transition-all duration-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {currentFriends.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-12">
                  No friends {activeTab === "online" ? "online" : "found"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Placeholder message requests data
const placeholderMessageRequests = [
  { id: 1, name: "Random User 1", tag: "random#1234", message: "Hey! Want to be friends?", time: "1h", avatar: "RU", isSpam: false },
  { id: 2, name: "Random User 2", tag: "random#5678", message: "Hi there!", time: "3h", avatar: "RU", isSpam: false },
  { id: 3, name: "Spam Bot", tag: "spam#9999", message: "Check out this link!", time: "1d", avatar: "SB", isSpam: true },
  { id: 4, name: "Another Spam", tag: "spam#0000", message: "Free money!", time: "2d", avatar: "AS", isSpam: true },
];

// Message Requests View Component
function MessageRequestsView({
  messageRequestTab,
  setMessageRequestTab
}: {
  messageRequestTab: "requests" | "spam";
  setMessageRequestTab: (tab: "requests" | "spam") => void;
}) {
  const requests = placeholderMessageRequests.filter(r => !r.isSpam);
  const spam = placeholderMessageRequests.filter(r => r.isSpam);
  const currentRequests = messageRequestTab === "requests" ? requests : spam;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top Bar */}
      <div className="h-12 px-4 flex items-center border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-gray-600" />
          <span className="font-semibold text-gray-900">Message Requests</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-4 border-b border-gray-200/50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMessageRequestTab("requests")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              messageRequestTab === "requests"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Requests ({requests.length})
          </button>
          <button
            onClick={() => setMessageRequestTab("spam")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              messageRequestTab === "spam"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Spam ({spam.length})
          </button>
        </div>
      </div>

      {/* Requests List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {messageRequestTab === "requests" ? "Message Requests" : "Spam Messages"}
          </h3>
          <div className="space-y-2">
            {currentRequests.map((request) => (
              <div
                key={request.id}
                className="px-4 py-3 rounded-2xl bg-black/5 hover:bg-black/10 transition-all"
              >
                <div className="flex items-start gap-3 mb-2">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">{request.avatar}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">{request.name}</div>
                      <div className="text-xs text-gray-500">{request.time}</div>
                    </div>
                    <div className="text-xs text-gray-600 truncate mb-1">{request.tag}</div>
                    <div className="text-sm text-gray-700 mb-3">{request.message}</div>

                    {/* Actions */}
                    {messageRequestTab === "requests" ? (
                      <div className="flex gap-2">
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#23a559] text-white hover:bg-[#23a559]/90 transition-colors">
                          Accept
                        </button>
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-500/90 transition-colors">
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-500/90 transition-colors">
                          Delete
                        </button>
                        <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-600 text-white hover:bg-gray-600/90 transition-colors">
                          Not Spam
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {currentRequests.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-8">
                No {messageRequestTab === "requests" ? "message requests" : "spam messages"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Placeholder inbox data
const placeholderInbox = [
  { id: 1, type: "mention", from: "Alex Thompson", message: "mentioned you in #general", time: "5m", avatar: "AT", read: false },
  { id: 2, type: "reply", from: "Sarah Chen", message: "replied to your message", time: "1h", avatar: "SC", read: false },
  { id: 3, type: "friend", from: "Mike Johnson", message: "accepted your friend request", time: "2h", avatar: "MJ", read: true },
];

// Inbox View Component
function InboxView() {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top Bar */}
      <div className="h-12 px-4 flex items-center border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <Inbox className="w-6 h-6 text-gray-600" />
          <span className="font-semibold text-gray-900">Inbox</span>
        </div>
      </div>

      {/* Inbox List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <div className="px-6 py-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Notifications
          </h3>
          <div className="space-y-2">
            {placeholderInbox.map((item) => (
              <div
                key={item.id}
                className={`px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                  item.read ? "bg-black/5 hover:bg-black/10" : "bg-blue-600/10 hover:bg-blue-600/15"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-semibold">{item.avatar}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">{item.from}</div>
                      <div className="text-xs text-gray-500">{item.time}</div>
                    </div>
                    <div className="text-sm text-gray-700">{item.message}</div>
                  </div>

                  {/* Unread indicator */}
                  {!item.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
