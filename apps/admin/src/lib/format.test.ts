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
    expect(toIsoStart('2026-09-01')).toBe('2026-09-01T00:00:00.000Z');
    expect(toIsoEndExclusive('2026-09-30')).toBe('2026-10-01T00:00:00.000Z');
  });
});
