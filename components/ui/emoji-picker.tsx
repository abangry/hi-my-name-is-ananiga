'use client'

import { useEffect, useRef } from 'react'
import { EmojiPicker as FrimousseEmojiPicker, type Emoji } from 'frimousse'

interface EmojiPickerProps {
  isOpen: boolean
  onClose: () => void
  onEmojiSelect: (emoji: string) => void
  position?: 'top' | 'bottom'
  frequentEmojis?: string[]
}

export function EmojiPicker({ isOpen, onClose, onEmojiSelect, position = 'top', frequentEmojis }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Delay to prevent immediate close on the same click that opened it
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={containerRef}
      className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 z-50`}
    >
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
        <FrimousseEmojiPicker.Root
          onEmojiSelect={(emoji: Emoji) => {
            onEmojiSelect(emoji.emoji)
          }}
          className="flex flex-col w-[320px] h-[400px]"
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <FrimousseEmojiPicker.Search
              placeholder="Search emoji..."
              className="w-full px-3 py-2 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </div>

          {/* Emoji list */}
          <FrimousseEmojiPicker.Viewport className="flex-1 overflow-y-auto">
            {/* Frequently Used section */}
            {frequentEmojis && frequentEmojis.length > 0 && (
              <div className="px-1 py-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-white sticky top-0">
                  Frequently Used
                </div>
                <div className="flex flex-wrap">
                  {frequentEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onEmojiSelect(emoji)
                      }}
                      className="flex items-center justify-center w-8 h-8 text-2xl rounded-md cursor-pointer transition-colors hover:bg-gray-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <FrimousseEmojiPicker.Loading className="flex items-center justify-center h-full text-gray-400">
              Loading emojis...
            </FrimousseEmojiPicker.Loading>
            <FrimousseEmojiPicker.Empty className="flex items-center justify-center h-full text-gray-400">
              No emoji found
            </FrimousseEmojiPicker.Empty>
            <FrimousseEmojiPicker.List
              className="px-1 py-1 select-none"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    {...props}
                    className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-white sticky top-0"
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div {...props} className="flex">
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    {...props}
                    className={`flex items-center justify-center w-8 h-8 text-2xl rounded-md cursor-pointer transition-colors ${
                      emoji.isActive ? 'bg-gray-200' : 'hover:bg-gray-100'
                    }`}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </FrimousseEmojiPicker.Viewport>
        </FrimousseEmojiPicker.Root>
      </div>
    </div>
  )
}
