import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStorage, writeStorage } from './storage';

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('writes, reads, and removes values', () => {
    writeStorage({ key: 'k', value: 'v' });
    expect(readStorage('k')).toBe('v');
    writeStorage({ key: 'k', value: null });
    expect(readStorage('k')).toBeNull();
  });

  it('swallows storage failures', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStorage('k')).toBeNull();
    expect(() => writeStorage({ key: 'k', value: 'v' })).not.toThrow();
  });
});
