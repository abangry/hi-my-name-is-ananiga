import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'Not an HTML page' }, { status: 400 })
    }

    // Only read first 50KB to avoid huge pages
    const reader = res.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: 'No body' }, { status: 502 })
    }

    let html = ''
    const decoder = new TextDecoder()
    let bytesRead = 0
    const maxBytes = 50000

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      bytesRead += value.length
    }
    reader.cancel()

    // Parse Open Graph and meta tags
    const getMetaContent = (nameOrProperty: string): string | null => {
      // Try og: property first
      const ogMatch = html.match(
        new RegExp(`<meta[^>]*property=["']${nameOrProperty}["'][^>]*content=["']([^"']*)["']`, 'i')
      ) || html.match(
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${nameOrProperty}["']`, 'i')
      )
      if (ogMatch) return ogMatch[1]

      // Try name attribute
      const nameMatch = html.match(
        new RegExp(`<meta[^>]*name=["']${nameOrProperty}["'][^>]*content=["']([^"']*)["']`, 'i')
      ) || html.match(
        new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${nameOrProperty}["']`, 'i')
      )
      if (nameMatch) return nameMatch[1]

      return null
    }

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)

    const title = getMetaContent('og:title') || getMetaContent('twitter:title') || (titleMatch ? titleMatch[1].trim() : null)
    const description = getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description')
    const image = getMetaContent('og:image') || getMetaContent('twitter:image')
    const siteName = getMetaContent('og:site_name')

    // Resolve relative image URLs
    let resolvedImage = image
    if (image && !image.startsWith('http')) {
      try {
        resolvedImage = new URL(image, url).href
      } catch {
        resolvedImage = null
      }
    }

    if (!title && !description && !resolvedImage) {
      return NextResponse.json({ error: 'No metadata found' }, { status: 404 })
    }

    return NextResponse.json({
      title: title || null,
      description: description ? description.slice(0, 300) : null,
      image: resolvedImage || null,
      siteName: siteName || parsedUrl.hostname,
      url,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      }
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 502 })
  }
}
