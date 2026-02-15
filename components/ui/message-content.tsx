'use client';

import { parseMessageContent, isUserMentionedById } from '@/lib/utils/mentions';
import { LinkPreview } from '@/components/ui/link-preview';

interface MessageContentProps {
  content: string;
  mentions?: string[] | null; // Array of mentioned user IDs
  currentUserId?: string;
  className?: string;
  showLinkPreviews?: boolean;
}

const URL_REGEX = /https?:\/\/[^\s<>]+/gi;

/** Split plain text into text and URL segments */
function splitTextWithUrls(text: string): { type: 'text' | 'url'; content: string }[] {
  const parts: { type: 'text' | 'url'; content: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(URL_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Strip trailing punctuation that's likely not part of the URL
    let url = match[0];
    const trailingPunct = url.match(/[).,;:!?]+$/);
    if (trailingPunct) {
      url = url.slice(0, -trailingPunct[0].length);
    }
    parts.push({ type: 'url', content: url });
    lastIndex = match.index + url.length;
    // Adjust regex lastIndex for the stripped punctuation
    regex.lastIndex = lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return parts;
}

/** Extract all URLs from message content */
export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX);
  if (!matches) return [];
  return matches.map(url => {
    const trailingPunct = url.match(/[).,;:!?]+$/);
    return trailingPunct ? url.slice(0, -trailingPunct[0].length) : url;
  });
}

/**
 * Renders message content with styled @mentions and clickable links
 */
export function MessageContent({
  content,
  mentions,
  currentUserId,
  className = '',
  showLinkPreviews = true
}: MessageContentProps) {
  const segments = parseMessageContent(content);
  const urls = showLinkPreviews ? extractUrls(content) : [];

  return (
    <>
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
          // For plain text segments, split by URLs to make them clickable
          const textParts = splitTextWithUrls(segment.content);
          return (
            <span key={index}>
              {textParts.map((part, i) => {
                if (part.type === 'url') {
                  return (
                    <a
                      key={i}
                      href={part.content}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {part.content}
                    </a>
                  );
                }
                return <span key={i}>{part.content}</span>;
              })}
            </span>
          );
        })}
      </span>
      {/* Link previews - show for first URL only */}
      {urls.length > 0 && (
        <LinkPreview url={urls[0]} />
      )}
    </>
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
