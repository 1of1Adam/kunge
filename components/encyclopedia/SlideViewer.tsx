'use client';

import * as React from 'react';
import type { TreeItem } from '@/lib/encyclopedia';

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const ASSET_BASE = '/encyclopedia';

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
};

const slideCache = new Map<string, string>();
const cssCache = new Map<string, string>();

function extractHtmlFromJs(js: string): string | null {
  const match = js.match(/loadHandler\s*\(\s*\d+\s*,\s*'([\s\S]*?)'\s*,\s*'\{/);
  if (!match) return null;
  return match[1]
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function rewriteAssetPaths(content: string | null, partDir: string): string | null {
  if (!content) return content;
  const dataPath = `${ASSET_BASE}/${partDir}/data/`;
  return content
    .replace(/((?:src|href)=['"])data\//g, `$1${dataPath}`)
    .replace(/(url\(\s*['"]?)data\//g, `$1${dataPath}`);
}

function extractPartFromId(id: string): string | null {
  const match = id.match(/^(part\d+)/);
  return match ? match[1] : null;
}

interface SlideViewerProps {
  item: TreeItem;
}

export function SlideViewer({ item }: SlideViewerProps) {
  const [slideHtml, setSlideHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const styleRef = React.useRef<HTMLStyleElement | null>(null);

  const updateScale = React.useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;
    // Use contain scaling to keep the entire slide visible.
    const nextScale = Math.min(
      clientWidth / BASE_WIDTH,
      clientHeight / BASE_HEIGHT,
    );
    setScale(nextScale);
  }, []);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    updateScale();
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(node);
    window.addEventListener('resize', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [updateScale, slideHtml]);

  React.useEffect(() => {
    if (!item.slideNum) {
      setLoading(false);
      setError('未找到可展示的幻灯片');
      return;
    }

    const partKey = extractPartFromId(item.id);
    const partDir = partKey ? PART_DIRS[partKey] : null;

    if (!partDir) {
      setLoading(false);
      setError('无法识别的目录');
      return;
    }

    const cacheKey = `${partDir}-${item.slideNum}`;
    let cancelled = false;

    const loadSlide = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!cssCache.has(cacheKey)) {
          const cssRes = await fetch(`${ASSET_BASE}/${partDir}/data/slide${item.slideNum}.css`);
          if (!cssRes.ok) throw new Error('CSS load failed');
          const cssText = await cssRes.text();
          cssCache.set(cacheKey, rewriteAssetPaths(cssText, partDir) || '');
        }

        if (!slideCache.has(cacheKey)) {
          const jsRes = await fetch(`${ASSET_BASE}/${partDir}/data/slide${item.slideNum}.js`);
          if (!jsRes.ok) throw new Error('JS load failed');
          const jsText = await jsRes.text();
          slideCache.set(
            cacheKey,
            rewriteAssetPaths(extractHtmlFromJs(jsText), partDir) || '',
          );
        }

        if (cancelled) return;

        if (styleRef.current) {
          styleRef.current.remove();
        }

        const style = document.createElement('style');
        style.id = `encyclopedia-slide-${cacheKey}`;
        style.textContent = cssCache.get(cacheKey) || '';
        document.head.appendChild(style);
        styleRef.current = style;

        setSlideHtml(slideCache.get(cacheKey) || null);
        setLoading(false);

        setTimeout(updateScale, 50);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load slide:', err);
        setError('加载幻灯片失败');
        setLoading(false);
      }
    };

    loadSlide();

    return () => {
      cancelled = true;
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, [item.id, item.slideNum, updateScale]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-fd-foreground/20 border-t-fd-foreground" />
          <p className="text-sm text-fd-muted-foreground">正在加载幻灯片...</p>
        </div>
      </div>
    );
  }

  if (error || !slideHtml) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center">
        <div className="text-center">
          <p className="text-base text-red-600">加载失败</p>
          <p className="text-sm text-fd-muted-foreground">{error || '无法解析幻灯片内容'}</p>
        </div>
      </div>
    );
  }

  const displayWidth = BASE_WIDTH * scale;
  const displayHeight = BASE_HEIGHT * scale;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-[360px] w-full items-start justify-center bg-fd-background"
    >
      <div
        className="overflow-hidden rounded-xl"
        style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      >
        <div
          className="playerView"
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
  );
}
