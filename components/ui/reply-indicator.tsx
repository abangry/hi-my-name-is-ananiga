'use client';

import { X } from 'lucide-react';

interface ReplyIndicatorProps {
  username: string;
  messagePreview: string;
  onCancel: () => void;
}

export function ReplyIndicator({ username, messagePreview, onCancel }: ReplyIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-l-4 border-blue-600">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-blue-600">
          Replying to @{username}
        </div>
        <div className="text-xs text-gray-600 truncate">
          {messagePreview}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
        title="Cancel reply"
      >
        <X className="w-4 h-4 text-gray-600" />
      </button>
    </div>
  );
}
