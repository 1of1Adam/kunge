'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

type MobilePinFigureEnhancerProps = {
  slug: string;
  children: ReactNode;
};

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
const TARGET_SLUGS = new Set([
  'al-brooks-trends/12-Chapter_2__Trend_Bars_Doji_Bars_and_Climaxes',
  'al-brooks-trends/12-Chapter_2__Trend_Bars,_Doji_Bars,_and_Climaxes',
]);
const PIN_TOP_VAR = '--pin-figure-top';
const PIN_OFFSET_SELECTORS = ['#nd-subnav', '[data-toc-popover]'] as const;

const FIGURE_SCOPE_RE = /^图\s*2\.(1|2|3|4|5)\b/;
const FIGURE_2X_RE = /^图\s*2\.\d+\b/;

function normalizeTitle(text: string): string {
  return text.replace(/\u00a0/g, ' ').trim();
}

function isTargetSlug(slug: string): boolean {
  return TARGET_SLUGS.has(slug);
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function hasImageContent(element: Element): boolean {
  if (element.tagName === 'IMG') return true;
  if (element.matches('p') && element.querySelector(':scope > img')) return true;
  if (element.matches('figure') && element.querySelector('img')) return true;
  return false;
}

function findBoundaryHeading(
  headings: HTMLHeadingElement[],
  currentIndex: number,
): HTMLHeadingElement | null {
  for (let index = currentIndex + 1; index < headings.length; index += 1) {
    const title = normalizeTitle(headings[index].textContent || '');
    if (FIGURE_2X_RE.test(title)) {
      return headings[index];
    }
  }

  return null;
}

function findImageHost(
  start: Element | null,
  boundary: Element | null,
): HTMLElement | null {
  let cursor = start;
  while (cursor && cursor !== boundary) {
    if (hasImageContent(cursor)) {
      return cursor as HTMLElement;
    }
    cursor = cursor.nextElementSibling;
  }

  return null;
}

function moveContentUntilBoundary(
  firstNode: Element | null,
  boundary: Element | null,
  content: HTMLElement,
): void {
  let next = firstNode;
  while (next && next !== boundary) {
    const current = next as HTMLElement;
    next = next.nextElementSibling;
    content.appendChild(current);
  }
}

function enhancePinBlocks(root: HTMLElement): void {
  if (root.dataset.pinFigureEnhanced === 'true') return;

  const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>('h3'));
  if (headings.length === 0) return;

  let patched = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (heading.dataset.pinFigureProcessed === 'true') continue;

    const title = normalizeTitle(heading.textContent || '');
    if (!FIGURE_SCOPE_RE.test(title)) continue;

    const boundary = findBoundaryHeading(headings, i);
    const imageHost = findImageHost(heading.nextElementSibling, boundary);

    if (!imageHost) continue;

    const block = document.createElement('div');
    block.className = 'pin-figure-block';

    const media = document.createElement('div');
    media.className = 'pin-figure-media';

    const content = document.createElement('div');
    content.className = 'pin-figure-content';

    const nextFromOriginalFlow = imageHost.nextElementSibling;

    heading.insertAdjacentElement('afterend', block);
    block.appendChild(media);
    block.appendChild(content);
    media.appendChild(imageHost);

    moveContentUntilBoundary(nextFromOriginalFlow, boundary, content);

    heading.dataset.pinFigureProcessed = 'true';
    patched += 1;
  }

  if (patched > 0) {
    root.classList.add('pin-figure-enhanced');
    root.dataset.pinFigureEnhanced = 'true';
  }
}

function updatePinOffset(root: HTMLElement): void {
  let maxBottom = 0;
  for (const selector of PIN_OFFSET_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.bottom > maxBottom) {
      maxBottom = rect.bottom;
    }
  }

  if (maxBottom > 0) {
    root.style.setProperty(PIN_TOP_VAR, `${Math.ceil(maxBottom)}px`);
  }
}

export default function MobilePinFigureEnhancer({
  slug,
  children,
}: MobilePinFigureEnhancerProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTargetSlug(slug)) return;
    const root = containerRef.current;
    if (!root) return;
    const container: HTMLElement = root;

    function applyEnhance(): void {
      if (!isMobileViewport()) return;
      updatePinOffset(container);
      enhancePinBlocks(container);
    }

    applyEnhance();

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    function onChange(event: MediaQueryListEvent): void {
      if (event.matches) {
        applyEnhance();
      }
    }

    function onResize(): void {
      if (!isMobileViewport()) return;
      updatePinOffset(container);
    }

    window.addEventListener('resize', onResize);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => {
        mediaQuery.removeEventListener('change', onChange);
        window.removeEventListener('resize', onResize);
      };
    }

    mediaQuery.addListener(onChange);
    return () => {
      mediaQuery.removeListener(onChange);
      window.removeEventListener('resize', onResize);
    };
  }, [slug]);

  return <div ref={containerRef}>{children}</div>;
}
