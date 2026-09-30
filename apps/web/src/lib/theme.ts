import { readStorage, writeStorage } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export function readThemePreference(): ThemePreference {
  const stored = readStorage(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/**
 * "system" removes the override so CSS `light-dark()` follows the OS; the
 * inline script in index.html applies the stored value before first paint.
 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = preference;
  writeStorage({
    key: THEME_STORAGE_KEY,
    value: preference === 'system' ? null : preference,
  });
}
