'use client'

import { useState, useCallback } from 'react'

const KLIPY_API_KEY = process.env.NEXT_PUBLIC_KLIPY_API_KEY || ''
const KLIPY_BASE_URL = 'https://api.klipy.com/api/v1'

export interface KlipyMedia {
  id: string
  title: string
  slug: string
  url: string
  preview_url: string
  width: number
  height: number
}

// The actual item structure from KLIPY API
// file.{hd|md|sm|xs}.{gif|webp|mp4|jpg}.{url|width|height|size}
interface KlipyFileFormat {
  url: string
  width: number
  height: number
  size: number
}

interface KlipyFileSizes {
  hd?: { gif?: KlipyFileFormat; webp?: KlipyFileFormat; mp4?: KlipyFileFormat; jpg?: KlipyFileFormat }
  md?: { gif?: KlipyFileFormat; webp?: KlipyFileFormat; mp4?: KlipyFileFormat; jpg?: KlipyFileFormat }
  sm?: { gif?: KlipyFileFormat; webp?: KlipyFileFormat; mp4?: KlipyFileFormat; jpg?: KlipyFileFormat }
  xs?: { gif?: KlipyFileFormat; webp?: KlipyFileFormat; mp4?: KlipyFileFormat; jpg?: KlipyFileFormat }
}

interface KlipyItem {
  id: number | string
  title: string
  slug: string
  file: KlipyFileSizes
  type: string
}

interface KlipyApiResponse {
  result: boolean
  data: {
    data: KlipyItem[]
    current_page: number
    per_page: number
    has_next: boolean
  }
}

function parseKlipyResponse(response: KlipyApiResponse): KlipyMedia[] {
  const items = response?.data?.data

  if (!items || !Array.isArray(items)) {
    console.warn('[useKlipy] No items in response:', response)
    return []
  }

  return items.map((item) => {
    // Get preview from sm size (small), full from md or hd
    const previewSize = item.file?.sm || item.file?.xs
    const fullSize = item.file?.md || item.file?.hd || item.file?.sm

    // Prefer gif for full URL, webp for preview (smaller)
    const previewFormat = previewSize?.webp || previewSize?.gif
    const fullFormat = fullSize?.gif || fullSize?.webp || fullSize?.mp4

    return {
      id: String(item.id),
      title: item.title || '',
      slug: item.slug || '',
      url: fullFormat?.url || '',
      preview_url: previewFormat?.url || fullFormat?.url || '',
      width: fullFormat?.width || 200,
      height: fullFormat?.height || 200,
    }
  }).filter(item => item.url) // Filter out items without URLs
}

export function useKlipy() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchGifs = useCallback(async (query: string, page = 1, perPage = 20): Promise<KlipyMedia[]> => {
    if (!KLIPY_API_KEY) {
      setError('KLIPY API key not configured')
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const url = `${KLIPY_BASE_URL}/${KLIPY_API_KEY}/gifs/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`KLIPY API error: ${response.status}`)
      }

      const json: KlipyApiResponse = await response.json()
      return parseKlipyResponse(json)
    } catch (err: any) {
      console.error('[useKlipy] Search GIFs error:', err)
      setError(err.message || 'Failed to search GIFs')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const getTrendingGifs = useCallback(async (page = 1, perPage = 20): Promise<KlipyMedia[]> => {
    if (!KLIPY_API_KEY) {
      setError('KLIPY API key not configured')
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const url = `${KLIPY_BASE_URL}/${KLIPY_API_KEY}/gifs/trending?page=${page}&per_page=${perPage}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`KLIPY API error: ${response.status}`)
      }

      const json: KlipyApiResponse = await response.json()
      return parseKlipyResponse(json)
    } catch (err: any) {
      console.error('[useKlipy] Trending GIFs error:', err)
      setError(err.message || 'Failed to fetch trending GIFs')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const searchStickers = useCallback(async (query: string, page = 1, perPage = 20): Promise<KlipyMedia[]> => {
    if (!KLIPY_API_KEY) {
      setError('KLIPY API key not configured')
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const url = `${KLIPY_BASE_URL}/${KLIPY_API_KEY}/stickers/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`KLIPY API error: ${response.status}`)
      }

      const json: KlipyApiResponse = await response.json()
      return parseKlipyResponse(json)
    } catch (err: any) {
      console.error('[useKlipy] Search stickers error:', err)
      setError(err.message || 'Failed to search stickers')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const getTrendingStickers = useCallback(async (page = 1, perPage = 20): Promise<KlipyMedia[]> => {
    if (!KLIPY_API_KEY) {
      setError('KLIPY API key not configured')
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const url = `${KLIPY_BASE_URL}/${KLIPY_API_KEY}/stickers/trending?page=${page}&per_page=${perPage}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`KLIPY API error: ${response.status}`)
      }

      const json: KlipyApiResponse = await response.json()
      return parseKlipyResponse(json)
    } catch (err: any) {
      console.error('[useKlipy] Trending stickers error:', err)
      setError(err.message || 'Failed to fetch trending stickers')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    searchGifs,
    getTrendingGifs,
    searchStickers,
    getTrendingStickers,
    loading,
    error,
  }
}
