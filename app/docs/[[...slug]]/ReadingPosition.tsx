'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  buildStorageKey,
  parseStoredPosition,
  resolveScrollTarget,
} from '@/lib/reading-position';

const THROTTLE_MS = 150;
const RESTORE_OFFSET_PX = 16;

export default function ReadingPosition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestHeadingIdRef = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  const storageKey = useMemo(
    () => buildStorageKey(pathname ?? ''),
    [pathname],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const headings = Array.from(
      container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
    );

    if (typeof IntersectionObserver === 'undefined' || headings.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            latestHeadingIdRef.current = entry.target.id || null;
          }
        }
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0 },
    );

    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, [storageKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let restoreTimer: number | undefined;

    const restore = () => {
      const raw = (() => {
        try {
          return window.localStorage.getItem(storageKey);
        } catch {
          return null;
        }
      })();

      const position = parseStoredPosition(raw);
      if (!position) return;

      isRestoringRef.current = true;

      const tryHeading = () => {
        if (!position.headingId) return false;
        const safeId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(position.headingId)
            : position.headingId;
        const heading = container.querySelector<HTMLElement>(`#${safeId}`);
        if (!heading) return false;
        heading.scrollIntoView({ block: 'start' });
        window.scrollBy({
          top: RESTORE_OFFSET_PX,
          left: 0,
          behavior: 'instant' as ScrollBehavior,
        });
        return true;
      };

      if (!tryHeading()) {
        const maxScroll =
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight;
        const target = resolveScrollTarget(position, maxScroll);
        if (typeof target === 'number') {
          window.scrollTo({
            top: target,
            left: 0,
            behavior: 'instant' as ScrollBehavior,
          });
        }
      }

      restoreTimer = window.setTimeout(() => {
        isRestoringRef.current = false;
      }, 500);
    };

    const raf = window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 200);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (restoreTimer) window.clearTimeout(restoreTimer);
    };
  }, [storageKey]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const persist = () => {
      const maxScroll =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const y = window.scrollY;
      const percent = maxScroll > 0 ? y / maxScroll : 0;

      const payload = {
        percent,
        y,
        headingId: latestHeadingIdRef.current,
        updatedAt: Date.now(),
      };

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    const onScroll = () => {
      if (isRestoringRef.current) return;
      if (timeoutId) return;
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        persist();
      }, THROTTLE_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [storageKey]);

  return <div ref={containerRef}>{children}</div>;
}
