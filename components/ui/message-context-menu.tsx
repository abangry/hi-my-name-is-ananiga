'use client';

import { useEffect, useRef } from 'react';
import { Reply, Trash2, Copy, CheckCheck, Pencil, Star, Smile } from 'lucide-react';

interface MessageContextMenuProps {
  x: number;
  y: number;
  isOwnMessage: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onMarkAsRead: () => void;
  onToggleFavorite?: () => void;
  isFavorited?: boolean;
  showFavoriteOption?: boolean;
  onReact?: () => void;
  quickEmojis?: string[];
  onQuickReact?: (emoji: string) => void;
  reactedEmojis?: string[];
}

export function MessageContextMenu({
  x,
  y,
  isOwnMessage,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onMarkAsRead,
  onToggleFavorite,
  isFavorited,
  showFavoriteOption,
  onReact,
  quickEmojis,
  onQuickReact,
  reactedEmojis,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // smart positioning - keep the menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // add some padding so it doesn't touch the edges
      const padding = 8;

      let adjustedX = x;
      let adjustedY = y;

      // if menu goes off right edge, show it on the left side of cursor
      if (x + rect.width + padding > viewportWidth) {
        adjustedX = Math.max(padding, x - rect.width);
      }

      // if menu goes off bottom edge, show it above the cursor
      if (y + rect.height + padding > viewportHeight) {
        adjustedY = Math.max(padding, y - rect.height);
      }

      // make sure it doesn't go off the top or left edges either
      adjustedX = Math.max(padding, Math.min(adjustedX, viewportWidth - rect.width - padding));
      adjustedY = Math.max(padding, Math.min(adjustedY, viewportHeight - rect.height - padding));

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const menuItems = [
    {
      icon: Reply,
      label: 'Reply',
      onClick: () => {
        onReply();
        onClose();
      },
      show: true,
    },
    {
      icon: Smile,
      label: 'Add Reaction',
      onClick: () => {
        if (onReact) {
          onReact();
        }
        onClose();
      },
      show: !!onReact && !quickEmojis?.length,
    },
    {
      icon: Pencil,
      label: 'Edit Message',
      onClick: () => {
        if (onEdit) {
          onEdit();
          onClose();
        }
      },
      show: isOwnMessage && !!onEdit,
    },
    {
      icon: Copy,
      label: 'Copy Text',
      onClick: () => {
        onCopy();
        onClose();
      },
      show: true,
    },
    {
      icon: Star,
      label: isFavorited ? 'Remove from Favorites' : 'Add to Favorites',
      onClick: () => {
        if (onToggleFavorite) {
          onToggleFavorite();
          onClose();
        }
      },
      show: !!showFavoriteOption,
    },
    {
      icon: CheckCheck,
      label: 'Mark as Read',
      onClick: () => {
        onMarkAsRead();
        onClose();
      },
      show: !isOwnMessage,
    },
    // DELETE MESSAGE — currently disabled.
    // To re-enable: uncomment the block below (and remove this comment).
    // {
    //   icon: Trash2,
    //   label: 'Delete Message',
    //   onClick: () => {
    //     if (onDelete) {
    //       onDelete();
    //       onClose();
    //     }
    //   },
    //   show: isOwnMessage,
    //   danger: true,
    // },
  ];

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 ${quickEmojis && quickEmojis.length > 0 ? 'w-56' : 'w-48'}`}
      style={{ left: x, top: y }}
    >
      {/* Quick emoji row */}
      {quickEmojis && quickEmojis.length > 0 && onQuickReact && (
        <div className="flex items-center justify-around px-2 py-1.5 border-b border-gray-100">
          {quickEmojis.map((emoji) => {
            const hasReacted = reactedEmojis?.includes(emoji);
            return (
              <button
                key={emoji}
                onClick={() => {
                  onQuickReact(emoji);
                  onClose();
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-lg hover:bg-gray-100 transition-colors ${hasReacted ? 'bg-blue-100 ring-1 ring-blue-300' : ''}`}
              >
                {emoji}
              </button>
            );
          })}
          <button
            onClick={() => {
              if (onReact) onReact();
              onClose();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            title="More reactions"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>
      )}
      {menuItems
        .filter((item) => item.show)
        .map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
              item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
            }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        ))}
    </div>
  );
}
