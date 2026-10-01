import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatNumber,
  shortId,
  toIsoEndExclusive,
  toIsoStart,
} from './format';

describe('format helpers', () => {
  it('formats numbers and ids', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(shortId('0199a000-0000-7000')).toBe('0199a000');
  });

  it('formats null dates as a dash', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('2026-09-30T10:00:00.000Z')).toMatch(/2026/);
  });

  it('converts date inputs to an inclusive start and exclusive end', () => {
    expect(toIsoStart('')).toBeUndefined();
    expect(toIsoStart('2026-09-01')).toBe(new Date(2026, 8, 1).toISOString());
    expect(toIsoEndExclusive('2026-09-30')).toBe(
      new Date(2026, 9, 1).toISOString(),
    );
    expect(toIsoEndExclusive('2026-12-31')).toBe(
      new Date(2027, 0, 1).toISOString(),
    );
  });
});
