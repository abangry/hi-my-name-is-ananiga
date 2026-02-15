"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { User, UserX, UserMinus, Users, BellOff } from "lucide-react"

interface UserContextMenuProps {
  userId: string
  username: string
  tag: string
  x: number
  y: number
  onClose: () => void
  onViewProfile: (userId: string) => void
  onIgnore?: (userId: string) => void
  onBlock?: (userId: string) => void
  onInviteToGroup?: (userId: string) => void
  onMute?: (userId: string, hours: number) => void
}

export function UserContextMenu({
  userId,
  username,
  tag,
  x,
  y,
  onClose,
  onViewProfile,
  onIgnore,
  onBlock,
  onInviteToGroup,
  onMute
}: UserContextMenuProps) {
  const [showMuteSubmenu, setShowMuteSubmenu] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const muteOptions = [
    { label: "For 1 minute (test)", hours: 1/60 },
    { label: "For 2 minutes (test)", hours: 2/60 },
    { label: "For 1 hour", hours: 1 },
    { label: "For 8 hours", hours: 8 },
    { label: "For 24 hours", hours: 24 },
    { label: "Until I turn it back on", hours: -1 }
  ]

  if (!mounted) return null

  const menu = (
    <>
      {/* Invisible backdrop to close menu */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
      />

      {/* Context Menu */}
      <div
        className="fixed z-[9999] w-56 bg-white rounded-xl shadow-2xl border border-gray-200 py-2"
        style={{
          left: x,
          top: y,
        }}
      >
        {/* User Info Header */}
        <div className="px-3 py-2 border-b border-gray-200 mb-2">
          <div className="text-sm font-bold text-gray-900">{username}</div>
          <div className="text-xs text-gray-500">#{tag}</div>
        </div>

        {/* Menu Items */}
        <button
          onClick={() => {
            onViewProfile(userId)
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 flex items-center gap-3 rounded-lg mx-1"
        >
          <User size={16} />
          Profile
        </button>

        {onInviteToGroup && (
          <button
            onClick={() => {
              onInviteToGroup(userId)
              onClose()
            }}
            className="w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 flex items-center gap-3 rounded-lg mx-1"
          >
            <Users size={16} />
            Invite to Group
          </button>
        )}

        {/* Mute with submenu */}
        {onMute && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowMuteSubmenu(true)}
              onMouseLeave={() => setShowMuteSubmenu(false)}
              className="w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 flex items-center gap-3 rounded-lg mx-1"
            >
              <BellOff size={16} />
              Mute
              <span className="ml-auto">›</span>
            </button>

            {/* Submenu */}
            {showMuteSubmenu && (
              <div
                onMouseEnter={() => setShowMuteSubmenu(true)}
                onMouseLeave={() => setShowMuteSubmenu(false)}
                className="absolute left-full top-0 ml-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 py-2"
              >
                {muteOptions.map((option) => (
                  <button
                    key={option.hours}
                    onClick={() => {
                      onMute(userId, option.hours)
                      onClose()
                    }}
                    className="w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-lg mx-1"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 my-2" />

        {onIgnore && (
          <button
            onClick={() => {
              onIgnore(userId)
              onClose()
            }}
            className="w-full px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 flex items-center gap-3 rounded-lg mx-1"
          >
            <UserMinus size={16} />
            Ignore
          </button>
        )}

        {onBlock && (
          <button
            onClick={() => {
              onBlock(userId)
              onClose()
            }}
            className="w-full px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-200 flex items-center gap-3 rounded-lg mx-1"
          >
            <UserX size={16} />
            Block
          </button>
        )}
      </div>
    </>
  )

  return createPortal(menu, document.body)
}
