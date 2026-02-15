'use client';

import { useState, useEffect } from 'react';
import { X, Users, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Friend {
  friend_id: string;
  username: string;
  tag: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
}

interface CreateGroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (groupId: string) => void;
  currentUserId: string;
}

export function CreateGroupChatModal({
  isOpen,
  onClose,
  onGroupCreated,
  currentUserId,
}: CreateGroupChatModalProps) {
  const [groupName, setGroupName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
    }
  }, [isOpen]);

  const fetchFriends = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_friends', {
        p_user_id: currentUserId,
      });

      if (error) throw error;
      console.log('[CreateGroupChatModal] Fetched friends:', data);
      setFriends(data || []);
    } catch (err) {
      console.error('[CreateGroupChatModal] Error fetching friends:', err);
      setError('Failed to load friends');
    }
  };

  const toggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriends(newSelected);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    if (selectedFriends.size === 0) {
      setError('Select at least one friend');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const memberIds = [currentUserId, ...Array.from(selectedFriends)];
      console.log('[CreateGroupChatModal] Creating group with members:', memberIds);

      const { data, error } = await supabase.rpc('create_group_chat', {
        p_name: groupName.trim(),
        p_creator_id: currentUserId,
        p_member_ids: memberIds,
      });

      if (error) throw error;

      console.log('[CreateGroupChatModal] Group created successfully, ID:', data);
      console.log('[CreateGroupChatModal] All members should now see this group:', memberIds);

      // Emit WebSocket event to notify ALL users (including creator)
      const { wsManager } = await import('@/lib/websocket-manager');
      // Include creator in the invited list so they also get the event
      const allUserIds = [currentUserId, ...Array.from(selectedFriends)];
      wsManager.emitGroupInvite(data, allUserIds, groupName.trim());

      onGroupCreated(data);
      handleClose();
    } catch (err: any) {
      console.error('[CreateGroupChatModal] Error creating group chat:', err);
      setError(err.message || 'Failed to create group chat');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setGroupName('');
    setSelectedFriends(new Set());
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-lg shadow-xl w-full h-full sm:h-auto sm:max-w-md sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">
              Create Group Chat
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Group Name Input */}
          <div>
            <label
              htmlFor="groupName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Group Name
            </label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              maxLength={100}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Friends Selector */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex-shrink-0">
              Add Friends ({selectedFriends.size} selected)
            </label>
            <div className="space-y-1 flex-1 overflow-y-auto border border-gray-200 rounded-lg">
              {friends.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No friends to add
                </div>
              ) : (
                friends.map((friend) => {
                  const isSelected = selectedFriends.has(friend.friend_id);
                  const displayName = friend.display_name || friend.username;
                  const initials = displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <button
                      key={friend.friend_id}
                      onClick={() => toggleFriend(friend.friend_id)}
                      className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 transition-colors ${
                        isSelected
                          ? 'bg-blue-600/10 border-l-4 border-blue-600'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Avatar */}
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
                      </div>

                      {/* User Info */}
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                          {displayName}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          @{friend.tag}
                        </div>
                      </div>

                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-3 sm:p-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={loading || !groupName.trim() || selectedFriends.size === 0}
            className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-[#044a6b] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Creating...</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Create Group</span>
                <span className="sm:hidden">Create</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
