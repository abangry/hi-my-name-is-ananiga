'use client'

import { useState, useEffect, memo } from 'react'
import { ExternalLink } from 'lucide-react'

interface LinkPreviewData {
  title: string | null
  description: string | null
  image: string | null
  siteName: string
  url: string
}

// Simple in-memory cache to avoid refetching
const previewCache = new Map<string, LinkPreviewData | null>()

export const LinkPreview = memo(function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(previewCache.get(url) ?? null)
  const [loading, setLoading] = useState(!previewCache.has(url))
  const [error, setError] = useState(false)

  useEffect(() => {
    if (previewCache.has(url)) {
      const cached = previewCache.get(url)
      if (cached) setData(cached)
      else setError(true)
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        if (!res.ok) {
          previewCache.set(url, null)
          if (!cancelled) setError(true)
          return
        }
        const preview = await res.json()
        previewCache.set(url, preview)
        if (!cancelled) setData(preview)
      } catch {
        previewCache.set(url, null)
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPreview()
    return () => { cancelled = true }
  }, [url])

  if (loading || error || !data) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 max-w-sm rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors group bg-white"
    >
      {data.image && (
        <div className="w-full h-36 overflow-hidden bg-gray-100">
          <img
            src={data.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium mb-0.5">
          <ExternalLink className="w-3 h-3" />
          {data.siteName}
        </div>
        {data.title && (
          <p className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {data.title}
          </p>
        )}
        {data.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
            {data.description}
          </p>
        )}
      </div>
    </a>
  )
})
