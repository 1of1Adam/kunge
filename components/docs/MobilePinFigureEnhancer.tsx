'use client';

import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

type MobilePinFigureEnhancerProps = {
  slug: string;
  children: ReactNode;
};

type ChapterPinRule = {
  headingSelector: string;
  startHeadingRe: RegExp;
  boundaryHeadingRe: RegExp | null;
  endTextRe?: RegExp;
  slugs: Set<string>;
};

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';
const PIN_TOP_VAR = '--pin-figure-top';
const PIN_OFFSET_SELECTORS = ['#nd-subnav', '[data-toc-popover]'] as const;
const FIGURE_HEADING_SELECTOR = 'h2, h3';

const CHAPTER_PIN_RULES: ChapterPinRule[] = [
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*1\.1\s*[：:]/,
    boundaryHeadingRe: /^图\s*1\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/11-Chapter_1__The_Spectrum_of_Price_Action__Extreme_Trends_to_Extreme_Trading_Ranges',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*2\.(1|2|3|4|5)\s*[：:]/,
    boundaryHeadingRe: /^图\s*2\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/12-Chapter_2__Trend_Bars_Doji_Bars_and_Climaxes',
      'al-brooks-trends/12-Chapter_2__Trend_Bars,_Doji_Bars,_and_Climaxes',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*3\.1\s*[：:]/,
    boundaryHeadingRe: /^图\s*3\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/13-Chapter_3__Breakouts_Trading_Ranges_Tests_and_Reversals',
      'al-brooks-trends/13-Chapter_3__Breakouts,_Trading_Ranges,_Tests,_and_Reversals',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*4\.1\s*[：:]/,
    boundaryHeadingRe: /^图\s*4\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/14-Chapter_4__Bar_Basics__Signal_Bars_Entry_Bars_Setups_and_Candle_Patterns',
      'al-brooks-trends/14-Chapter_4__Bar_Basics,_Signal_Bars,_Entry_Bars,_Setups,_and_Candle_Patterns',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*5\.\d+\s*[：:]/,
    boundaryHeadingRe: /^图\s*5\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/15-Chapter_5__Signal_Bars__Reversal_Bars',
      'al-brooks-trends/15-Chapter_5__Signal_Bars,_Reversal_Bars',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*6\.(1[6-9]|[2-9]\d+)\s*[：:]/,
    boundaryHeadingRe: /^图\s*6\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/16-Chapter_6__Signal_Bars__Other_Types',
      'al-brooks-trends/16-Chapter_6__Signal_Bars,_Other_Types',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*7\.\d+\s*[：:]/,
    boundaryHeadingRe: /^图\s*7\.\d+\s*[：:]/,
    slugs: new Set(['al-brooks-trends/17-Chapter_7__Outside_Bars']),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^图\s*8\.1\s*[：:]/,
    boundaryHeadingRe: /^图\s*8\.\d+\s*[：:]/,
    slugs: new Set([
      'al-brooks-trends/18-Chapter_8__The_Importance_of_the_Close_of_the_Bar',
    ]),
  },
  {
    headingSelector: FIGURE_HEADING_SELECTOR,
    startHeadingRe: /^两段式回调$/,
    boundaryHeadingRe: null,
    endTextRe: /K线\s*15\s*是低\s*2\s*做空入场K线/,
    slugs: new Set(['al-brooks-trends/10-Part_I__Price_Action']),
  },
];

function normalizeTitle(text: string): string {
  return text.replace(/\u00a0/g, ' ').trim();
}

function getChapterPinRule(slug: string): ChapterPinRule | null {
  for (const rule of CHAPTER_PIN_RULES) {
    if (rule.slugs.has(slug)) {
      return rule;
    }
  }

  return null;
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
  boundaryHeadingRe: RegExp | null,
): HTMLHeadingElement | null {
  if (!boundaryHeadingRe) {
    return null;
  }

  for (let index = currentIndex + 1; index < headings.length; index += 1) {
    const title = normalizeTitle(headings[index].textContent || '');
    if (boundaryHeadingRe.test(title)) {
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
  endTextRe?: RegExp,
): void {
  let next = firstNode;
  while (next && next !== boundary) {
    const current = next as HTMLElement;
    next = next.nextElementSibling;
    content.appendChild(current);

    if (!endTextRe) {
      continue;
    }

    const text = normalizeTitle(current.textContent || '');
    if (endTextRe.test(text)) {
      break;
    }
  }
}

function enhancePinBlocks(root: HTMLElement, rule: ChapterPinRule): void {
  const headings = Array.from(
    root.querySelectorAll<HTMLHeadingElement>(rule.headingSelector),
  );
  if (headings.length === 0) return;

  let patched = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (heading.dataset.pinFigureProcessed === 'true') continue;

    const title = normalizeTitle(heading.textContent || '');
    if (!rule.startHeadingRe.test(title)) continue;

    const boundary = findBoundaryHeading(headings, i, rule.boundaryHeadingRe);
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

    moveContentUntilBoundary(nextFromOriginalFlow, boundary, content, rule.endTextRe);

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
    const rule = getChapterPinRule(slug);
    if (!rule) return;
    const activeRule: ChapterPinRule = rule;

    const root = containerRef.current;
    if (!root) return;
    const container: HTMLElement = root;

    function applyEnhance(): void {
      if (!isMobileViewport()) return;
      updatePinOffset(container);
      enhancePinBlocks(container, activeRule);
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
