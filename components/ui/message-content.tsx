'use client';

import { parseMessageContent, isUserMentionedById } from '@/lib/utils/mentions';

interface MessageContentProps {
  content: string;
  mentions?: string[] | null; // Array of mentioned user IDs
  currentUserId?: string;
  className?: string;
}

/**
 * Renders message content with styled @mentions
 * Mentions appear with a blue-ish background
 */
export function MessageContent({
  content,
  mentions,
  currentUserId,
  className = ''
}: MessageContentProps) {
  const segments = parseMessageContent(content);

  // Check if current user is mentioned in this message
  const isCurrentUserMentioned = currentUserId && isUserMentionedById(mentions, currentUserId);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'mention') {
          return (
            <span
              key={index}
              className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded bg-blue-600/15 text-blue-600 font-medium hover:bg-blue-600/25 cursor-pointer transition-colors"
              title={`@${segment.tag}`}
            >
              @{segment.tag}
            </span>
          );
        }
        return <span key={index}>{segment.content}</span>;
      })}
    </span>
  );
}

/**
 * Check if message container should be highlighted (user is mentioned)
 */
export function getMessageHighlightClass(
  mentions: string[] | null | undefined,
  currentUserId: string | undefined
): string {
  if (!currentUserId || !mentions) return '';
  if (isUserMentionedById(mentions, currentUserId)) {
    return 'bg-blue-600/5 border-l-2 border-l-blue-600/50 -ml-2 pl-2';
  }
  return '';
}
