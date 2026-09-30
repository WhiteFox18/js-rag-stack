import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyThemePreference, readThemePreference } from './theme';

describe('theme preference', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system and ignores unknown stored values', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem('theme', 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  it('applies and persists explicit themes', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('returns to the system theme by clearing the override', () => {
    applyThemePreference('light');
    applyThemePreference('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('survives blocked storage', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
  });
});
