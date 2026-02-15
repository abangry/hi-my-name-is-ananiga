'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Link, Download, Star, Check } from 'lucide-react'

interface MediaPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  mediaUrl: string
  onToggleFavorite?: () => void
  isFavorited?: boolean
  showFavoriteButton?: boolean
}

export function MediaPreviewModal({
  isOpen,
  onClose,
  mediaUrl,
  onToggleFavorite,
  isFavorited,
  showFavoriteButton,
}: MediaPreviewModalProps) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(mediaUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = mediaUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(mediaUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Extract filename from URL or use fallback
      const filename = mediaUrl.split('/').pop()?.split('?')[0] || 'download'
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // CORS fallback: open in new tab
      window.open(mediaUrl, '_blank')
    }
  }

  if (!mounted || !isOpen) return null

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Media container */}
      <div
        className="max-w-[90vw] max-h-[80vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={mediaUrl}
          alt="Preview"
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
      </div>

      {/* Bottom toolbar */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-xl px-3 py-2 border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleCopyLink}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white flex items-center gap-2"
          title="Copy Link"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Link className="w-5 h-5" />
              <span className="text-sm">Copy Link</span>
            </>
          )}
        </button>

        <div className="w-px h-6 bg-white/20" />

        <button
          onClick={handleDownload}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white flex items-center gap-2"
          title="Download"
        >
          <Download className="w-5 h-5" />
          <span className="text-sm">Download</span>
        </button>

        {showFavoriteButton && onToggleFavorite && (
          <>
            <div className="w-px h-6 bg-white/20" />
            <button
              onClick={onToggleFavorite}
              className={`p-2 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2 ${
                isFavorited ? 'text-yellow-400' : 'text-white'
              }`}
              title={isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Star className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              <span className="text-sm">{isFavorited ? 'Favorited' : 'Favorite'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
