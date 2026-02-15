"use client";

import { X, UserPlus, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { inviteToGroup } from "@/lib/actions/group-chats";
import { wsManager } from "@/lib/websocket-manager";

interface Friend {
  id: string;
  username: string;
  tag: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
}

interface InviteToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

export function InviteToGroupModal({
  isOpen,
  onClose,
  groupId,
  groupName,
}: InviteToGroupModalProps) {
  const [mounted, setMounted] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const fetchFriends = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Get all friends
      const { data: friendsData, error: friendsError } = await supabase.rpc(
        "get_friends_with_presence",
        { p_user_id: user.id }
      );

      if (friendsError) {
        console.error("[InviteToGroupModal] Error fetching friends:", friendsError);
        setLoading(false);
        return;
      }

      // Get existing group members to filter them out
      const { data: membersData, error: membersError } = await supabase.rpc(
        "get_group_chat_members",
        { p_group_chat_id: groupId }
      );

      if (membersError) {
        console.error("[InviteToGroupModal] Error fetching members:", membersError);
        setLoading(false);
        return;
      }

      // Filter out users already in the group
      const memberIds = new Set(membersData?.map((m: any) => m.user_id) || []);
      const availableFriends = friendsData?.filter(
        (f: any) => !memberIds.has(f.friend_id)
      ).map((f: any) => ({
        id: f.friend_id,
        username: f.username,
        tag: f.tag,
        display_name: f.display_name,
        avatar_url: f.avatar_url,
        status: f.status,
      })) || [];

      setFriends(availableFriends);
      setLoading(false);
    };

    fetchFriends();
  }, [isOpen, groupId, supabase]);

  const toggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriends(newSelected);
  };

  const handleInvite = async () => {
    if (selectedFriends.size === 0) return;

    setInviting(true);
    console.log("[InviteToGroupModal] Inviting users:", Array.from(selectedFriends));

    const invitedUserIds = Array.from(selectedFriends);
    const result = await inviteToGroup(groupId, invitedUserIds);

    if (result.success) {
      console.log("[InviteToGroupModal] Successfully invited users");
      // Emit WebSocket event for real-time update to invited users and group members
      wsManager.emitGroupInvite(groupId, invitedUserIds, groupName);
      setSelectedFriends(new Set());
      onClose();
    } else {
      console.error("[InviteToGroupModal] Failed to invite:", result.error);
      alert(`Failed to invite users: ${result.error}`);
    }

    setInviting(false);
  };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Invite to Group</h2>
              <p className="text-sm text-gray-500 mt-1">{groupName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading friends...</div>
          ) : friends.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <UserPlus className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No friends available to invite</p>
              <p className="text-xs mt-1">
                All your friends are already in this group
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend) => {
                const displayName = friend.display_name || friend.username;
                const initials = displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                const isSelected = selectedFriends.has(friend.id);

                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend.id)}
                    className={`w-full p-2.5 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 transition-all ${
                      isSelected
                        ? "bg-blue-600/10 border-2 border-blue-600"
                        : "bg-gray-100 hover:bg-gray-200 border-2 border-transparent"
                    }`}
                  >
                    {/* Avatar - Responsive */}
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
                        {friend.avatar_url ? (
                          <img
                            src={friend.avatar_url}
                            alt={displayName}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-white text-xs sm:text-sm font-semibold">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          friend.status === "online"
                            ? "bg-[#23a559]"
                            : friend.status === "idle"
                            ? "bg-[#f0b232]"
                            : friend.status === "dnd"
                            ? "bg-[#f23f43]"
                            : "bg-[#80848e]"
                        }`}
                      />
                    </div>

                    {/* User Info - Responsive */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {displayName}
                      </div>
                      <div className="text-xs text-gray-500 truncate">@{friend.tag}</div>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="flex-shrink-0">
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-600 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-200 flex gap-2 justify-end bg-gray-50 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={inviting}
            className="px-3 sm:px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleInvite}
            disabled={inviting || selectedFriends.size === 0}
            className="px-3 sm:px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-[#04527a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {inviting
              ? "Inviting..."
              : `Invite ${selectedFriends.size > 0 ? `(${selectedFriends.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
