/**
 * Mention utilities for parsing and rendering @mentions in messages
 */

export interface ParsedMention {
  userId: string;
  tag: string;
  startIndex: number;
  endIndex: number;
}

// Regex to match @tag format (letters, numbers, underscores, periods)
const MENTION_REGEX = /@([a-zA-Z0-9_.]+)/g;

/**
 * Extract mention tags from message content
 * Returns array of tags (without @)
 */
export function extractMentionTags(content: string): string[] {
  const matches = content.matchAll(MENTION_REGEX);
  return Array.from(matches).map(m => m[1]);
}

/**
 * Check if a message content contains any mentions
 */
export function hasMentions(content: string): boolean {
  return MENTION_REGEX.test(content);
}

/**
 * Check if a specific user is mentioned in the content
 */
export function isUserMentioned(content: string, userTag: string): boolean {
  const tags = extractMentionTags(content);
  return tags.some(tag => tag.toLowerCase() === userTag.toLowerCase());
}

/**
 * Check if a specific user is mentioned (by ID) in the mentions array
 */
export function isUserMentionedById(mentions: string[] | null | undefined, userId: string): boolean {
  if (!mentions || !Array.isArray(mentions)) return false;
  return mentions.includes(userId);
}

/**
 * Insert a mention tag at the current cursor position, replacing any partial @query
 */
export function insertMention(
  currentText: string,
  cursorPosition: number,
  userTag: string
): { newText: string; newCursorPosition: number } {
  // Find the @ symbol before cursor
  const textBeforeCursor = currentText.slice(0, cursorPosition);
  const atIndex = textBeforeCursor.lastIndexOf('@');

  if (atIndex === -1) {
    // No @ found, just append
    const newText = currentText + `@${userTag} `;
    return { newText, newCursorPosition: newText.length };
  }

  // Replace from @ to cursor with the full mention
  const beforeAt = currentText.slice(0, atIndex);
  const afterCursor = currentText.slice(cursorPosition);
  const newText = `${beforeAt}@${userTag} ${afterCursor}`;
  const newCursorPosition = atIndex + userTag.length + 2; // +2 for @ and space

  return { newText, newCursorPosition };
}

/**
 * Get the current mention query from text (what's after the last @)
 * Returns null if not currently typing a mention
 */
export function getMentionQuery(text: string, cursorPosition: number): string | null {
  const textBeforeCursor = text.slice(0, cursorPosition);

  // Find the last @ before cursor
  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  // Check if there's a space between @ and cursor (mention complete)
  const textAfterAt = textBeforeCursor.slice(atIndex + 1);
  if (textAfterAt.includes(' ')) return null;

  // Check if @ is at start or preceded by a space (valid mention start)
  if (atIndex > 0 && textBeforeCursor[atIndex - 1] !== ' ') return null;

  return textAfterAt;
}

/**
 * Parse message content and split into segments (text and mentions)
 */
export interface MessageSegment {
  type: 'text' | 'mention';
  content: string;
  tag?: string; // Only for mention type
}

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  // Reset regex
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before this mention
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }

    // Add the mention
    segments.push({
      type: 'mention',
      content: match[0], // Full match including @
      tag: match[1] // Just the tag without @
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  return segments;
}
