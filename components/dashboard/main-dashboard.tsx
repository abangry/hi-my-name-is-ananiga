"use client";

import { useState, useEffect } from "react";
import { Profile } from "@/lib/types/database.types";
import { OnboardingModal } from "@/components/modals/onboarding-modal";
import { IdleArea } from "@/components/dashboard/idle-area";
import { createClient } from "@/lib/supabase/client";
import { Menu, ChevronLeft, Users } from "lucide-react";
import { useUnreadMessages } from "@/lib/hooks/use-unread-messages";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { UnifiedSidebar } from "@/components/dashboard/unified-sidebar";
import { ProtectedWatermark } from "@/components/ui/protected-watermark";

interface MainDashboardProps {
  initialProfile: Profile | null;
  initialView?: MainView;
  userTag?: string;
  groupChatId?: string;
  initialDmUser?: {
    id: string;
    username: string;
    tag: string;
    display_name: string | null;
    avatar_url: string | null;
    profile_theme: string | null;
  } | null;
  initialGroupData?: {
    id: string;
    name: string;
    icon_url: string | null;
  } | null;
}

export type MainView = "friends" | "message-requests" | "inbox" | "dm" | "group-chat";

export function MainDashboard({ initialProfile, initialView = "friends", userTag, groupChatId, initialDmUser, initialGroupData }: MainDashboardProps) {
  const supabase = createClient();
  const totalUnread = useNotificationStore(state => state.totalUnread);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentView, setCurrentView] = useState<MainView>(initialView);
  const [selectedDm, setSelectedDm] = useState<{
    name: string;
    tag: string;
    avatar: string;
    userId: string;
    profileTheme?: 'light' | 'dark';
  } | null>(() => {
    if (initialDmUser) {
      return {
        name: initialDmUser.display_name || initialDmUser.username,
        tag: initialDmUser.tag,
        avatar: initialDmUser.avatar_url || '',
        userId: initialDmUser.id,
        profileTheme: (initialDmUser.profile_theme as 'light' | 'dark') || 'light',
      };
    }
    return null;
  });
  const [selectedGroupChat, setSelectedGroupChat] = useState<{
    id: string;
    name: string;
    icon: string | null;
  } | null>(() => {
    if (initialGroupData) {
      return {
        id: initialGroupData.id,
        name: initialGroupData.name,
        icon: initialGroupData.icon_url,
      };
    }
    return null;
  });
  // data is pre-fetched server-side for DM/group pages, so we can skip the client fetch
  const [dataFetched, setDataFetched] = useState(() => {
    if (initialView === "dm" && initialDmUser) return true;
    if (initialView === "group-chat" && initialGroupData) return true;
    if (!userTag && !groupChatId) return true;
    return false;
  });
  const [wsReady, setWsReady] = useState(false);
  const isInitializing = !dataFetched || !wsReady;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [membersSidebarOpen, setMembersSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport for overlay sidebar behavior
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) {
        setSidebarOpen(false);
        setMembersSidebarOpen(false);
      }
    };
    handleChange(mq); // initial check
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  console.log('[MainDashboard] Render - initialView:', initialView, 'currentView:', currentView, 'userTag:', userTag, 'groupChatId:', groupChatId);

  // alright so when someone opens a DM or group from URL, we gotta fetch their info
  // otherwise how would we show their name and stuff lol
  useEffect(() => {
    const fetchDmUser = async () => {
      if (userTag && initialView === "dm") {
        console.log('[MainDashboard] Loading DM for user tag:', userTag);
        const { data: dmUser } = await supabase
          .from("profiles")
          .select("id, username, tag, display_name, avatar_url, profile_theme")
          .eq("tag", userTag)
          .single();

        if (dmUser) {
          const displayName = dmUser.display_name || dmUser.username;

          console.log('[MainDashboard] Setting selected DM:', dmUser.tag);
          setSelectedDm({
            name: displayName,
            tag: dmUser.tag,
            avatar: dmUser.avatar_url || '',
            userId: dmUser.id,
            profileTheme: dmUser.profile_theme || 'light'
          });
          setCurrentView("dm");
        } else {
          console.log('[MainDashboard] User not found:', userTag);
        }
      } else if (groupChatId && initialView === "group-chat") {
        console.log('[MainDashboard] Loading group chat:', groupChatId);
        // grab the group name and icon so we can display it properly
        const { data: groupData } = await supabase
          .from("group_chats")
          .select("id, name, icon_url")
          .eq("id", groupChatId)
          .single();

        if (groupData) {
          setSelectedGroupChat({
            id: groupData.id,
            name: groupData.name,
            icon: groupData.icon_url
          });
          setCurrentView("group-chat");
        }
      } else if (!userTag && !groupChatId && initialView !== 'dm' && initialView !== 'group-chat') {
        console.log('[MainDashboard] Resetting to friends view');
        setSelectedDm(null);
        setSelectedGroupChat(null);
        setCurrentView(initialView);
      }
      // always mark data as fetched so isInitializing can clear
      setDataFetched(true);
    };

    fetchDmUser();
  }, [userTag, groupChatId, initialView, supabase]);

  useUnreadMessages(profile?.id || null);

  // spin up the websocket connection so we can get real-time messages
  // gotta wait a tiny bit before showing content so everything loads nicely
  useEffect(() => {
    const initWebSocket = async () => {
      if (profile?.id) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          const { useChatStore } = await import('@/lib/stores/chat-store')
          const { initializeWebSocket } = useChatStore.getState()
          // pass the user profile so optimistic messages show the correct name and avatar
          await initializeWebSocket(profile.id, session.access_token, {
            username: profile.username,
            tag: profile.tag || '',
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          })
          console.log('[MainDashboard] WebSocket initialized')
        }
      }
      setTimeout(() => {
        setWsReady(true)
      }, 500)
    }
    initWebSocket()
  }, [profile?.id])

  useEffect(() => {
    if (profile && !profile.profile_completed) {
      setShowOnboarding(true);
    }
  }, [profile]);

  // Listen for toggle event from chat header
  useEffect(() => {
    const handleToggle = () => {
      console.log('[MainDashboard] Received toggle event')
      setMembersSidebarOpen(prev => !prev)
    }
    window.addEventListener('toggleMembersSidebar', handleToggle)
    return () => window.removeEventListener('toggleMembersSidebar', handleToggle)
  }, [])

  // keep the group name/icon in sync when someone changes them
  // this way if you're viewing a group and someone renames it, you see the new name instantly
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('group_updates_main_dashboard')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_chats',
        },
        (payload) => {
          console.log('[MainDashboard] Group updated:', payload);
          // only update if we're actually looking at this group rn
          if (selectedGroupChat && payload.new.id === selectedGroupChat.id) {
            setSelectedGroupChat({
              id: payload.new.id,
              name: payload.new.name,
              icon: payload.new.icon_url
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile?.id, selectedGroupChat, supabase]);

  // so the back/forward buttons actually work properly
  // nobody likes when back button is broken, that's just annoying
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;

      if (path === '/me') {
        setSelectedDm(null);
        setSelectedGroupChat(null);
        setCurrentView('friends');
      } else if (path.startsWith('/me/group_')) {
        const groupId = path.replace('/me/group_', '');
        // gotta load the group info again when navigating back
        supabase
          .from("group_chats")
          .select("id, name, icon_url")
          .eq("id", groupId)
          .single()
          .then(({ data: groupData }) => {
            if (groupData) {
              setSelectedGroupChat({
                id: groupData.id,
                name: groupData.name,
                icon: groupData.icon_url
              });
              setSelectedDm(null);
              setCurrentView('group-chat');
            }
          });
      } else if (path.startsWith('/me/')) {
        const tag = decodeURIComponent(path.replace('/me/', ''));
        supabase
          .from("profiles")
          .select("id, username, tag, display_name, avatar_url, profile_theme")
          .eq("tag", tag)
          .single()
          .then(({ data: dmUser }) => {
            if (dmUser) {
              const displayName = dmUser.display_name || dmUser.username;

              setSelectedDm({
                name: displayName,
                tag: dmUser.tag,
                avatar: dmUser.avatar_url || '',
                userId: dmUser.id,
                profileTheme: dmUser.profile_theme || 'light'
              });
              setSelectedGroupChat(null);
              setCurrentView("dm");
            }
          });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [supabase]);

  const handleOnboardingComplete = (updatedProfile: Profile) => {
    setProfile(updatedProfile);
    setShowOnboarding(false);
  };

  const handleNavigateHome = () => {
    const wsManager = require('@/lib/websocket-manager').wsManager
    wsManager.leaveCurrentRoom()
    window.history.pushState({}, '', '/me');
    setCurrentView("friends");
    setSelectedDm(null);
    setSelectedGroupChat(null);
  };

  if (isInitializing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      {showOnboarding && profile && (
        <OnboardingModal
          userId={profile.id}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* main layout - top bar, sidebar, and content area */}
      <div className="flex flex-col h-full w-full bg-gray-50">

        {/* the top bar with navigation and user info */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-3 gap-2 shadow-sm relative">
          {/* button to show/hide sidebar - pretty standard stuff */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="relative w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-all duration-200 flex-shrink-0"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-gray-600" /> : <Menu className="w-4 h-4 text-gray-600" />}
            {totalUnread > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none pointer-events-none transition-opacity duration-200 ${sidebarOpen ? 'opacity-0' : 'opacity-100'}`}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>

          {/* shows where you are - like "Home / GroupName" */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={handleNavigateHome}
              className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-xs font-semibold px-2 py-1 rounded-md transition-all duration-200 flex-shrink-0"
            >
              Home
            </button>
            {currentView === "dm" && selectedDm && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-gray-300 text-xs">/</span>
                <span className="text-gray-900 font-semibold text-xs px-2 py-1 bg-gray-50 rounded-md truncate max-w-[120px]">{selectedDm.name}</span>
              </div>
            )}
            {currentView === "group-chat" && selectedGroupChat && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-gray-300 text-xs">/</span>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
                  {selectedGroupChat.icon && selectedGroupChat.icon.trim() !== '' ? (
                    <img src={selectedGroupChat.icon} alt="" className="w-4 h-4 rounded object-cover" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-gray-200 flex items-center justify-center">
                      <Users className="w-2.5 h-2.5 text-gray-500" />
                    </div>
                  )}
                  <span className="text-gray-900 font-semibold text-xs truncate max-w-[100px]">{selectedGroupChat.name}</span>
                </div>
              </div>
            )}
          </div>

          {/* centered watermark - absolutely positioned for true center */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-10">
            <ProtectedWatermark />
          </div>

          {/* spacer to push profile to the right */}
          <div className="flex-1" />

          {/* your profile pic and name in the corner */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-700 font-semibold hidden sm:block">
              {profile?.display_name || profile?.username}
            </span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-sm ring-1 ring-gray-200">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">
                  {profile?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* where everything happens - sidebar + chat area */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Mobile backdrop - closes sidebar on tap */}
          {isMobile && sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-30 transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* sidebar with friends/DMs/groups - overlay on mobile, push on desktop */}
          <div className={`${
            isMobile
              ? `fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
              : `${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200 overflow-hidden flex-shrink-0`
          } bg-white border-r border-gray-200`}>
            <UnifiedSidebar
              profile={profile}
              currentView={currentView}
              onViewChange={(view) => {
                if (view === "friends" || view === "message-requests" || view === "inbox") {
                  const wsManager = require('@/lib/websocket-manager').wsManager
                  wsManager.leaveCurrentRoom()
                  window.history.pushState({}, '', '/me');
                  setCurrentView(view);
                  setSelectedDm(null);
                  setSelectedGroupChat(null);
                  if (isMobile) setSidebarOpen(false);
                }
              }}
              onDmSelect={(dm) => {
                setSelectedDm(dm);
                setSelectedGroupChat(null);
                setCurrentView("dm");
                window.history.pushState({}, '', `/me/${encodeURIComponent(dm.tag)}`);
                if (isMobile) setSidebarOpen(false);
              }}
              onGroupChatSelect={async (groupChatId) => {
                console.log('[MainDashboard] Group chat selected:', groupChatId);
                if (isMobile) setSidebarOpen(false);
                // need to fetch the full group details before showing it
                const { data: groupData } = await supabase
                  .from("group_chats")
                  .select("id, name, icon_url")
                  .eq("id", groupChatId)
                  .single();

                if (groupData) {
                  setSelectedGroupChat({
                    id: groupData.id,
                    name: groupData.name,
                    icon: groupData.icon_url
                  });
                  setSelectedDm(null);
                  setCurrentView("group-chat");
                  window.history.pushState({}, '', `/me/group_${groupChatId}`);
                }
              }}
              selectedConversation={
                selectedDm
                  ? { type: 'dm', id: selectedDm.userId }
                  : selectedGroupChat
                  ? { type: 'group', id: selectedGroupChat.id }
                  : null
              }
            />
          </div>

          {/* the actual chat or friends list goes here */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <IdleArea
              profile={profile}
              currentView={currentView}
              selectedDm={selectedDm}
              selectedGroupChat={selectedGroupChat?.id || null}
              showMembersSidebar={membersSidebarOpen}
              isMobile={isMobile}
            />
          </div>
        </div>
      </div>
    </>
  );
}
