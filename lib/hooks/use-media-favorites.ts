'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MediaFavorite {
  id: string
  media_url: string
  preview_url: string
  media_type: 'gif' | 'sticker'
  title: string | null
  created_at: string
}

export function useMediaFavorites(userId: string | undefined, mediaType: 'gif' | 'sticker') {
  const [favorites, setFavorites] = useState<MediaFavorite[]>([])
  const [favoriteUrls, setFavoriteUrls] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const refetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('media_favorites')
        .select('*')
        .eq('user_id', userId)
        .eq('media_type', mediaType)
        .order('created_at', { ascending: false })

      if (error) throw error

      setFavorites(data || [])
      setFavoriteUrls(new Set((data || []).map(f => f.media_url)))
    } catch (err) {
      console.error('[useMediaFavorites] Error loading:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, mediaType, supabase])

  // Load favorites on mount
  useEffect(() => {
    refetch()
  }, [refetch])

  const addFavorite = useCallback(async (mediaUrl: string, previewUrl: string, title?: string) => {
    if (!userId) return false

    try {
      const { data, error } = await supabase
        .from('media_favorites')
        .insert({
          user_id: userId,
          media_url: mediaUrl,
          preview_url: previewUrl,
          media_type: mediaType,
          title: title || null
        })
        .select()
        .single()

      if (error) throw error

      setFavorites(prev => [data, ...prev])
      setFavoriteUrls(prev => new Set([...prev, mediaUrl]))
      return true
    } catch (err) {
      console.error('[useMediaFavorites] Error adding:', err)
      return false
    }
  }, [userId, mediaType, supabase])

  const removeFavorite = useCallback(async (mediaUrl: string) => {
    if (!userId) return false

    try {
      const { error } = await supabase
        .from('media_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('media_url', mediaUrl)

      if (error) throw error

      setFavorites(prev => prev.filter(f => f.media_url !== mediaUrl))
      setFavoriteUrls(prev => {
        const newSet = new Set(prev)
        newSet.delete(mediaUrl)
        return newSet
      })
      return true
    } catch (err) {
      console.error('[useMediaFavorites] Error removing:', err)
      return false
    }
  }, [userId, supabase])

  const toggleFavorite = useCallback(async (mediaUrl: string, previewUrl: string, title?: string) => {
    if (favoriteUrls.has(mediaUrl)) {
      return removeFavorite(mediaUrl)
    } else {
      return addFavorite(mediaUrl, previewUrl, title)
    }
  }, [favoriteUrls, addFavorite, removeFavorite])

  const isFavorite = useCallback((mediaUrl: string) => {
    return favoriteUrls.has(mediaUrl)
  }, [favoriteUrls])

  return {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    refetch,
  }
}
