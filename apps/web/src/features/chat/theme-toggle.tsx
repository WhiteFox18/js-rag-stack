import { useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '../../components/icons';
import { applyThemePreference, readThemePreference } from '../../lib/theme';
import type { ThemePreference } from '../../lib/theme';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const satisfies readonly {
  value: ThemePreference;
  label: string;
  Icon: typeof SunIcon;
}[];

export function ThemeToggle() {
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference);

  const select = (next: ThemePreference) => {
    setPreference(next);
    applyThemePreference(next);
  };

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-border bg-bg p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={preference === value}
          title={label}
          onClick={() => select(value)}
          className={`grid size-7 place-items-center rounded-md ${
            preference === value
              ? 'bg-surface-2 text-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
