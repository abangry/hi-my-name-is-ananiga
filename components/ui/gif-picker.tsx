'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, X, Star } from 'lucide-react'
import { useKlipy, type KlipyMedia } from '@/lib/hooks/use-klipy'
import { useMediaFavorites } from '@/lib/hooks/use-media-favorites'

interface GifPickerProps {
  isOpen: boolean
  onClose: () => void
  onGifSelect: (url: string) => void
  userId?: string
  position?: 'top' | 'bottom'
}

type Tab = 'trending' | 'favorites'

export function GifPicker({ isOpen, onClose, onGifSelect, userId, position = 'top' }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [gifs, setGifs] = useState<KlipyMedia[]>([])
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('trending')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { searchGifs, getTrendingGifs, loading, error } = useKlipy()
  const { favorites, toggleFavorite, isFavorite, refetch } = useMediaFavorites(userId, 'gif')

  // Refresh favorites when picker opens
  useEffect(() => {
    if (isOpen) refetch()
  }, [isOpen, refetch])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch GIFs based on query (only when on trending tab)
  useEffect(() => {
    if (!isOpen || activeTab === 'favorites') return

    const fetchGifs = async () => {
      let results: KlipyMedia[]
      if (debouncedQuery.trim()) {
        results = await searchGifs(debouncedQuery)
      } else {
        results = await getTrendingGifs()
      }
      setGifs(results)
    }

    fetchGifs()
  }, [isOpen, debouncedQuery, searchGifs, getTrendingGifs, activeTab])

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && activeTab === 'trending') {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen, activeTab])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

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

  const handleGifClick = useCallback((gif: KlipyMedia | { media_url: string }) => {
    const url = 'media_url' in gif ? gif.media_url : gif.url
    onGifSelect(url)
    onClose()
  }, [onGifSelect, onClose])

  const handleToggleFavorite = useCallback((e: React.MouseEvent, gif: KlipyMedia) => {
    e.stopPropagation()
    toggleFavorite(gif.url, gif.preview_url, gif.title)
  }, [toggleFavorite])

  if (!isOpen) return null

  return (
    <div
      ref={containerRef}
      className={`absolute ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 z-50`}
    >
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden w-[360px]">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('trending')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'trending'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {debouncedQuery ? 'Search' : 'Trending'}
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'favorites'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            Favorites
          </button>
        </div>

        {/* Search (only on trending tab) */}
        {activeTab === 'trending' && (
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search GIFs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-600/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full"
                >
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* GIF Grid */}
        <div className="h-[320px] overflow-y-auto p-2">
          {activeTab === 'trending' ? (
            // Trending/Search results
            loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-sm text-red-500">
                {error}
              </div>
            ) : gifs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                No GIFs found
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {gifs.map((gif) => (
                  <div
                    key={gif.id}
                    onClick={() => handleGifClick(gif)}
                    className="relative overflow-hidden rounded-lg hover:ring-2 hover:ring-blue-600 transition-all group aspect-video bg-gray-100 cursor-pointer"
                  >
                    <img
                      src={gif.preview_url}
                      alt={gif.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    {/* Favorite star */}
                    <button
                      onClick={(e) => handleToggleFavorite(e, gif)}
                      className={`absolute top-1 right-1 p-1 rounded-full transition-all ${
                        isFavorite(gif.url)
                          ? 'bg-yellow-400 text-white'
                          : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFavorite(gif.url) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            // Favorites tab
            favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-400">
                <Star className="w-8 h-8 mb-2 text-gray-300" />
                <p>No favorite GIFs yet</p>
                <p className="text-xs mt-1">Click the star on a GIF to save it</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {favorites.map((fav) => (
                  <div
                    key={fav.id}
                    onClick={() => handleGifClick(fav)}
                    className="relative overflow-hidden rounded-lg hover:ring-2 hover:ring-blue-600 transition-all group aspect-video bg-gray-100 cursor-pointer"
                  >
                    <img
                      src={fav.preview_url}
                      alt={fav.title || 'Favorite GIF'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    {/* Remove from favorites */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(fav.media_url, fav.preview_url)
                      }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-yellow-400 text-white"
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer - KLIPY attribution */}
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            Powered by <span className="font-medium">KLIPY</span>
          </p>
        </div>
      </div>
    </div>
  )
}
