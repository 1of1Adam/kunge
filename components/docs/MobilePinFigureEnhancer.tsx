'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

type MobilePinFigureEnhancerProps = {
  slug: string;
  children: ReactNode;
};

const TARGET_SLUGS = new Set([
  'al-brooks-trends/12-Chapter_2__Trend_Bars_Doji_Bars_and_Climaxes',
  'al-brooks-trends/12-Chapter_2__Trend_Bars,_Doji_Bars,_and_Climaxes',
]);

const FIGURE_SCOPE_RE = /^图\s*2\.(1|2|3|4|5)\b/;
const FIGURE_2X_RE = /^图\s*2\.\d+\b/;

function normalizeTitle(text: string) {
  return text.replace(/\u00a0/g, ' ').trim();
}

function isTargetSlug(slug: string) {
  return TARGET_SLUGS.has(slug);
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

function hasImageContent(element: Element) {
  if (element.tagName === 'IMG') return true;
  if (element.matches('p') && element.querySelector(':scope > img')) return true;
  if (element.matches('figure') && element.querySelector('img')) return true;
  return false;
}

function enhancePinBlocks(root: HTMLElement) {
  if (root.dataset.pinFigureEnhanced === 'true') return;

  const headings = Array.from(root.querySelectorAll('h3'));
  if (headings.length === 0) return;

  let patched = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (heading.dataset.pinFigureProcessed === 'true') continue;

    const title = normalizeTitle(heading.textContent || '');
    if (!FIGURE_SCOPE_RE.test(title)) continue;

    let boundary: HTMLElement | null = null;
    for (let j = i + 1; j < headings.length; j += 1) {
      const nextTitle = normalizeTitle(headings[j].textContent || '');
      if (FIGURE_2X_RE.test(nextTitle)) {
        boundary = headings[j];
        break;
      }
    }

    let cursor: Element | null = heading.nextElementSibling;
    let imageHost: HTMLElement | null = null;
    while (cursor && cursor !== boundary) {
      if (hasImageContent(cursor)) {
        imageHost = cursor as HTMLElement;
        break;
      }
      cursor = cursor.nextElementSibling;
    }

    if (!imageHost) continue;

    const block = document.createElement('div');
    block.className = 'pin-figure-block';

    const media = document.createElement('div');
    media.className = 'pin-figure-media';

    const content = document.createElement('div');
    content.className = 'pin-figure-content';

    heading.insertAdjacentElement('afterend', block);
    block.appendChild(media);
    block.appendChild(content);
    media.appendChild(imageHost);

    let next = imageHost.nextElementSibling;
    while (next && next !== boundary) {
      const current = next as HTMLElement;
      next = next.nextElementSibling;
      content.appendChild(current);
    }

    heading.dataset.pinFigureProcessed = 'true';
    patched += 1;
  }

  if (patched > 0) {
    root.classList.add('pin-figure-enhanced');
    root.dataset.pinFigureEnhanced = 'true';
  }
}

export default function MobilePinFigureEnhancer({
  slug,
  children,
}: MobilePinFigureEnhancerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTargetSlug(slug)) return;
    if (!containerRef.current) return;

    const applyEnhance = () => {
      if (!containerRef.current) return;
      if (!isMobileViewport()) return;
      enhancePinBlocks(containerRef.current);
    };

    applyEnhance();

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) applyEnhance();
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, [slug]);

  return <div ref={containerRef}>{children}</div>;
}
