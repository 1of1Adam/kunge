import * as React from 'react'
import type { TreeItem } from '@/types/encyclopedia'

// Part directory mapping
const PART_DIRS: Record<string, string> = {
  part01: 'part01',
  part02: 'part02',
  part03: 'part03',
  part04: 'part04',
  part05: 'part05',
  part06: 'part06',
  part07: 'part07',
  part08: 'part08',
  part09: 'part09',
  part10: 'part10',
  part11: 'part11',
  part12: 'part12',
  part13: 'part13',
  part14: 'part14',
  part15: 'part15',
  part16: 'part16',
}

const BASE_WIDTH = 960
const BASE_HEIGHT = 540

interface SlideViewerProps {
  item: TreeItem
}

// Extract HTML from JS content
function extractHtmlFromJs(js: string): string | null {
  const m = js.match(/loadHandler\s*\(\s*\d+\s*,\s*'([\s\S]*?)'\s*,\s*'\{/)
  return m ? m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null
}

// Rewrite asset paths for correct loading
function rewriteAssetPaths(content: string | null, partDir: string): string | null {
  if (!content) return content
  const dataPath = `/${partDir}/data/`
  return content
    .replace(/((?:src|href)=['"])data\//g, `$1${dataPath}`)
    .replace(/(url\(\s*['"]?)data\//g, `$1${dataPath}`)
}

// Extract part key from item id (e.g., "part02-section-0-slide-1" -> "part02")
function extractPartFromId(id: string): string | null {
  const match = id.match(/^(part\d+)/)
  return match ? match[1] : null
}

// Global slide cache
const slideCache = new Map<string, string>()
const cssCache = new Map<string, string>()

export function SlideViewer({ item }: SlideViewerProps) {
  const [slideHtml, setSlideHtml] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [scale, setScale] = React.useState(1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const styleRef = React.useRef<HTMLStyleElement | null>(null)

  // Calculate scale based on container size
  const updateScale = React.useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      const newScale = Math.min(
        containerWidth / BASE_WIDTH,
        containerHeight / BASE_HEIGHT,
        1.5 // max scale
      )
      setScale(newScale)
    }
  }, [])

  // Update scale on resize
  React.useEffect(() => {
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [updateScale])

  // Load slide content
  React.useEffect(() => {
    if (!item.slideNum) {
      setLoading(false)
      setError('No slide number')
      return
    }

    // Extract part from item id (e.g., "part02-section-0-slide-1" -> "part02")
    const partKey = extractPartFromId(item.id)
    const partDir = partKey ? PART_DIRS[partKey] : null

    if (!partDir) {
      setLoading(false)
      setError('Invalid part')
      return
    }

    // slideNum in JSON is already the local index within the part
    const localIndex = item.slideNum
    const cacheKey = `${partDir}-${localIndex}`

    setLoading(true)
    setError(null)

    const loadSlideContent = async () => {
      try {
        // Load CSS if not cached
        if (!cssCache.has(cacheKey)) {
          const cssRes = await fetch(`/${partDir}/data/slide${localIndex}.css`)
          if (!cssRes.ok) throw new Error('CSS load failed')
          const cssText = await cssRes.text()
          cssCache.set(cacheKey, rewriteAssetPaths(cssText, partDir) || '')
        }

        // Load JS/HTML if not cached
        if (!slideCache.has(cacheKey)) {
          const jsRes = await fetch(`/${partDir}/data/slide${localIndex}.js`)
          if (!jsRes.ok) throw new Error('JS load failed')
          const jsText = await jsRes.text()
          slideCache.set(cacheKey, rewriteAssetPaths(extractHtmlFromJs(jsText), partDir) || '')
        }

        // Apply CSS
        if (styleRef.current) {
          styleRef.current.remove()
        }
        const style = document.createElement('style')
        style.id = `slide-style-${cacheKey}`
        style.textContent = cssCache.get(cacheKey) || ''
        document.head.appendChild(style)
        styleRef.current = style

        setSlideHtml(slideCache.get(cacheKey) || null)
        setLoading(false)

        // Update scale after content loads
        setTimeout(updateScale, 50)
      } catch (err) {
        console.error('Failed to load slide:', err)
        setError('Failed to load slide content')
        setLoading(false)
      }
    }

    loadSlideContent()

    // Cleanup style on unmount or slide change
    return () => {
      if (styleRef.current) {
        styleRef.current.remove()
        styleRef.current = null
      }
    }
  }, [item.id, item.slideNum, updateScale])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading slide...</p>
        </div>
      </div>
    )
  }

  if (error || !slideHtml) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <p className="text-lg text-destructive">Load Failed</p>
          <p className="text-muted-foreground">{error || 'Unable to load slide content'}</p>
        </div>
      </div>
    )
  }

  // Calculate the actual displayed dimensions after scaling
  const displayWidth = BASE_WIDTH * scale
  const displayHeight = BASE_HEIGHT * scale

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] flex items-center justify-center overflow-hidden"
    >
      {/* Frame wrapper - sized to exactly match scaled content */}
      <div
        className="relative rounded-xl border-2 border-border shadow-lg overflow-hidden bg-card"
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
        }}
      >
        {/* Slide content container */}
        <div
          className="playerView absolute top-0 left-0"
          style={{
            width: `${BASE_WIDTH}px`,
            height: `${BASE_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          dangerouslySetInnerHTML={{ __html: slideHtml }}
        />
      </div>
    </div>
  )
}
