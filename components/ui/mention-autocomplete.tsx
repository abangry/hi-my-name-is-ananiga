'use client';

import { useEffect, useRef } from 'react';
import { AtSign } from 'lucide-react';

export interface MentionUser {
  id: string;
  username: string;
  tag: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface MentionAutocompleteProps {
  users: MentionUser[];
  query: string;
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  selectedIndex: number;
}

export function MentionAutocomplete({
  users,
  query,
  onSelect,
  onClose,
  selectedIndex,
}: MentionAutocompleteProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Filter users based on query
  const filteredUsers = users.filter(user => {
    const searchQuery = query.toLowerCase();
    const displayName = (user.display_name || user.username).toLowerCase();
    const tag = user.tag.toLowerCase();
    return displayName.includes(searchQuery) || tag.includes(searchQuery);
  });

  if (filteredUsers.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="mb-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <AtSign className="w-4 h-4 text-blue-600" />
        <span className="text-xs font-medium text-gray-600">
          Mention someone {query && <span className="text-gray-400">— "{query}"</span>}
        </span>
      </div>

      {/* User list */}
      <div ref={listRef} className="max-h-48 overflow-y-auto">
        {filteredUsers.map((user, index) => {
          const displayName = user.display_name || user.username;
          const initials = displayName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          return (
            <button
              key={user.id}
              data-index={index}
              onClick={() => onSelect(user)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-600/10'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center flex-shrink-0">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={displayName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-white text-xs font-semibold">{initials}</span>
                )}
              </div>

              {/* User info */}
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="font-medium text-gray-900 truncate">{displayName}</span>
                <span className="text-xs text-gray-500 truncate">@{user.tag}</span>
              </div>

              {/* Selection indicator */}
              {index === selectedIndex && (
                <div className="flex-shrink-0 text-xs text-blue-600 font-medium">
                  Enter ↵
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
