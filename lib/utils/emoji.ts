// Test if a single grapheme cluster is an emoji (excludes digits, #, * etc.)
const emojiTestRegex = /\p{Extended_Pictographic}/u
const flagRegex = /\p{Regional_Indicator}{2}/u

function isEmojiGrapheme(segment: string): boolean {
  if (segment.length === 1 && segment.charCodeAt(0) < 256) return false
  return emojiTestRegex.test(segment) || flagRegex.test(segment)
}

/**
 * Check if a string contains only emojis (and optional whitespace)
 */
export function isEmojiOnly(text: string): boolean {
  if (!text || !text.trim()) return false

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  for (const { segment } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) continue
    if (!isEmojiGrapheme(segment)) return false
  }
  return true
}

/**
 * Count the number of emojis in a string (each visual emoji = 1, regardless of ZWJ/flags/skin tones)
 */
export function countEmojis(text: string): number {
  if (!text) return 0

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  let count = 0
  for (const { segment } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) continue
    if (isEmojiGrapheme(segment)) count++
  }
  return count
}

/**
 * Check if a string contains only digits (and optional whitespace)
 */
function isNumberOnly(text: string): boolean {
  if (!text || !text.trim()) return false
  return /^\s*\d[\d\s]*\s*$/.test(text)
}

/**
 * Count the number of digit characters in a string
 */
function countDigits(text: string): number {
  return (text.match(/\d/g) || []).length
}

/**
 * Get the appropriate text size class for emoji-only or number-only messages
 * Returns larger sizes for 1-9 emojis/digits, normal size for 10+
 */
export function getEmojiMessageStyle(text: string): { isLargeEmoji: boolean; className: string } {
  const emojiOnly = isEmojiOnly(text)
  const numberOnly = !emojiOnly && isNumberOnly(text)

  if (!emojiOnly && !numberOnly) {
    return { isLargeEmoji: false, className: 'text-sm' }
  }

  const count = emojiOnly ? countEmojis(text) : countDigits(text)

  if (count === 0) {
    return { isLargeEmoji: false, className: 'text-sm' }
  }

  if (count === 1) {
    return { isLargeEmoji: true, className: 'text-5xl leading-tight' }
  }

  if (count === 2) {
    return { isLargeEmoji: true, className: 'text-4xl leading-tight' }
  }

  if (count <= 4) {
    return { isLargeEmoji: true, className: 'text-3xl leading-tight' }
  }

  if (count <= 6) {
    return { isLargeEmoji: true, className: 'text-2xl leading-snug' }
  }

  if (count <= 9) {
    return { isLargeEmoji: true, className: 'text-xl leading-snug' }
  }

  // 10+ emojis/digits: normal text size
  return { isLargeEmoji: false, className: 'text-sm' }
}
