export type StoredReadingPosition = {
  percent?: number;
  y?: number;
  headingId?: string | null;
  updatedAt?: number;
};

const STORAGE_PREFIX = 'kunge:reading-position:';

export function buildStorageKey(pathname: string): string {
  return `${STORAGE_PREFIX}${pathname}`;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function parseStoredPosition(
  raw: string | null,
): StoredReadingPosition | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;

    const result: StoredReadingPosition = {};
    if (typeof data.percent === 'number') result.percent = clampPercent(data.percent);
    if (typeof data.y === 'number') result.y = Math.max(0, data.y);
    if (typeof data.headingId === 'string') result.headingId = data.headingId;
    if (typeof data.updatedAt === 'number') result.updatedAt = data.updatedAt;
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export function resolveScrollTarget(
  position: StoredReadingPosition,
  maxScroll: number,
): number | null {
  if (typeof position.percent === 'number') {
    return clampPercent(position.percent) * Math.max(0, maxScroll);
  }
  if (typeof position.y === 'number') {
    return Math.min(Math.max(0, position.y), Math.max(0, maxScroll));
  }
  return null;
}
