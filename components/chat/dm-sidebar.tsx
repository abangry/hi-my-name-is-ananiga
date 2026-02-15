"use client";

import { User, Plus, Settings, Mic, Headphones } from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types/database.types";
import { updateCustomStatus, getCurrentUserPresence, UserStatus } from "@/lib/actions/presence";

interface DMChannel {
  id: string;
  other_user_id: string;
  other_username: string;
  other_avatar_url: string | null;
  other_user_status: "online" | "idle" | "dnd" | "offline";
  last_message_content: string | null;
  last_message_at: string | null;
}

export function DMSidebar() {
  const [dmChannels, setDmChannels] = useState<DMChannel[]>([]);
  const [selectedDmId, setSelectedDmId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentStatus, setCurrentStatus] = useState<UserStatus>("online");
  const [customStatus, setCustomStatus] = useState("");
  const [customStatusInput, setCustomStatusInput] = useState("");
  const [isEditingCustomStatus, setIsEditingCustomStatus] = useState(false);

  const supabase = createClient();

  // Fetch user profile and presence
  useEffect(() => {
    let presenceChannel: any = null;

    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch presence data
      const presenceResult = await getCurrentUserPresence();
      if (presenceResult.success && presenceResult.data) {
        setCurrentStatus(presenceResult.data.status);
        setCustomStatus(presenceResult.data.custom_status || "");
        setCustomStatusInput(presenceResult.data.custom_status || "");
      }

      // Subscribe to presence updates for real-time status changes
      presenceChannel = supabase
        .channel('user_presence_updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_presence',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('[DMSidebar] Presence update:', payload);
            if (payload.new && typeof payload.new === 'object') {
              const newData = payload.new as any;
              setCurrentStatus(newData.status);
              setCustomStatus(newData.custom_status || "");
              setCustomStatusInput(newData.custom_status || "");
            }
          }
        )
        .subscribe();
    };

    fetchProfile();

    return () => {
      if (presenceChannel) {
        presenceChannel.unsubscribe();
      }
    };
  }, [supabase]);

  // TODO: Fetch DM channels from Supabase

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] shadow-sm">
        <span className="font-semibold text-white text-[15px]">
          Direct Messages
        </span>
        <button className="text-[#b5bac1] hover:text-white transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* DM List */}
      <div className="flex-1 overflow-y-auto pt-4 scrollbar-thin scrollbar-thumb-[#1e1f22] scrollbar-track-transparent">
        {dmChannels.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[#949ba4] text-sm">No direct messages yet</p>
          </div>
        ) : (
          dmChannels.map((dm) => (
            <button
              key={dm.id}
              onClick={() => setSelectedDmId(dm.id)}
              className={`
                w-full px-2 py-2 mx-2 rounded flex items-center gap-3
                transition-colors group
                ${
                  selectedDmId === dm.id
                    ? "bg-[#404249]"
                    : "hover:bg-[#35373c]"
                }
              `}
            >
              {/* Avatar with Status */}
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center">
                  {dm.other_avatar_url ? (
                    <img
                      src={dm.other_avatar_url}
                      alt={dm.other_username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-sm font-semibold">
                      {dm.other_username.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Status Indicator */}
                <div
                  className={`
                    absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#2b2d31]
                    ${
                      dm.other_user_status === "online"
                        ? "bg-[#23a559]"
                        : dm.other_user_status === "idle"
                        ? "bg-[#f0b232]"
                        : dm.other_user_status === "dnd"
                        ? "bg-[#f23f43]"
                        : "bg-[#80848e]"
                    }
                  `}
                />
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0 text-left">
                <div className="text-white text-sm font-medium truncate">
                  {dm.other_username}
                </div>
                {dm.last_message_content && (
                  <div className="text-[#949ba4] text-xs truncate">
                    {dm.last_message_content}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* User Bar */}
      <div className="bg-[#232428] px-2 py-2 flex flex-col gap-2">
        {/* User Info Row */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username || "User"}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-sm font-semibold">
                  {profile?.username?.charAt(0).toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div
              className={`
                absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#232428]
                ${
                  currentStatus === "online"
                    ? "bg-[#23a559]"
                    : currentStatus === "idle"
                    ? "bg-[#f0b232]"
                    : currentStatus === "dnd"
                    ? "bg-[#f23f43]"
                    : "bg-[#80848e]"
                }
              `}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate">
              {profile?.display_name || profile?.username || "Username"}
            </div>
            <div className="text-[#949ba4] text-xs truncate">
              {customStatus || (currentStatus === "offline" ? "Offline" : "Online")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="text-[#b5bac1] hover:text-white transition-colors p-1">
              <Mic className="w-4 h-4" />
            </button>
            <button className="text-[#b5bac1] hover:text-white transition-colors p-1">
              <Headphones className="w-4 h-4" />
            </button>
            <button className="text-[#b5bac1] hover:text-white transition-colors p-1">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Custom Status Input */}
        {isEditingCustomStatus ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customStatusInput}
              onChange={(e) => setCustomStatusInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  console.log('[DMSidebar] Saving custom status:', customStatusInput);
                  const result = await updateCustomStatus(customStatusInput || null);
                  console.log('[DMSidebar] Save result:', result);
                  if (result.success) {
                    setCustomStatus(customStatusInput);
                    setIsEditingCustomStatus(false);
                  }
                } else if (e.key === "Escape") {
                  setCustomStatusInput(customStatus);
                  setIsEditingCustomStatus(false);
                }
              }}
              placeholder="Set a custom status"
              className="flex-1 bg-[#1e1f22] text-white text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
            <button
              onClick={async () => {
                console.log('[DMSidebar] Save button clicked, status:', customStatusInput);
                const result = await updateCustomStatus(customStatusInput || null);
                console.log('[DMSidebar] Save result:', result);
                if (result.success) {
                  setCustomStatus(customStatusInput);
                  setIsEditingCustomStatus(false);
                }
              }}
              className="text-[#23a559] hover:text-[#1a7a40] text-xs font-semibold"
            >
              Save
            </button>
            <button
              onClick={() => {
                setCustomStatusInput(customStatus);
                setIsEditingCustomStatus(false);
              }}
              className="text-[#b5bac1] hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              console.log('[DMSidebar] Edit custom status clicked');
              setIsEditingCustomStatus(true);
            }}
            className="text-[#949ba4] hover:text-white text-xs text-left px-2 py-1 rounded hover:bg-[#1e1f22] transition-colors"
          >
            {customStatus || "Set a custom status"}
          </button>
        )}
      </div>
    </div>
  );
}
