import { describe, it, expect } from 'vitest';
import {
  buildStorageKey,
  clampPercent,
  parseStoredPosition,
  resolveScrollTarget,
} from './reading-position';

describe('reading-position helpers', () => {
  it('builds storage key from pathname', () => {
    expect(buildStorageKey('/docs/test')).toBe('kunge:reading-position:/docs/test');
  });

  it('clamps percent into range', () => {
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(0.5)).toBe(0.5);
    expect(clampPercent(3)).toBe(1);
  });

  it('parses stored position safely', () => {
    const raw = JSON.stringify({ percent: 0.25, y: 120, headingId: 'h2', updatedAt: 1 });
    expect(parseStoredPosition(raw)).toEqual({
      percent: 0.25,
      y: 120,
      headingId: 'h2',
      updatedAt: 1,
    });
    expect(parseStoredPosition('not json')).toBeNull();
    expect(parseStoredPosition(null)).toBeNull();
  });

  it('resolves scroll target with percent then y', () => {
    expect(resolveScrollTarget({ percent: 0.5 }, 1000)).toBe(500);
    expect(resolveScrollTarget({ y: 200 }, 1000)).toBe(200);
    expect(resolveScrollTarget({}, 1000)).toBeNull();
  });
});
