# Web UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `apps/web` chat SPA: markdown replies with highlighted code, a prompt navigator for long chats, smarter scrolling, a friendlier composer and sidebar, and light/dark theming.

**Architecture:** Semantic color tokens (CSS `light-dark()` variables exposed to Tailwind v4 via `@theme inline`) underpin every component. A single `useScrollTracking` hook, called in `ChatPage`, owns the transcript scroll container (stick-to-bottom, prepend anchoring, active-prompt tracking via `IntersectionObserver`, overflow via `ResizeObserver`) and is shared by `MessageList` and the new presentational `PromptNavigator`. Small shared primitives (`icons`, `CopyButton`, `Menu`, `ConfirmDialog`) live in `src/components/`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4.3, TanStack Query 5, React Router 7, Vitest 4 + Testing Library + jsdom 29; new: `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `shiki` 4.4.3.

**Spec:** `docs/superpowers/specs/2026-09-30-web-ui-ux-redesign-design.md`

## Global Constraints

- Work on branch `redesign`. Commit after every task. **Never `git push`** — the user must explicitly allow it.
- Scope is `apps/web` only. No API, contract, or OpenAPI changes.
- No UI component library. The only new dependencies are `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `shiki@4.4.3`, installed with `--save-exact`.
- Colors come only from semantic tokens: `bg`, `surface`, `surface-2`, `border`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-hover`, `accent-fg`, `accent-soft`, `danger`, `danger-soft`, `warning`, `warning-soft`, `success`, `success-soft` (e.g. `bg-surface`, `text-fg-muted`, `border-border`). No `slate-*`, `cyan-*`, `rose-*`, `amber-*`, `emerald-*` classes remain when the plan is done. `black/…` overlay backdrops are allowed.
- Browser floor implied by CSS `light-dark()`: Chrome 123, Safari 17.5, Firefox 120.
- Prompt navigator is visible only when viewport ≥ `xl` (1280px) **and** transcript content overflows **and** there are ≥ 3 user prompts.
- Scroll constants: stick-to-bottom threshold 80px; navigator selection lock 600ms; active prompt = last prompt whose top crossed the upper 30% of the scroll container; scroll padding 16px.
- Composer limit 12,000 characters; counter shown above 90% (10,800).
- Preserve these accessible names used by existing tests: textarea label `Message`, buttons `Send` / `Stop` / `Load earlier messages`, select label `Model`, log `Conversation`, aside `Sidebar`, nav `Chat history`, button `Toggle chat history`.
- Every `localStorage` access is wrapped in try/catch and falls back to defaults.
- Honor `prefers-reduced-motion` for all smooth scrolling and animation.
- Follow repo conventions: kebab-case filenames; component prop interfaces live in the feature's `*.types.ts` (shared components: `src/components/components.types.ts`); helpers with 2+ inputs take a single object parameter; Prettier config is single quotes, semicolons, trailing commas.
- Before each commit run, from the repo root: `pnpm exec prettier --write apps/web docs && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`. All must pass.
- ESLint runs `eslint-plugin-react-hooks` 7 (React Compiler rules): no reading/writing `ref.current` during render, no synchronous `setState` in an effect body (async callbacks are fine), no components defined inside components.

## Review Focus

1. **Long unbroken prompt text** (a 500-character URL or single line) — navigator entries truncate with an ellipsis and expose the full text as a tooltip; user bubbles wrap instead of widening the page. Pinned by Task 5 (navigator `title` + `truncate`) and Task 4 (bubble `break-words`).
2. **Switching chats while scrolled up or right after selecting a prompt** — the new chat opens pinned to the bottom with no stale highlight from the previous chat. Pinned by Task 3 (`resetKey` test).
3. **A stream finishing** (optimistic pending rows replaced by server rows) — the navigator never lists the same prompt twice. Pinned by Task 4 (`collectPrompts` test).
4. **Wide markdown content** (wide tables, long code lines) — scrolls inside its own block, not the page. Pinned by Task 2 (table wrapper + code overflow tests).
5. **Clipboard unavailable** (plain-HTTP LAN access, denied permission) — copy buttons show "Copy failed" and never throw. Pinned by Task 2 (`CopyButton` failure test).

---

## File Map

| File                                                                                                                                       | Status  | Responsibility                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------- |
| `apps/web/src/styles.css`                                                                                                                  | modify  | Tokens, custom variant, markdown/shiki/animation CSS             |
| `apps/web/index.html`                                                                                                                      | modify  | Inter font, theme pre-paint script                               |
| `apps/web/src/components/components.types.ts`                                                                                              | create  | Prop types for shared components                                 |
| `apps/web/src/components/icons.tsx`                                                                                                        | create  | Inline SVG icon set                                              |
| `apps/web/src/components/copy-button.tsx`                                                                                                  | create  | Clipboard button with copied/failed feedback                     |
| `apps/web/src/components/menu.tsx`                                                                                                         | create  | Accessible popover action menu                                   |
| `apps/web/src/components/confirm-dialog.tsx`                                                                                               | create  | Native `<dialog>` confirmation                                   |
| `apps/web/src/lib/storage.ts`                                                                                                              | create  | Safe `localStorage` read/write                                   |
| `apps/web/src/lib/theme.ts`                                                                                                                | create  | Theme preference read/apply                                      |
| `apps/web/src/features/chat/highlight.ts`                                                                                                  | create  | Lazy `shiki` highlighting                                        |
| `apps/web/src/features/chat/code-block.tsx`                                                                                                | create  | Fenced code block UI                                             |
| `apps/web/src/features/chat/markdown.tsx`                                                                                                  | create  | Markdown renderer                                                |
| `apps/web/src/features/chat/use-scroll-tracking.ts`                                                                                        | create  | Scroll/observer hook                                             |
| `apps/web/src/features/chat/prompt-navigator.tsx`                                                                                          | create  | Prompt list UI                                                   |
| `apps/web/src/features/chat/theme-toggle.tsx`                                                                                              | create  | System/Light/Dark control                                        |
| `apps/web/src/features/chat/chat.types.ts`                                                                                                 | modify  | New prop/hook types                                              |
| `apps/web/src/features/chat/chat.helpers.ts`                                                                                               | modify  | `collectPrompts`, `visibleServerMessages`, `shouldShowNavigator` |
| `apps/web/src/features/chat/message-list.tsx`                                                                                              | rewrite | Transcript UI                                                    |
| `apps/web/src/features/chat/chat-page.tsx`                                                                                                 | rewrite | Layout, navigator column, empty state                            |
| `apps/web/src/features/chat/composer.tsx`                                                                                                  | rewrite | Auto-grow composer                                               |
| `apps/web/src/features/chat/chat-sidebar.tsx`                                                                                              | rewrite | Menu/confirm, tokens, theme toggle                               |
| `apps/web/src/features/chat/chat-shell.tsx`                                                                                                | rewrite | Collapsible sidebar                                              |
| `apps/web/src/features/chat/model-selector.tsx`, `readiness-banner.tsx`, `features/auth/auth-dialog.tsx`, `features/auth/account-page.tsx` | modify  | Token restyle                                                    |
| `apps/web/src/test/dom.ts`                                                                                                                 | create  | Observer/scroll/dialog mocks + helpers                           |
| `apps/web/src/test/setup.ts`                                                                                                               | modify  | Install DOM mocks                                                |

---

## Phase 0 — Foundation

### Task 1: Design tokens, typography, and icons

**Files:**

- Modify: `apps/web/src/styles.css` (full replacement)
- Modify: `apps/web/index.html`
- Create: `apps/web/src/components/components.types.ts`
- Create: `apps/web/src/components/icons.tsx`
- Test: `apps/web/src/components/icons.test.tsx`

**Interfaces:**

- Produces: Tailwind color utilities for every token in Global Constraints (`bg-bg`, `bg-surface`, `bg-surface-2`, `border-border`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-accent`, `hover:bg-accent-hover`, `text-accent-fg`, `bg-accent-soft`, `text-danger`, `bg-danger-soft`, `text-warning`, `bg-warning-soft`, `text-success`, `bg-success-soft`); custom variant `can-hover:` (applies only on devices with hover). Icon components `MenuIcon`, `PanelLeftIcon`, `PlusIcon`, `PencilIcon`, `TrashIcon`, `MoreIcon`, `CopyIcon`, `CheckIcon`, `SendIcon`, `StopIcon`, `ArrowDownIcon`, `SunIcon`, `MoonIcon`, `MonitorIcon`, each `(props: IconProps) => JSX.Element`, `IconProps = SVGProps<SVGSVGElement>`, decorative (`aria-hidden="true"`), sized `1em`, colored `currentColor`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/icons.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SendIcon, StopIcon } from './icons';

describe('icons', () => {
  it('renders decorative icons that inherit the text color', () => {
    const { container } = render(<SendIcon className="size-4" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveClass('size-4');
  });

  it('lets callers override defaults', () => {
    const { container } = render(<StopIcon strokeWidth={3} />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '3');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components/icons.test.tsx`
Expected: FAIL — `Failed to resolve import "./icons"`.

- [ ] **Step 3: Implement icons and types**

`apps/web/src/components/components.types.ts`:

```ts
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;
```

`apps/web/src/components/icons.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { IconProps } from './components.types';

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Icon>
  );
}
```

- [ ] **Step 4: Replace `apps/web/src/styles.css` with the token foundation**

```css
@import 'tailwindcss';

@custom-variant can-hover (@media (hover: hover));

:root {
  color-scheme: light dark;
  --bg: light-dark(#ffffff, #0e0e11);
  --surface: light-dark(#f6f6f7, #17171b);
  --surface-2: light-dark(#ececef, #222228);
  --border: light-dark(#e2e2e6, #2a2a31);
  --fg: light-dark(#18181b, #ececf1);
  --fg-muted: light-dark(#52525b, #a1a1aa);
  --fg-subtle: light-dark(#6b6b74, #8b8b95);
  --accent: light-dark(#4f46e5, #818cf8);
  --accent-hover: light-dark(#4338ca, #a5b4fc);
  --accent-fg: light-dark(#ffffff, #111127);
  --accent-soft: light-dark(#eef0ff, #23233f);
  --danger: light-dark(#b91c1c, #f87171);
  --danger-soft: light-dark(#fef2f2, #3a1a1d);
  --warning: light-dark(#a16207, #facc15);
  --warning-soft: light-dark(#fefce8, #3a3113);
  --success: light-dark(#15803d, #4ade80);
  --success-soft: light-dark(#f0fdf4, #13301f);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

:root[data-theme='light'] {
  color-scheme: light;
}

:root[data-theme='dark'] {
  color-scheme: dark;
}

@theme {
  --font-sans:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', sans-serif;
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-fg: var(--fg);
  --color-fg-muted: var(--fg-muted);
  --color-fg-subtle: var(--fg-subtle);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-fg: var(--accent-fg);
  --color-accent-soft: var(--accent-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 5: Update `apps/web/index.html`**

Until the theme toggle lands (Task 10), pin the app to dark so partially migrated screens stay coherent. Replace the file with:

```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta
      name="description"
      content="Local-first chat application powered by Ollama"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    />
    <title>Local LLM Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Run the test and full web checks**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components/icons.test.tsx`
Expected: PASS (2 tests).

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test && pnpm --filter @js-rag-stack/web build`
Expected: all succeed (build proves the `@theme inline` / `@custom-variant` CSS compiles).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/styles.css apps/web/index.html apps/web/src/components
git commit -m "feat(web): add design tokens, Inter typography, and icon set

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 1 — Readability

### Task 2: Markdown rendering with highlighted, copyable code blocks

**Files:**

- Modify: `apps/web/package.json` (via pnpm)
- Create: `apps/web/src/components/copy-button.tsx`
- Modify: `apps/web/src/components/components.types.ts`
- Create: `apps/web/src/features/chat/highlight.ts`
- Create: `apps/web/src/features/chat/code-block.tsx`
- Create: `apps/web/src/features/chat/markdown.tsx`
- Modify: `apps/web/src/features/chat/chat.types.ts`
- Modify: `apps/web/src/styles.css` (append)
- Test: `apps/web/src/components/copy-button.test.tsx`, `apps/web/src/features/chat/highlight.test.ts`, `apps/web/src/features/chat/markdown.test.tsx`

**Interfaces:**

- Consumes: `CopyIcon`, `CheckIcon` (Task 1).
- Produces:
  - `CopyButton({ text: string; label?: string /* default 'Copy' */; showLabel?: boolean; className?: string })` — accessible name is `label`, then `'Copied'` or `'Copy failed'` for 1.5s.
  - `highlightCode({ code: string; lang: string }): Promise<string | null>` — shiki HTML with dual themes, `null` on any failure.
  - `MarkdownContent({ content: string; streaming?: boolean })` — root element has class `markdown` (plus `markdown-streaming` while streaming).

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @js-rag-stack/web add --save-exact react-markdown@10.1.0 remark-gfm@4.0.1 shiki@4.4.3`
Expected: `apps/web/package.json` dependencies gain the three exact versions; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/components/copy-button.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  afterEach(() => vi.useRealTimers());

  it('copies the text, confirms, then resets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton text="hello" label="Copy message" />);

    await user.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(await navigator.clipboard.readText()).toBe('hello');
    expect(
      await screen.findByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(
      screen.getByRole('button', { name: 'Copy message' }),
    ).toBeInTheDocument();
  });

  it('reports failure instead of throwing when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('denied'),
    );
    render(<CopyButton text="hello" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(
      await screen.findByRole('button', { name: 'Copy failed' }),
    ).toBeInTheDocument();
  });
});
```

`apps/web/src/features/chat/highlight.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight';

describe('highlightCode', () => {
  it('produces dual-theme shiki markup', async () => {
    const html = await highlightCode({ code: 'const a = 1;', lang: 'ts' });
    expect(html).toContain('class="shiki');
    expect(html).toContain('--shiki-dark');
  }, 20_000);

  it('returns null for unknown languages', async () => {
    expect(
      await highlightCode({ code: 'x', lang: 'not-a-language' }),
    ).toBeNull();
  }, 20_000);
});
```

`apps/web/src/features/chat/markdown.test.tsx`:

````tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightCode } from './highlight';
import { MarkdownContent } from './markdown';

vi.mock('./highlight', () => ({ highlightCode: vi.fn() }));
const highlight = vi.mocked(highlightCode);

describe('MarkdownContent', () => {
  beforeEach(() => {
    highlight.mockReset();
    highlight.mockResolvedValue(null);
  });

  it('renders GitHub-flavored markdown', () => {
    const { container } = render(
      <MarkdownContent
        content={
          '**bold** and `inline`\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |'
        }
      />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('inline').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('.markdown-table > table')).not.toBeNull();
  });

  it('opens links in a new tab safely and drops javascript: URLs', () => {
    render(
      <MarkdownContent content="[docs](https://example.com) [bad](javascript:alert(1))" />,
    );
    const docs = screen.getByRole('link', { name: 'docs' });
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('bad').closest('a')?.getAttribute('href')).toBe('');
  });

  it('never renders raw HTML', () => {
    const { container } = render(
      <MarkdownContent content={'<img src=x onerror="alert(1)"> <b>hi</b>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders fenced code with a language label and highlighted markup', async () => {
    highlight.mockResolvedValue(
      '<pre class="shiki"><code><span>const a = 1;</span></code></pre>',
    );
    const { container } = render(
      <MarkdownContent content={'```ts\nconst a = 1;\n```'} />,
    );
    expect(screen.getByText('ts')).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelector('.shiki')).not.toBeNull(),
    );
    expect(highlight).toHaveBeenCalledWith({
      code: 'const a = 1;',
      lang: 'ts',
    });
    expect(container.querySelector('.code-block-body')).toHaveClass(
      'overflow-x-auto',
    );
  });

  it('keeps plain code when highlighting fails', async () => {
    const { container } = render(
      <MarkdownContent content={'```ts\nconst a = 1;\n```'} />,
    );
    await waitFor(() => expect(highlight).toHaveBeenCalled());
    expect(container.querySelector('pre code')).toHaveTextContent(
      'const a = 1;',
    );
  });

  it('treats an unclosed fence as code and skips highlighting while streaming', () => {
    const { container } = render(
      <MarkdownContent content={'Here:\n```py\nprint(1'} streaming />,
    );
    expect(container.querySelector('pre code')).toHaveTextContent('print(1');
    expect(container.firstElementChild).toHaveClass('markdown-streaming');
    expect(highlight).not.toHaveBeenCalled();
  });

  it('copies code block contents', async () => {
    const user = userEvent.setup();
    render(<MarkdownContent content={'```\nnpm test\n```'} />);
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await navigator.clipboard.readText()).toBe('npm test');
  });
});
````

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components/copy-button.test.tsx src/features/chat/highlight.test.ts src/features/chat/markdown.test.tsx`
Expected: FAIL — unresolved imports `./copy-button`, `./highlight`, `./markdown`.

- [ ] **Step 4: Implement `CopyButton`**

Append to `apps/web/src/components/components.types.ts`:

```ts
export interface CopyButtonProps {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}
```

`apps/web/src/components/copy-button.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { CopyButtonProps } from './components.types';
import { CheckIcon, CopyIcon } from './icons';

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 1500;

export function CopyButton({
  text,
  label = 'Copy',
  showLabel = false,
  className = '',
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const caption =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg ${className}`}
    >
      {state === 'copied' ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      <span className={showLabel ? undefined : 'sr-only'}>{caption}</span>
    </button>
  );
}
```

- [ ] **Step 5: Implement `highlightCode`**

`apps/web/src/features/chat/highlight.ts`:

```ts
const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * Loads shiki on first use so it stays out of the initial bundle. Any failure
 * (unknown language, chunk load error) yields null and the caller keeps plain
 * code.
 */
export async function highlightCode({
  code,
  lang,
}: {
  code: string;
  lang: string;
}): Promise<string | null> {
  try {
    const { codeToHtml } = await import('shiki');
    return await codeToHtml(code, {
      lang,
      themes: THEMES,
      defaultColor: false,
    });
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Implement `CodeBlock` and `MarkdownContent`**

Append to `apps/web/src/features/chat/chat.types.ts`:

```ts
export interface CodeBlockProps {
  code: string;
  lang: string | null;
  streaming: boolean;
}

export interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
}
```

`apps/web/src/features/chat/code-block.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { CopyButton } from '../../components/copy-button';
import type { CodeBlockProps } from './chat.types';
import { highlightCode } from './highlight';

interface Highlighted {
  key: string;
  html: string;
}

export function CodeBlock({ code, lang, streaming }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);
  const key = `${lang ?? ''}\u0000${code}`;

  useEffect(() => {
    // Highlighting every streamed token is wasted work; wait for the final text.
    if (streaming || !lang) return;
    let cancelled = false;
    void highlightCode({ code, lang }).then((html) => {
      if (!cancelled && html) setHighlighted({ key, html });
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, key, streaming]);

  const html = highlighted?.key === key ? highlighted.html : null;

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border py-1 pr-1.5 pl-3 text-xs text-fg-muted">
        <span>{lang ?? 'text'}</span>
        <CopyButton text={code} label="Copy code" showLabel />
      </div>
      {html ? (
        <div
          className="code-block-body overflow-x-auto text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="code-block-body overflow-x-auto px-4 py-3 text-sm">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
```

`apps/web/src/features/chat/markdown.tsx`:

```tsx
import { isValidElement } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MarkdownContentProps } from './chat.types';
import { CodeBlock } from './code-block';

const REMARK_PLUGINS = [remarkGfm];
const LANGUAGE_PATTERN = /language-([\w#+.-]+)/;

function createComponents(streaming: boolean): Components {
  return {
    pre({ children }) {
      if (
        isValidElement<{ className?: string; children?: ReactNode }>(children)
      ) {
        const lang =
          LANGUAGE_PATTERN.exec(children.props.className ?? '')?.[1] ?? null;
        const raw = children.props.children;
        const code = (typeof raw === 'string' ? raw : '').replace(/\n$/, '');
        return <CodeBlock code={code} lang={lang} streaming={streaming} />;
      }
      return <pre>{children}</pre>;
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="markdown-table">
          <table>{children}</table>
        </div>
      );
    },
  };
}

const COMPONENTS = {
  idle: createComponents(false),
  streaming: createComponents(true),
};

export function MarkdownContent({
  content,
  streaming = false,
}: MarkdownContentProps) {
  return (
    <div className={streaming ? 'markdown markdown-streaming' : 'markdown'}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={streaming ? COMPONENTS.streaming : COMPONENTS.idle}
      >
        {content}
      </Markdown>
    </div>
  );
}
```

- [ ] **Step 7: Append markdown and code styles to `apps/web/src/styles.css`**

```css
@layer components {
  .markdown {
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .markdown > :first-child {
    margin-top: 0;
  }
  .markdown > :last-child {
    margin-bottom: 0;
  }
  .markdown :where(p, ul, ol, blockquote, .markdown-table) {
    margin: 0.75em 0;
  }
  .markdown :where(h1, h2, h3, h4) {
    margin: 1.25em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }
  .markdown h1 {
    font-size: 1.5em;
  }
  .markdown h2 {
    font-size: 1.3em;
  }
  .markdown h3 {
    font-size: 1.15em;
  }
  .markdown ul {
    list-style: disc;
    padding-left: 1.5em;
  }
  .markdown ol {
    list-style: decimal;
    padding-left: 1.5em;
  }
  .markdown li + li {
    margin-top: 0.25em;
  }
  .markdown .contains-task-list {
    list-style: none;
    padding-left: 0.25em;
  }
  .markdown .task-list-item input {
    margin-right: 0.4em;
  }
  .markdown a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .markdown blockquote {
    border-left: 3px solid var(--border);
    padding-left: 1em;
    color: var(--fg-muted);
  }
  .markdown :not(pre) > code {
    border-radius: 4px;
    background: var(--surface-2);
    padding: 0.1em 0.35em;
    font-size: 0.875em;
  }
  .markdown hr {
    margin: 1.5em 0;
    border-color: var(--border);
  }
  .markdown-table {
    overflow-x: auto;
  }
  .markdown table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .markdown :where(th, td) {
    border: 1px solid var(--border);
    padding: 0.4em 0.75em;
    text-align: left;
  }
  .markdown th {
    background: var(--surface);
    font-weight: 600;
  }
  .shiki,
  .shiki span {
    color: light-dark(var(--shiki-light), var(--shiki-dark));
  }
  .shiki {
    margin: 0;
    padding: 0.75rem 1rem;
    background: transparent !important;
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components/copy-button.test.tsx src/features/chat/highlight.test.ts src/features/chat/markdown.test.tsx`
Expected: PASS (11 tests). If the `javascript:` assertion fails because react-markdown renders the `a` without an `href` attribute, change that expectation to `expect(screen.getByText('bad').closest('a')?.getAttribute('href') ?? '').toBe('')` — the requirement is only that the unsafe URL never reaches the DOM.

- [ ] **Step 9: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src
git commit -m "feat(web): render assistant markdown with highlighted, copyable code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scroll-tracking hook and DOM test mocks

**Files:**

- Create: `apps/web/src/test/dom.ts`
- Modify: `apps/web/src/test/setup.ts`
- Modify: `apps/web/src/features/chat/chat.types.ts`
- Create: `apps/web/src/features/chat/use-scroll-tracking.ts`
- Test: `apps/web/src/features/chat/use-scroll-tracking.test.tsx`

**Interfaces:**

- Produces (test utils, `src/test/dom.ts`): `installDomMocks()`, `resetObservers()`, `triggerResize()`, `triggerIntersection(target: Element, init: { isIntersecting: boolean; top?: number; rootBottom?: number })`, `mockScrollGeometry(element: HTMLElement, initial: { scrollHeight: number; clientHeight: number; scrollTop?: number }): { scrollHeight: number; clientHeight: number; scrollTop: number }` (returned object is live — mutate it to change geometry), `getScrollContainer(): HTMLElement` (finds `[data-scroll-container]`).
- Produces (app):
  - `PROMPT_ATTRIBUTE = 'data-prompt-id'` exported from `use-scroll-tracking.ts`.
  - `useScrollTracking({ promptIds: string[]; resetKey: string }): ScrollTracking`
  - `ScrollTracking = { containerRef(el: HTMLDivElement | null): void; contentRef(el: HTMLDivElement | null): void; activePromptId: string | null; isOverflowing: boolean; isAtBottom: boolean; scrollToPrompt(id: string): void; scrollToBottom(): void; preserveScrollPosition(): void }`
  - Contract for consumers: the scroll container gets `containerRef` and must be `position: relative`; the inner content wrapper gets `contentRef`; each prompt element carries `data-prompt-id="<id>"` and `tabIndex={-1}`.

- [ ] **Step 1: Create the DOM mocks**

jsdom 29 has no `IntersectionObserver`, `ResizeObserver`, `Element.scrollTo`, `scrollIntoView`, or `HTMLDialogElement.showModal`. `apps/web/src/test/dom.ts`:

```ts
import { act } from '@testing-library/react';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly elements = new Set<Element>();

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly elements = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }
}

export function installDomMocks(): void {
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    if (typeof options === 'number') this.scrollTop = y ?? 0;
    else if (options?.top !== undefined) this.scrollTop = options.top;
    this.dispatchEvent(new Event('scroll'));
  };
  Element.prototype.scrollIntoView = function scrollIntoView() {
    // jsdom has no layout, so there is nothing to scroll.
  };
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

export function resetObservers(): void {
  MockIntersectionObserver.instances = [];
  MockResizeObserver.instances = [];
}

export function triggerResize(): void {
  act(() => {
    for (const observer of MockResizeObserver.instances) {
      if (observer.elements.size === 0) continue;
      observer.callback([], observer as unknown as ResizeObserver);
    }
  });
}

export function triggerIntersection(
  target: Element,
  init: { isIntersecting: boolean; top?: number; rootBottom?: number },
): void {
  act(() => {
    for (const observer of MockIntersectionObserver.instances) {
      if (!observer.elements.has(target)) continue;
      const entry = {
        target,
        isIntersecting: init.isIntersecting,
        intersectionRatio: init.isIntersecting ? 1 : 0,
        boundingClientRect: { top: init.top ?? 0 } as DOMRectReadOnly,
        rootBounds: { bottom: init.rootBottom ?? 300 } as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        time: 0,
      } as IntersectionObserverEntry;
      observer.callback([entry], observer as unknown as IntersectionObserver);
    }
  });
}

export function mockScrollGeometry(
  element: HTMLElement,
  initial: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): { scrollHeight: number; clientHeight: number; scrollTop: number } {
  const geometry = { scrollTop: 0, ...initial };
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => geometry.scrollHeight },
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
    scrollTop: {
      configurable: true,
      get: () => geometry.scrollTop,
      set: (value: number) => {
        geometry.scrollTop = value;
      },
    },
  });
  return geometry;
}

export function getScrollContainer(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '[data-scroll-container]',
  );
  if (!element) throw new Error('Scroll container is not rendered.');
  return element;
}
```

In `apps/web/src/test/setup.ts`, change the imports and `afterEach`, and install the mocks. Replace the top three lines:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

with:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installDomMocks, resetObservers } from './dom';

installDomMocks();

afterEach(() => {
  cleanup();
  resetObservers();
});
```

(Keep the existing `createMemoryStorage` block unchanged.)

- [ ] **Step 2: Write the failing hook tests**

`apps/web/src/features/chat/use-scroll-tracking.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockScrollGeometry,
  triggerIntersection,
  triggerResize,
} from '../../test/dom';
import { useScrollTracking } from './use-scroll-tracking';

const PROMPTS = ['p1', 'p2', 'p3'];

function Harness({ resetKey = 'chat-a' }: { resetKey?: string }) {
  const scroll = useScrollTracking({ promptIds: PROMPTS, resetKey });
  return (
    <>
      <p data-testid="active">{scroll.activePromptId ?? 'none'}</p>
      <p data-testid="overflowing">{String(scroll.isOverflowing)}</p>
      <p data-testid="at-bottom">{String(scroll.isAtBottom)}</p>
      <button type="button" onClick={() => scroll.scrollToPrompt('p3')}>
        go p3
      </button>
      <button type="button" onClick={scroll.scrollToBottom}>
        bottom
      </button>
      <button type="button" onClick={scroll.preserveScrollPosition}>
        preserve
      </button>
      <div ref={scroll.containerRef} data-testid="container">
        <div ref={scroll.contentRef}>
          {PROMPTS.map((id) => (
            <article key={id} data-prompt-id={id} tabIndex={-1}>
              {id}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const prompt = (id: string) => screen.getByText(id, { selector: 'article' });

describe('useScrollTracking', () => {
  afterEach(() => vi.useRealTimers());

  it('reports overflow only when content is taller than the container', () => {
    render(<Harness />);
    const geometry = mockScrollGeometry(screen.getByTestId('container'), {
      scrollHeight: 400,
      clientHeight: 500,
    });
    triggerResize();
    expect(text('overflowing')).toBe('false');

    geometry.scrollHeight = 1200;
    triggerResize();
    expect(text('overflowing')).toBe('true');
  });

  it('follows new content while pinned, but not after the reader scrolls up', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 500,
    });
    triggerResize();
    expect(geometry.scrollTop).toBe(1000);

    geometry.scrollTop = 100;
    fireEvent.scroll(container);
    expect(text('at-bottom')).toBe('false');
    geometry.scrollHeight = 1400;
    triggerResize();
    expect(geometry.scrollTop).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: 'bottom' }));
    expect(text('at-bottom')).toBe('true');
    expect(geometry.scrollTop).toBe(1400);
  });

  it('tracks the active prompt as prompts cross the top band', () => {
    render(<Harness />);
    triggerIntersection(prompt('p2'), { isIntersecting: true });
    expect(text('active')).toBe('p2');

    triggerIntersection(prompt('p2'), {
      isIntersecting: false,
      top: 900,
      rootBottom: 300,
    });
    expect(text('active')).toBe('p1');
  });

  it('locks the selected prompt while scrolling to it and focuses it', () => {
    vi.useFakeTimers();
    render(<Harness />);
    triggerIntersection(prompt('p1'), { isIntersecting: true });

    fireEvent.click(screen.getByRole('button', { name: 'go p3' }));
    expect(text('active')).toBe('p3');
    expect(document.activeElement).toBe(prompt('p3'));

    triggerIntersection(prompt('p2'), { isIntersecting: true });
    expect(text('active')).toBe('p3');

    act(() => vi.advanceTimersByTime(600));
    expect(text('active')).toBe('p2');
  });

  it('keeps the reading position when older content is prepended', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 100,
    });
    fireEvent.scroll(container);

    fireEvent.click(screen.getByRole('button', { name: 'preserve' }));
    geometry.scrollHeight = 1600;
    triggerResize();

    expect(geometry.scrollTop).toBe(700);
  });

  it('resets pinning and highlight when the conversation changes', () => {
    const { rerender } = render(<Harness resetKey="chat-a" />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 100,
    });
    triggerIntersection(prompt('p2'), { isIntersecting: true });
    fireEvent.scroll(container);
    expect(text('at-bottom')).toBe('false');

    rerender(<Harness resetKey="chat-b" />);
    expect(text('active')).toBe('none');
    expect(text('at-bottom')).toBe('true');

    geometry.scrollHeight = 1300;
    triggerResize();
    expect(geometry.scrollTop).toBe(1300);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/use-scroll-tracking.test.tsx`
Expected: FAIL — `Failed to resolve import "./use-scroll-tracking"`.

- [ ] **Step 4: Add the types**

Append to `apps/web/src/features/chat/chat.types.ts`:

```ts
export interface UseScrollTrackingParams {
  promptIds: string[];
  resetKey: string;
}

export interface ScrollTracking {
  containerRef: (element: HTMLDivElement | null) => void;
  contentRef: (element: HTMLDivElement | null) => void;
  activePromptId: string | null;
  isOverflowing: boolean;
  isAtBottom: boolean;
  scrollToPrompt: (id: string) => void;
  scrollToBottom: () => void;
  preserveScrollPosition: () => void;
}
```

- [ ] **Step 5: Implement the hook**

`apps/web/src/features/chat/use-scroll-tracking.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollTracking, UseScrollTrackingParams } from './chat.types';

export const PROMPT_ATTRIBUTE = 'data-prompt-id';

const BOTTOM_THRESHOLD_PX = 80;
const SCROLL_PADDING_PX = 16;
const SELECT_LOCK_MS = 600;
// Observe only the top 30% of the container: a prompt becomes active when its
// top edge crosses into that band.
const ACTIVE_BAND_MARGIN = '0px 0px -70% 0px';

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

function findPrompt(container: HTMLElement, id: string): HTMLElement | null {
  for (const node of container.querySelectorAll<HTMLElement>(
    `[${PROMPT_ATTRIBUTE}]`,
  )) {
    if (node.getAttribute(PROMPT_ATTRIBUTE) === id) return node;
  }
  return null;
}

function isNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    BOTTOM_THRESHOLD_PX
  );
}

export function useScrollTracking({
  promptIds,
  resetKey,
}: UseScrollTrackingParams): ScrollTracking {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [observedActiveId, setObservedActiveId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [trackedKey, setTrackedKey] = useState(resetKey);
  const pinnedRef = useRef(true);
  const prependAnchorRef = useRef<number | null>(null);
  const promptKey = promptIds.join('\n');
  const ids = useMemo(
    () => (promptKey ? promptKey.split('\n') : []),
    [promptKey],
  );

  // A different conversation starts pinned to the bottom with no highlight.
  if (trackedKey !== resetKey) {
    setTrackedKey(resetKey);
    setObservedActiveId(null);
    setLockedId(null);
    setIsAtBottom(true);
  }

  useEffect(() => {
    pinnedRef.current = true;
    prependAnchorRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!container) return;
    const onScroll = () => {
      const pinned = isNearBottom(container);
      pinnedRef.current = pinned;
      setIsAtBottom(pinned);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [container]);

  useEffect(() => {
    if (!container || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const anchor = prependAnchorRef.current;
      if (anchor !== null) {
        // Older messages were prepended: keep the same distance from the bottom.
        prependAnchorRef.current = null;
        container.scrollTop = container.scrollHeight - anchor;
      } else if (pinnedRef.current) {
        container.scrollTop = container.scrollHeight;
      }
      setIsOverflowing(container.scrollHeight > container.clientHeight + 1);
    });
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [container, content]);

  useEffect(() => {
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute(PROMPT_ATTRIBUTE);
          if (!id) continue;
          if (entry.isIntersecting) {
            setObservedActiveId(id);
          } else if (
            entry.rootBounds &&
            entry.boundingClientRect.top >= entry.rootBounds.bottom
          ) {
            // The prompt left the band downward (reader scrolled up), so the
            // prompt before it is the one being read.
            const previous = ids[ids.indexOf(id) - 1] ?? null;
            setObservedActiveId((current) =>
              current === id ? previous : current,
            );
          }
        }
      },
      { root: container, rootMargin: ACTIVE_BAND_MARGIN, threshold: 0 },
    );
    for (const id of ids) {
      const node = findPrompt(container, id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [container, ids]);

  useEffect(() => {
    if (lockedId === null) return;
    const timer = window.setTimeout(() => setLockedId(null), SELECT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, [lockedId]);

  const scrollToPrompt = useCallback(
    (id: string) => {
      if (!container) return;
      const node = findPrompt(container, id);
      if (!node) return;
      setLockedId(id);
      pinnedRef.current = false;
      container.scrollTo({
        top: Math.max(0, node.offsetTop - SCROLL_PADDING_PX),
        behavior: scrollBehavior(),
      });
      node.focus({ preventScroll: true });
    },
    [container],
  );

  const scrollToBottom = useCallback(() => {
    if (!container) return;
    pinnedRef.current = true;
    setIsAtBottom(true);
    container.scrollTo({
      top: container.scrollHeight,
      behavior: scrollBehavior(),
    });
  }, [container]);

  const preserveScrollPosition = useCallback(() => {
    if (!container) return;
    prependAnchorRef.current = container.scrollHeight - container.scrollTop;
  }, [container]);

  return {
    containerRef: setContainer,
    contentRef: setContent,
    activePromptId: lockedId ?? observedActiveId,
    isOverflowing,
    isAtBottom,
    scrollToPrompt,
    scrollToBottom,
    preserveScrollPosition,
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/use-scroll-tracking.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass (existing suites are unaffected by the new global mocks).

```bash
git add apps/web/src
git commit -m "feat(web): add scroll-tracking hook with observer-based prompt spy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Transcript redesign

**Files:**

- Modify: `apps/web/src/features/chat/chat.helpers.ts`
- Modify: `apps/web/src/features/chat/chat.types.ts`
- Rewrite: `apps/web/src/features/chat/message-list.tsx`
- Modify: `apps/web/src/features/chat/chat-page.tsx`
- Modify: `apps/web/src/styles.css` (append)
- Test: `apps/web/src/features/chat/chat.helpers.test.ts`, `apps/web/src/features/chat/message-list.test.tsx`

**Interfaces:**

- Consumes: `useScrollTracking`, `ScrollTracking` (Task 3); `MarkdownContent` (Task 2); `CopyButton` (Task 2); `ArrowDownIcon` (Task 1).
- Produces:
  - `PENDING_PROMPT_ID = 'pending-prompt'` (chat.helpers).
  - `isPendingVisible(pending: PendingStream | null): pending is PendingStream` — true when streaming and accepted (`userMessageId !== null`).
  - `visibleServerMessages({ messages, pending }: PendingMessagesParams): ChatMessage[]` — drops rows the pending stream is rendering.
  - `collectPrompts({ messages, pending }: PendingMessagesParams): PromptSummary[]` with `PromptSummary = { id: string; preview: string }`.
  - `MessageListProps` gains `scroll: ScrollTracking`. The scroll container has `data-scroll-container`.

- [ ] **Step 1: Write the failing helper tests**

In `apps/web/src/features/chat/chat.helpers.test.ts`, extend the import:

```ts
import {
  PENDING_PROMPT_ID,
  applyStreamEvent,
  collectPrompts,
  deriveChatTitle,
  describeTokens,
  groupChatsByRecency,
  mergeMessages,
} from './chat.helpers';
```

and append:

```ts
describe('collectPrompts', () => {
  it('lists user prompts once, replacing rows owned by the pending stream', () => {
    const prompts = collectPrompts({
      messages: [
        makeMessage({ id: 'u1', content: '  First\n\n question ' }),
        makeMessage({ id: 'a1', role: 'assistant', content: 'Answer' }),
        makeMessage({ id: 'u2', content: 'Live' }),
        makeMessage({ id: 'a2', role: 'assistant', content: '' }),
      ],
      pending: {
        ...pending,
        userContent: 'Live',
        userMessageId: 'u2',
        assistantMessageId: 'a2',
      },
    });
    expect(prompts).toEqual([
      { id: 'u1', preview: 'First question' },
      { id: PENDING_PROMPT_ID, preview: 'Live' },
    ]);
  });

  it('omits the pending prompt until the stream is accepted', () => {
    const prompts = collectPrompts({
      messages: [makeMessage({ id: 'u1', content: 'Hi' })],
      pending,
    });
    expect(prompts).toEqual([{ id: 'u1', preview: 'Hi' }]);
  });
});
```

- [ ] **Step 2: Write the failing MessageList tests**

Replace `apps/web/src/features/chat/message-list.test.tsx` with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getScrollContainer, mockScrollGeometry } from '../../test/dom';
import { makeMessage } from '../../test/fixtures';
import { PENDING_PROMPT_ID } from './chat.helpers';
import type { MessageListProps, PendingStream } from './chat.types';
import { MessageList } from './message-list';
import { useScrollTracking } from './use-scroll-tracking';

function Harness(props: Omit<MessageListProps, 'scroll'>) {
  const scroll = useScrollTracking({ promptIds: [], resetKey: 'test' });
  return <MessageList {...props} scroll={scroll} />;
}

const base = { hasOlder: false, isLoadingOlder: false, onLoadOlder: vi.fn() };

const streaming: PendingStream = {
  chatId: 'c',
  status: 'streaming',
  userContent: 'Live question',
  userMessageId: 'u',
  assistantMessageId: 'a',
  model: 'm',
  assistantText: 'Partial ans',
  errorMessage: null,
};

describe('MessageList', () => {
  it('renders messages with expandable model and token details', () => {
    render(
      <Harness
        {...base}
        pending={null}
        messages={[
          makeMessage({ id: '1', content: 'Question' }),
          makeMessage({
            id: '2',
            role: 'assistant',
            content: 'Answer',
            model: 'qwen2.5:1.5b',
            completionTokens: 7,
            status: 'cancelled',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('Model: qwen2.5:1.5b')).toBeInTheDocument();
    expect(screen.getByText('Completion tokens: 7')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('renders assistant replies as markdown and user prompts as wrapped text', () => {
    render(
      <Harness
        {...base}
        pending={null}
        messages={[
          makeMessage({ id: '1', content: '**not bold** ' + 'x'.repeat(300) }),
          makeMessage({ id: '2', role: 'assistant', content: '**bold**' }),
        ]}
      />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    const prompt = screen.getByText(/\*\*not bold\*\*/);
    expect(prompt.tagName).toBe('P');
    expect(prompt).toHaveClass('break-words');
  });

  it('shows streamed text and does not duplicate persisted rows', () => {
    render(
      <Harness
        {...base}
        pending={streaming}
        messages={[
          makeMessage({ id: 'u', content: 'Live question' }),
          makeMessage({
            id: 'a',
            role: 'assistant',
            content: '',
            status: 'streaming',
          }),
        ]}
      />,
    );
    expect(screen.getAllByText('Live question')).toHaveLength(1);
    expect(screen.getByText('Partial ans')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Assistant' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows a thinking indicator before the first token', () => {
    render(
      <Harness
        {...base}
        pending={{ ...streaming, assistantText: '' }}
        messages={[]}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Assistant is thinking' }),
    ).toBeInTheDocument();
  });

  it('marks user prompts as navigation targets, including the pending one', () => {
    render(
      <Harness
        {...base}
        pending={streaming}
        messages={[makeMessage({ id: 'u0', content: 'Earlier' })]}
      />,
    );
    expect(screen.getByText('Earlier').closest('article')).toHaveAttribute(
      'data-prompt-id',
      'u0',
    );
    expect(
      screen.getByText('Live question').closest('article'),
    ).toHaveAttribute('data-prompt-id', PENDING_PROMPT_ID);
  });

  it('offers a jump-to-latest button after the reader scrolls up', async () => {
    render(<Harness {...base} pending={null} messages={[makeMessage()]} />);
    const container = getScrollContainer();
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 100,
    });
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();

    fireEvent.scroll(container);
    await userEvent.click(
      screen.getByRole('button', { name: 'Jump to latest' }),
    );

    expect(geometry.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
  });

  it('loads earlier messages on demand', async () => {
    const onLoadOlder = vi.fn();
    render(
      <Harness
        messages={[]}
        pending={null}
        hasOlder
        isLoadingOlder={false}
        onLoadOlder={onLoadOlder}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Load earlier messages' }),
    );
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/chat.helpers.test.ts src/features/chat/message-list.test.tsx`
Expected: FAIL — `collectPrompts`/`PENDING_PROMPT_ID` not exported; MessageList tests fail (no markdown, no `data-scroll-container`, no jump button).

- [ ] **Step 4: Add types and helpers**

Append to `apps/web/src/features/chat/chat.types.ts`:

```ts
export interface PendingMessagesParams {
  messages: ChatMessage[];
  pending: PendingStream | null;
}

export interface PromptSummary {
  id: string;
  preview: string;
}

export interface UserMessageProps {
  id: string;
  content: string;
}

export interface AssistantMessageProps {
  content: string;
  streaming: boolean;
  status: ChatMessage['status'] | null;
  details: string[];
}
```

In the same file, replace the `MessageListProps` and `MessageBubbleProps` interfaces with:

```ts
export interface MessageListProps {
  messages: ChatMessage[];
  pending: PendingStream | null;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  scroll: ScrollTracking;
}
```

In `apps/web/src/features/chat/chat.helpers.ts`, update the type import:

```ts
import type {
  ApplyStreamEventParams,
  ChatGroup,
  GroupChatsParams,
  PendingMessagesParams,
  PendingStream,
  PromptSummary,
} from './chat.types';
```

Replace `deriveChatTitle` with:

```ts
function collapseWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function deriveChatTitle(content: string): string {
  const singleLine = collapseWhitespace(content);
  return singleLine.length > 60 ? `${singleLine.slice(0, 57)}…` : singleLine;
}
```

Append:

```ts
export const PENDING_PROMPT_ID = 'pending-prompt';

export function isPendingVisible(
  pending: PendingStream | null,
): pending is PendingStream {
  return pending?.status === 'streaming' && pending.userMessageId !== null;
}

export function visibleServerMessages({
  messages,
  pending,
}: PendingMessagesParams): ChatMessage[] {
  if (!pending) return messages;
  return messages.filter(
    (message) =>
      message.id !== pending.userMessageId &&
      message.id !== pending.assistantMessageId,
  );
}

export function collectPrompts({
  messages,
  pending,
}: PendingMessagesParams): PromptSummary[] {
  const prompts = visibleServerMessages({ messages, pending })
    .filter((message) => message.role === 'user')
    .map((message) => ({
      id: message.id,
      preview: collapseWhitespace(message.content),
    }));
  if (isPendingVisible(pending)) {
    prompts.push({
      id: PENDING_PROMPT_ID,
      preview: collapseWhitespace(pending.userContent),
    });
  }
  return prompts;
}
```

- [ ] **Step 5: Rewrite `apps/web/src/features/chat/message-list.tsx`**

```tsx
import { CopyButton } from '../../components/copy-button';
import { ArrowDownIcon } from '../../components/icons';
import {
  PENDING_PROMPT_ID,
  describeTokens,
  isPendingVisible,
  visibleServerMessages,
} from './chat.helpers';
import type {
  AssistantMessageProps,
  MessageListProps,
  UserMessageProps,
} from './chat.types';
import { MarkdownContent } from './markdown';

const STATUS_CHIP = {
  failed: { label: 'Response failed', className: 'bg-danger-soft text-danger' },
  cancelled: { label: 'Stopped', className: 'bg-warning-soft text-warning' },
  streaming: { label: 'Incomplete', className: 'bg-warning-soft text-warning' },
} as const;

const ACTION_ROW =
  'mt-1 flex items-center gap-1 transition-opacity can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100 can-hover:has-open:opacity-100';

function UserMessage({ id, content }: UserMessageProps) {
  return (
    <li className="group flex flex-col items-end">
      <article
        aria-label="You"
        data-prompt-id={id}
        tabIndex={-1}
        className="max-w-[75%] rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] leading-7 text-fg"
      >
        <p className="break-words whitespace-pre-wrap">{content}</p>
      </article>
      <div className={ACTION_ROW}>
        <CopyButton text={content} label="Copy prompt" />
      </div>
    </li>
  );
}

function ThinkingIndicator() {
  return (
    <span
      role="status"
      aria-label="Assistant is thinking"
      className="inline-flex gap-1 py-2"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="thinking-dot size-1.5 rounded-full bg-fg-subtle"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

function AssistantMessage({
  content,
  streaming,
  status,
  details,
}: AssistantMessageProps) {
  const chip = status && status !== 'completed' ? STATUS_CHIP[status] : null;

  return (
    <li className="group">
      <article
        aria-label="Assistant"
        aria-busy={streaming || undefined}
        className="text-[15px] text-fg"
      >
        {content ? (
          <MarkdownContent content={content} streaming={streaming} />
        ) : streaming ? (
          <ThinkingIndicator />
        ) : null}
        {chip && !streaming ? (
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
          >
            {chip.label}
          </span>
        ) : null}
      </article>
      {streaming ? null : (
        <div className={ACTION_ROW}>
          {content ? <CopyButton text={content} label="Copy response" /> : null}
          {details.length > 0 ? (
            <details className="text-xs text-fg-subtle">
              <summary className="cursor-pointer rounded-md px-1.5 py-1 select-none hover:bg-surface-2 hover:text-fg">
                Details
              </summary>
              <ul className="mt-1 space-y-0.5 px-1.5 font-mono">
                {details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function MessageList({
  messages,
  pending,
  hasOlder,
  isLoadingOlder,
  onLoadOlder,
  scroll,
}: MessageListProps) {
  const serverMessages = visibleServerMessages({ messages, pending });

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll.containerRef}
        data-scroll-container
        className="relative h-full overflow-y-auto [overflow-anchor:none]"
      >
        <div ref={scroll.contentRef} className="mx-auto max-w-3xl px-4 py-8">
          {hasOlder ? (
            <div className="mb-6 text-center">
              <button
                type="button"
                disabled={isLoadingOlder}
                onClick={() => {
                  scroll.preserveScrollPosition();
                  onLoadOlder();
                }}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-60"
              >
                {isLoadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          ) : null}
          <ol
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            className="space-y-8"
          >
            {serverMessages.map((message) =>
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  id={message.id}
                  content={message.content}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  content={message.content}
                  streaming={false}
                  status={message.status}
                  details={describeTokens(message)}
                />
              ),
            )}
            {isPendingVisible(pending) ? (
              <>
                <UserMessage
                  id={PENDING_PROMPT_ID}
                  content={pending.userContent}
                />
                <AssistantMessage
                  content={pending.assistantText}
                  streaming
                  status={null}
                  details={[]}
                />
              </>
            ) : null}
          </ol>
        </div>
      </div>
      {scroll.isAtBottom ? null : (
        <button
          type="button"
          onClick={scroll.scrollToBottom}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-sm text-fg shadow-md hover:bg-surface"
        >
          <ArrowDownIcon className="size-4" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Append streaming animation CSS to `apps/web/src/styles.css`**

```css
@layer components {
  .markdown-streaming > :last-child::after {
    content: '';
    display: inline-block;
    width: 0.5em;
    height: 1em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: currentColor;
    animation: caret-blink 1s steps(2, start) infinite;
  }
  .thinking-dot {
    animation: thinking 1s ease-in-out infinite;
  }
}

@keyframes caret-blink {
  to {
    visibility: hidden;
  }
}

@keyframes thinking {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
```

- [ ] **Step 7: Wire the hook into `apps/web/src/features/chat/chat-page.tsx`**

Update imports:

```ts
import { collectPrompts, deriveChatTitle, mergeMessages } from './chat.helpers';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { ModelSelector } from './model-selector';
import { useChatStream } from './use-chat-stream';
import { useScrollTracking } from './use-scroll-tracking';
```

After the `const messages = mergeMessages(...)` statement add:

```ts
const chatPending = pending && pending.chatId === chatId ? pending : null;
const prompts = collectPrompts({ messages, pending: chatPending });
const scroll = useScrollTracking({
  promptIds: prompts.map((prompt) => prompt.id),
  resetKey: scope,
});
```

In `handleSend`, directly after `if (!activeModel) return false;` add:

```ts
scroll.scrollToBottom();
```

Replace the `<MessageList ... />` element with:

```tsx
<MessageList
  messages={messages}
  pending={chatPending}
  hasOlder={Boolean(chat.hasNextPage)}
  isLoadingOlder={chat.isFetchingNextPage}
  onLoadOlder={() => void chat.fetchNextPage()}
  scroll={scroll}
/>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat`
Expected: PASS — helpers, message-list, chat-page, composer, model-selector, markdown, hook.

- [ ] **Step 9: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): redesign transcript with markdown, smart scrolling, and actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Prompt navigator and two-column chat layout

**Files:**

- Modify: `apps/web/src/features/chat/chat.helpers.ts`, `chat.types.ts`
- Create: `apps/web/src/features/chat/prompt-navigator.tsx`
- Rewrite: `apps/web/src/features/chat/chat-page.tsx`
- Test: `apps/web/src/features/chat/prompt-navigator.test.tsx`, `chat.helpers.test.ts`, `chat-page.test.tsx`

**Interfaces:**

- Consumes: `collectPrompts`, `PromptSummary` (Task 4); `useScrollTracking` (Task 3).
- Produces:
  - `MIN_NAVIGATOR_PROMPTS = 3`; `shouldShowNavigator({ promptCount: number; isOverflowing: boolean }): boolean`.
  - `PromptNavigator({ prompts: PromptSummary[]; activeId: string | null; onSelect(id: string): void })` rendering `<nav aria-label="Prompts in this chat">`.
  - `ChatPage` layout: left column (transcript, error, composer) + right column `hidden w-64 xl:block` containing the navigator.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/features/chat/chat.helpers.test.ts` (and add `shouldShowNavigator` to its import list):

```ts
describe('shouldShowNavigator', () => {
  it('needs both overflow and at least three prompts', () => {
    expect(shouldShowNavigator({ promptCount: 3, isOverflowing: true })).toBe(
      true,
    );
    expect(shouldShowNavigator({ promptCount: 2, isOverflowing: true })).toBe(
      false,
    );
    expect(shouldShowNavigator({ promptCount: 9, isOverflowing: false })).toBe(
      false,
    );
  });
});
```

`apps/web/src/features/chat/prompt-navigator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromptNavigator } from './prompt-navigator';

const prompts = [
  { id: 'a', preview: 'First question' },
  { id: 'b', preview: 'Second question' },
  { id: 'c', preview: 'https://example.com/' + 'x'.repeat(400) },
];

describe('PromptNavigator', () => {
  it('lists prompts in order and marks the active one', () => {
    render(
      <PromptNavigator prompts={prompts} activeId="b" onSelect={vi.fn()} />,
    );
    const nav = screen.getByRole('navigation', {
      name: 'Prompts in this chat',
    });
    const buttons = screen.getAllByRole('button');
    expect(nav).toBeInTheDocument();
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Prompt 1: First question',
      'Prompt 2: Second question',
      `Prompt 3: ${prompts[2]?.preview}`,
    ]);
    expect(buttons[1]).toHaveAttribute('aria-current', 'true');
    expect(buttons[0]).not.toHaveAttribute('aria-current');
  });

  it('truncates long prompts but exposes the full text', () => {
    render(
      <PromptNavigator prompts={prompts} activeId={null} onSelect={vi.fn()} />,
    );
    const long = screen.getByRole('button', { name: /Prompt 3/ });
    expect(long).toHaveClass('truncate');
    expect(long).toHaveAttribute('title', prompts[2]?.preview);
  });

  it('reports the selected prompt', async () => {
    const onSelect = vi.fn();
    render(
      <PromptNavigator prompts={prompts} activeId={null} onSelect={onSelect} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /First question/ }),
    );
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
```

Append to `apps/web/src/features/chat/chat-page.test.tsx` (add `import { getScrollContainer, mockScrollGeometry, triggerResize } from '../../test/dom';` to its imports):

```tsx
function chatWithPrompts(count: number) {
  return {
    ...makeChat({ id: 'c1' }),
    nextCursor: null,
    messages: Array.from({ length: count }, (_, index) => [
      makeMessage({ id: `u${index}`, content: `Prompt number ${index}` }),
      makeMessage({
        id: `a${index}`,
        role: 'assistant',
        content: `Reply ${index}`,
      }),
    ]).flat(),
  };
}

describe('ChatPage prompt navigator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getModels.mockResolvedValue({
      models: [{ name: 'qwen2.5:1.5b', default: true }],
    });
  });

  const navigator = () =>
    screen.queryByRole('navigation', { name: 'Prompts in this chat' });

  it('appears once a chat with three prompts overflows the screen', async () => {
    api.getChat.mockResolvedValue(chatWithPrompts(3));
    renderPage('/chats/c1');
    await screen.findByText('Reply 2');
    const geometry = mockScrollGeometry(getScrollContainer(), {
      scrollHeight: 400,
      clientHeight: 600,
    });
    triggerResize();
    expect(navigator()).toBeNull();

    geometry.scrollHeight = 2000;
    triggerResize();
    expect(navigator()).toBeInTheDocument();
  });

  it('stays hidden with fewer than three prompts even when overflowing', async () => {
    api.getChat.mockResolvedValue(chatWithPrompts(2));
    renderPage('/chats/c1');
    await screen.findByText('Reply 1');
    mockScrollGeometry(getScrollContainer(), {
      scrollHeight: 2000,
      clientHeight: 600,
    });
    triggerResize();
    expect(navigator()).toBeNull();
  });

  it('scrolls to and focuses the chosen prompt', async () => {
    api.getChat.mockResolvedValue(chatWithPrompts(3));
    renderPage('/chats/c1');
    await screen.findByText('Reply 2');
    mockScrollGeometry(getScrollContainer(), {
      scrollHeight: 2000,
      clientHeight: 600,
    });
    triggerResize();

    const entry = screen.getByRole('button', { name: /Prompt number 1/ });
    await userEvent.click(entry);

    expect(entry).toHaveAttribute('aria-current', 'true');
    expect(document.activeElement).toHaveAttribute('data-prompt-id', 'u1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat`
Expected: FAIL — `shouldShowNavigator` and `./prompt-navigator` missing; navigator tests in chat-page fail.

- [ ] **Step 3: Implement helper, types, and navigator**

Append to `apps/web/src/features/chat/chat.helpers.ts`:

```ts
export const MIN_NAVIGATOR_PROMPTS = 3;

export function shouldShowNavigator({
  promptCount,
  isOverflowing,
}: {
  promptCount: number;
  isOverflowing: boolean;
}): boolean {
  return isOverflowing && promptCount >= MIN_NAVIGATOR_PROMPTS;
}
```

Append to `apps/web/src/features/chat/chat.types.ts`:

```ts
export interface PromptNavigatorProps {
  prompts: PromptSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}
```

`apps/web/src/features/chat/prompt-navigator.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { PromptNavigatorProps } from './chat.types';

export function PromptNavigator({
  prompts,
  activeId,
  onSelect,
}: PromptNavigatorProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  return (
    <nav aria-label="Prompts in this chat" className="flex h-full flex-col">
      <h2 className="px-4 pt-4 pb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        Prompts
      </h2>
      <ol
        ref={listRef}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4"
      >
        {prompts.map((prompt, index) => {
          const active = prompt.id === activeId;
          return (
            <li key={prompt.id}>
              <button
                type="button"
                title={prompt.preview}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(prompt.id)}
                className={`relative block w-full truncate rounded-md py-1.5 pr-2 pl-3 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent-soft font-medium text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <span className="sr-only">Prompt {index + 1}: </span>
                {prompt.preview}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Rewrite `apps/web/src/features/chat/chat-page.tsx`**

```tsx
import { useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import {
  collectPrompts,
  deriveChatTitle,
  mergeMessages,
  shouldShowNavigator,
} from './chat.helpers';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { ModelSelector } from './model-selector';
import { PromptNavigator } from './prompt-navigator';
import { useChatStream } from './use-chat-stream';
import { useScrollTracking } from './use-scroll-tracking';

interface ModelOverride {
  scope: string;
  model: string;
}

export function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pending, send, cancel, dismissError } = useChatStream();
  const [override, setOverride] = useState<ModelOverride | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const scope = chatId ?? 'new';

  const models = useQuery({ queryKey: ['models'], queryFn: api.getModels });
  const chat = useInfiniteQuery({
    queryKey: ['chats', 'detail', chatId],
    enabled: Boolean(chatId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.getChat(chatId ?? '', { cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const modelList = models.data?.models ?? [];
  const defaultModel =
    modelList.find((model) => model.default)?.name ??
    modelList[0]?.name ??
    null;
  const chatModel = chat.data?.pages[0]?.selectedModel ?? null;
  const activeModel =
    (override?.scope === scope ? override.model : null) ??
    chatModel ??
    defaultModel;
  const isBusy = pending?.status === 'streaming';
  const messages = mergeMessages(
    chat.data?.pages.map((page) => page.messages) ?? [],
  );
  const chatPending = pending && pending.chatId === chatId ? pending : null;
  const prompts = collectPrompts({ messages, pending: chatPending });
  const scroll = useScrollTracking({
    promptIds: prompts.map((prompt) => prompt.id),
    resetKey: scope,
  });
  const showNavigator = shouldShowNavigator({
    promptCount: prompts.length,
    isOverflowing: scroll.isOverflowing,
  });

  const handleSend = async (content: string): Promise<boolean> => {
    if (!activeModel) return false;
    scroll.scrollToBottom();
    setSendError(null);
    dismissError();
    let targetId = chatId;

    if (!targetId) {
      try {
        const created = await api.createChat({
          model: activeModel,
          title: deriveChatTitle(content),
        });
        targetId = created.id;
        setOverride({ scope: created.id, model: activeModel });
        await queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
        void navigate(`/chats/${created.id}`);
      } catch (error) {
        setSendError(toErrorMessage(error));
        return false;
      }
    }

    return send({ chatId: targetId, content, model: activeModel });
  };

  const errorMessage =
    sendError ??
    (pending?.status === 'error' ? pending.errorMessage : null) ??
    (chat.isError ? toErrorMessage(chat.error) : null);
  const showEmpty =
    !chatId && !isBusy && messages.length === 0 && !chat.isPending;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h1 className="truncate text-sm font-medium text-fg">
          {chat.data?.pages[0]?.title ?? 'New chat'}
        </h1>
        <ModelSelector
          models={modelList}
          value={activeModel}
          disabled={isBusy}
          onChange={(model) => setOverride({ scope, model })}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {chatId && chat.isPending ? (
            <p
              role="status"
              className="flex-1 px-4 py-8 text-center text-fg-muted"
            >
              Loading conversation…
            </p>
          ) : showEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
              <h2 className="text-2xl font-semibold text-fg">
                How can I help today?
              </h2>
              <p className="mt-2 max-w-md text-sm text-fg-muted">
                {models.isError
                  ? 'Models could not be loaded. Check that the API and Ollama are running.'
                  : modelList.length === 0 && !models.isPending
                    ? 'No allowed models are installed in Ollama yet.'
                    : 'Ask anything. Your conversation streams from a local model.'}
              </p>
            </div>
          ) : (
            <MessageList
              messages={messages}
              pending={chatPending}
              hasOlder={Boolean(chat.hasNextPage)}
              isLoadingOlder={chat.isFetchingNextPage}
              onLoadOlder={() => void chat.fetchNextPage()}
              scroll={scroll}
            />
          )}

          {errorMessage ? (
            <div className="px-4">
              <div
                role="alert"
                className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                <span>{errorMessage}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setSendError(null);
                    dismissError();
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <Composer
            draftKey={`draft:${scope}`}
            isBusy={isBusy}
            disabled={!activeModel}
            onSend={handleSend}
            onStop={cancel}
          />
        </div>

        {showNavigator ? (
          <div className="hidden w-64 shrink-0 border-l border-border xl:block">
            <PromptNavigator
              prompts={prompts}
              activeId={scroll.activePromptId}
              onSelect={scroll.scrollToPrompt}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat`
Expected: PASS (includes the 3 navigator page tests, 3 navigator unit tests, helper test).

- [ ] **Step 6: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): add prompt navigator for long chats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 2 — Interaction friction

### Task 6: Auto-growing composer

**Files:**

- Rewrite: `apps/web/src/features/chat/composer.tsx`
- Modify: `apps/web/src/features/chat/chat.types.ts`
- Test: `apps/web/src/features/chat/composer.test.tsx`

**Interfaces:**

- Consumes: `SendIcon`, `StopIcon` (Task 1).
- Produces: `ComposerInsertion = { id: number; text: string }`; `ComposerProps` gains optional `insertion?: ComposerInsertion | null` — each new `id` replaces the draft with `text` and focuses the field. Buttons keep accessible names `Send` and `Stop`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('Composer', …)` block of `apps/web/src/features/chat/composer.test.tsx` (add `fireEvent` to the `@testing-library/react` import):

```tsx
it('shows a character counter only near the limit', () => {
  render(
    <Composer
      draftKey="d"
      isBusy={false}
      disabled={false}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />,
  );
  const input = screen.getByLabelText('Message');
  fireEvent.change(input, { target: { value: 'x'.repeat(10_800) } });
  expect(screen.queryByText(/\/ 12000/)).toBeNull();
  fireEvent.change(input, { target: { value: 'x'.repeat(10_801) } });
  expect(screen.getByText('10801 / 12000')).toBeInTheDocument();
});

it('describes the keyboard shortcuts', () => {
  render(
    <Composer
      draftKey="d"
      isBusy={false}
      disabled={false}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Message')).toHaveAccessibleDescription(
    'Enter to send · Shift+Enter for a new line',
  );
});

it('grows with its content', () => {
  render(
    <Composer
      draftKey="d"
      isBusy={false}
      disabled={false}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />,
  );
  const input = screen.getByLabelText<HTMLTextAreaElement>('Message');
  Object.defineProperty(input, 'scrollHeight', {
    configurable: true,
    value: 120,
  });
  fireEvent.change(input, { target: { value: 'a\nb\nc\nd' } });
  expect(input.style.height).toBe('120px');
});

it('applies inserted text and focuses the field', () => {
  const { rerender } = render(
    <Composer
      draftKey="d"
      isBusy={false}
      disabled={false}
      insertion={null}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />,
  );
  rerender(
    <Composer
      draftKey="d"
      isBusy={false}
      disabled={false}
      insertion={{ id: 1, text: 'Explain SSE' }}
      onSend={vi.fn()}
      onStop={vi.fn()}
    />,
  );
  const input = screen.getByLabelText('Message');
  expect(input).toHaveValue('Explain SSE');
  expect(input).toHaveFocus();
  expect(localStorage.getItem('d')).toBe('Explain SSE');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/composer.test.tsx`
Expected: FAIL — no counter, no description, no auto height, `insertion` ignored (and a TS error on the unknown prop).

- [ ] **Step 3: Update types**

In `apps/web/src/features/chat/chat.types.ts` replace `ComposerProps` with:

```ts
export interface ComposerInsertion {
  id: number;
  text: string;
}

export interface ComposerProps {
  draftKey: string;
  isBusy: boolean;
  disabled: boolean;
  insertion?: ComposerInsertion | null;
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
}
```

- [ ] **Step 4: Rewrite `apps/web/src/features/chat/composer.tsx`**

```tsx
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { SendIcon, StopIcon } from '../../components/icons';
import type { ComposerProps } from './chat.types';

const MAX_CHARS = 12_000;
const COUNTER_THRESHOLD = MAX_CHARS * 0.9;

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft({ key, value }: { key: string; value: string }): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Draft persistence is a convenience; ignore storage failures.
  }
}

export function Composer({
  draftKey,
  isBusy,
  disabled,
  insertion = null,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState(() => readDraft(draftKey));
  const [loadedKey, setLoadedKey] = useState(draftKey);
  const [appliedInsertionId, setAppliedInsertionId] = useState<number | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  // A rejected send restores its text; if the draft key changes afterwards
  // (new chat navigation committing late), carry that text to the new key.
  const [restored, setRestored] = useState<string | null>(null);
  const trimmed = text.trim();
  const insertionId = insertion?.id ?? null;

  if (loadedKey !== draftKey) {
    setRestored(null);
    setLoadedKey(draftKey);
    if (restored === null) {
      setText(readDraft(draftKey));
    } else {
      setText(restored);
      writeDraft({ key: draftKey, value: restored });
    }
  }

  if (insertion && insertion.id !== appliedInsertionId) {
    setAppliedInsertionId(insertion.id);
    setRestored(null);
    setText(insertion.text);
    writeDraft({ key: draftKey, value: insertion.text });
  }

  useEffect(() => {
    if (insertionId !== null) textareaRef.current?.focus();
  }, [insertionId]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [text]);

  const update = (value: string) => {
    setRestored(null);
    setText(value);
    writeDraft({ key: draftKey, value });
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || isBusy || disabled) return;
    const content = trimmed;
    update('');
    const accepted = await onSend(content);
    if (!accepted) {
      update(content);
      setRestored(content);
    }
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="shrink-0 px-4 pt-2 pb-3"
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface py-2 pr-2 pl-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <label htmlFor="composer-input" className="sr-only">
            Message
          </label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            value={text}
            rows={1}
            maxLength={MAX_CHARS}
            disabled={disabled}
            aria-describedby={hintId}
            placeholder="Message the model…"
            onChange={(event) => update(event.target.value)}
            onKeyDown={onKeyDown}
            className="max-h-52 min-h-8 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[15px] leading-6 text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-60"
          />
          {isBusy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={onStop}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg hover:opacity-90"
            >
              <StopIcon className="size-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={disabled || !trimmed}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              <SendIcon className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-fg-subtle">
          <p id={hintId}>Enter to send · Shift+Enter for a new line</p>
          {text.length > COUNTER_THRESHOLD ? (
            <p aria-live="polite">
              {text.length} / {MAX_CHARS}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/composer.test.tsx src/features/chat/chat-page.test.tsx`
Expected: PASS (7 composer tests; chat-page still finds `Send`/`Stop` by name).

- [ ] **Step 6: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): auto-growing composer with inline actions and counter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Chat actions menu, confirm dialog, and sidebar restyle

**Files:**

- Create: `apps/web/src/components/menu.tsx`, `apps/web/src/components/confirm-dialog.tsx`
- Modify: `apps/web/src/components/components.types.ts`
- Rewrite: `apps/web/src/features/chat/chat-sidebar.tsx`
- Test: `apps/web/src/components/confirm-dialog.test.tsx`, `apps/web/src/features/chat/chat-sidebar.test.tsx`

**Interfaces:**

- Consumes: icons (Task 1); dialog mocks (Task 3).
- Produces:
  - `Menu({ label: string; items: MenuItem[]; triggerClassName?: string })`, `MenuItem = { label: string; onSelect(): void; icon?: ReactNode; tone?: 'default' | 'danger' }`. Trigger is a ⋯ button named `label`. Selecting an item returns focus to the trigger, then calls `onSelect`. Escape closes and refocuses the trigger; ArrowUp/ArrowDown move between items; outside pointer-down closes.
  - `ConfirmDialog({ title: string; description: string; confirmLabel: string; onConfirm(): void; onCancel(): void })` — mount it to open; Escape (native `cancel` event) calls `onCancel`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/confirm-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete chat?"
      description="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('opens as a labelled modal with focus on Cancel', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Delete chat?' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('treats Escape (native cancel event) as cancel', () => {
    const { onCancel } = renderDialog();
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

`apps/web/src/features/chat/chat-sidebar.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChat } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { ChatSidebar } from './chat-sidebar';

const api = vi.hoisted(() => ({
  listChats: vi.fn(),
  updateChat: vi.fn(),
  deleteChat: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutAll: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderSidebar() {
  return renderWithProviders({
    route: '/chats/c1',
    ui: (
      <ChatSidebar
        user={null}
        activeChatId="c1"
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
        onSignUp={vi.fn()}
      />
    ),
  });
}

async function openActions() {
  const user = userEvent.setup();
  await screen.findByRole('link', { name: 'First chat' });
  const trigger = screen.getByRole('button', {
    name: 'Actions for First chat',
  });
  await user.click(trigger);
  return { user, trigger };
}

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue({ chats: [makeChat()], nextCursor: null });
    api.updateChat.mockResolvedValue(makeChat({ title: 'Renamed' }));
    api.deleteChat.mockResolvedValue(undefined);
  });

  it('opens an actions menu with keyboard support', async () => {
    const { user, trigger } = await openActions();
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    expect(rename).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('renames a chat from the menu', async () => {
    const { user } = await openActions();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Chat title');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    await waitFor(() =>
      expect(api.updateChat).toHaveBeenCalledWith('c1', { title: 'Renamed' }),
    );
  });

  it('asks for confirmation before deleting', async () => {
    const { user } = await openActions();
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete chat?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.deleteChat).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Actions for First chat' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete chat?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteChat).toHaveBeenCalledWith('c1'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components/confirm-dialog.test.tsx src/features/chat/chat-sidebar.test.tsx`
Expected: FAIL — `./confirm-dialog` missing; no `Actions for First chat` button.

- [ ] **Step 3: Add shared component types**

Append to `apps/web/src/components/components.types.ts` (and change its first line to `import type { ReactNode, SVGProps } from 'react';`):

```ts
export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
}

export interface MenuProps {
  label: string;
  items: MenuItem[];
  triggerClassName?: string;
}

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

- [ ] **Step 4: Implement `Menu`**

`apps/web/src/components/menu.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MenuProps } from './components.types';
import { MoreIcon } from './icons';

export function Menu({ label, items, triggerClassName = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menuItems = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = menuItems.findIndex(
      (item) => item === document.activeElement,
    );
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      menuItems[(index + 1) % menuItems.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        <MoreIcon className="size-4" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-1 min-w-36 rounded-lg border border-border bg-bg p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                closeAndRefocus();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                item.tone === 'danger'
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-fg hover:bg-surface-2'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Implement `ConfirmDialog`**

`apps/web/src/components/confirm-dialog.tsx`:

```tsx
import { useEffect, useId, useRef } from 'react';
import type { ConfirmDialogProps } from './components.types';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Closing restores focus to the element that was focused before opening.
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-full max-w-sm rounded-2xl border border-border bg-bg p-6 text-fg shadow-2xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm text-fg-muted">
        {description}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-bg hover:opacity-90"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 6: Rewrite `apps/web/src/features/chat/chat-sidebar.tsx`**

```tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { Menu } from '../../components/menu';
import { api, toErrorMessage } from '../../lib/api';
import { useAuthActions } from '../auth/use-auth';
import { groupChatsByRecency } from './chat.helpers';
import type {
  ChatGroupsProps,
  ChatListItemProps,
  ChatSidebarProps,
} from './chat.types';

const secondaryButton =
  'rounded-lg border border-border px-3 py-1.5 text-fg hover:bg-surface-2';

function ChatListItem({ chat, active, onNavigate }: ChatListItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const rename = useMutation({
    mutationFn: (next: string) => api.updateChat(chat.id, { title: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChat(chat.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      queryClient.removeQueries({ queryKey: ['chats', 'detail', chat.id] });
      if (active) void navigate('/chats');
    },
  });

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    const next = title.trim();
    if (next && next !== chat.title) rename.mutate(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <li>
        <form onSubmit={submitRename} className="px-1 py-0.5">
          <label className="sr-only" htmlFor={`rename-${chat.id}`}>
            Chat title
          </label>
          <input
            id={`rename-${chat.id}`}
            autoFocus
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
            className="w-full rounded-md border border-accent bg-bg px-2 py-1.5 text-sm text-fg"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        to={`/chats/${chat.id}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`block truncate rounded-lg py-2 pr-10 pl-3 text-sm ${
          active
            ? 'bg-surface-2 font-medium text-fg'
            : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
        }`}
      >
        {chat.title}
      </Link>
      <div className="absolute inset-y-0 right-1 flex items-center can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100">
        <Menu
          label={`Actions for ${chat.title}`}
          triggerClassName="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-bg hover:text-fg"
          items={[
            {
              label: 'Rename',
              icon: <PencilIcon className="size-4" />,
              onSelect: () => {
                setTitle(chat.title);
                setEditing(true);
              },
            },
            {
              label: 'Delete',
              icon: <TrashIcon className="size-4" />,
              tone: 'danger',
              onSelect: () => setConfirming(true),
            },
          ]}
        />
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete chat?"
          description={`"${chat.title}" and all of its messages will be permanently deleted.`}
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            remove.mutate();
          }}
        />
      ) : null}
    </li>
  );
}

function ChatGroups({ activeChatId, onNavigate }: ChatGroupsProps) {
  const chats = useInfiniteQuery({
    queryKey: ['chats', 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listChats({ cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  if (chats.isPending) {
    return (
      <p role="status" className="px-3 py-2 text-sm text-fg-subtle">
        Loading chats…
      </p>
    );
  }
  if (chats.isError) {
    return (
      <p role="alert" className="px-3 py-2 text-sm text-danger">
        {toErrorMessage(chats.error)}
      </p>
    );
  }

  const groups = groupChatsByRecency({
    chats: chats.data.pages.flatMap((page) => page.chats),
    now: new Date(),
  });

  if (groups.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-fg-subtle">
        No chats yet. Start a new one!
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="mb-4">
          <h2 className="px-3 py-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
            {group.label}
          </h2>
          <ul className="space-y-0.5">
            {group.chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      ))}
      {chats.hasNextPage ? (
        <button
          type="button"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
          className="mx-3 mb-3 text-sm text-accent hover:underline disabled:opacity-60"
        >
          {chats.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}

export function ChatSidebar({
  user,
  activeChatId,
  onNavigate,
  onSignIn,
  onSignUp,
}: ChatSidebarProps) {
  const { signOut } = useAuthActions();

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Link
          to="/chats"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"
        >
          <PlusIcon className="size-4" />
          New chat
        </Link>
      </div>
      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-2">
        <ChatGroups activeChatId={activeChatId} onNavigate={onNavigate} />
      </nav>
      <div className="space-y-3 border-t border-border p-3 text-sm">
        {user ? (
          <div className="space-y-2">
            <p className="truncate font-medium text-fg">
              {user.displayName ?? user.email}
            </p>
            <div className="flex gap-2">
              <Link
                to="/account"
                onClick={onNavigate}
                className={secondaryButton}
              >
                Account
              </Link>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
                className={secondaryButton}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-fg-muted">
              Chatting anonymously. Sign in to keep chats across devices.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:bg-accent-hover"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onSignUp}
                className={secondaryButton}
              >
                Sign up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/components src/features/chat/chat-sidebar.test.tsx`
Expected: PASS (3 dialog + 3 sidebar tests).

- [ ] **Step 8: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): chat actions menu with confirm dialog and restyled sidebar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Safe storage helper and collapsible sidebar

**Files:**

- Create: `apps/web/src/lib/storage.ts`
- Rewrite: `apps/web/src/features/chat/chat-shell.tsx`
- Modify: `apps/web/src/features/chat/chat-sidebar.tsx`, `chat.types.ts`, `chat-sidebar.test.tsx`
- Test: `apps/web/src/lib/storage.test.ts`, `apps/web/src/features/chat/chat-shell.test.tsx`

**Interfaces:**

- Consumes: `MenuIcon`, `PanelLeftIcon` (Task 1).
- Produces: `readStorage(key: string): string | null`; `writeStorage({ key, value }: { key: string; value: string | null }): void` (`null` removes). `SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed'`. `ChatSidebarProps` gains `onCollapse: () => void`. Buttons: `Hide sidebar` (desktop, in sidebar), `Show sidebar` (desktop, in shell header when collapsed), `Toggle chat history` (mobile).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/storage.test.ts`:

```ts
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
```

`apps/web/src/features/chat/chat-shell.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChatShell } from './chat-shell';

const api = vi.hoisted(() => ({
  getReadiness: vi.fn(),
  getMe: vi.fn(),
  refresh: vi.fn(),
  listChats: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutAll: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderShell() {
  return renderWithProviders({
    route: '/chats',
    ui: (
      <Routes>
        <Route element={<ChatShell />}>
          <Route path="/chats" element={<p>Chat outlet</p>} />
        </Route>
      </Routes>
    ),
  });
}

describe('ChatShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getReadiness.mockResolvedValue({
      status: 'ready',
      checks: { database: 'up', redis: 'up', ollama: 'up' },
    });
    api.getMe.mockResolvedValue({ user: null });
    api.listChats.mockResolvedValue({ chats: [], nextCursor: null });
  });

  it('collapses the desktop sidebar and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(sidebar).not.toHaveClass('md:hidden');

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(sidebar).toHaveClass('md:hidden');
    expect(localStorage.getItem('sidebar:collapsed')).toBe('true');
    unmount();

    renderShell();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass(
      'md:hidden',
    );
    await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(
      screen.getByRole('complementary', { name: 'Sidebar' }),
    ).not.toHaveClass('md:hidden');
    expect(localStorage.getItem('sidebar:collapsed')).toBeNull();
  });

  it('opens the mobile drawer', async () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Toggle chat history' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass(
      'fixed',
    );
  });
});
```

In `apps/web/src/features/chat/chat-sidebar.test.tsx`, add `onCollapse={vi.fn()}` to the `<ChatSidebar …/>` props in `renderSidebar`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/lib/storage.test.ts src/features/chat/chat-shell.test.tsx`
Expected: FAIL — `./storage` missing; no `Hide sidebar` button.

- [ ] **Step 3: Implement storage helper**

`apps/web/src/lib/storage.ts`:

```ts
// localStorage can throw (private mode, blocked site data); every caller
// treats storage as a best-effort convenience.
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage({
  key,
  value,
}: {
  key: string;
  value: string | null;
}): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is optional.
  }
}
```

- [ ] **Step 4: Add the collapse button to the sidebar**

In `apps/web/src/features/chat/chat.types.ts`, add to `ChatSidebarProps`:

```ts
  onCollapse: () => void;
```

In `apps/web/src/features/chat/chat-sidebar.tsx`:

- Extend the icon import: `import { PanelLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/icons';`
- Add `onCollapse` to the destructured `ChatSidebar` props.
- Replace the top `<div className="p-3">…</div>` block with:

```tsx
<div className="flex items-center gap-2 p-3">
  <Link
    to="/chats"
    onClick={onNavigate}
    className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"
  >
    <PlusIcon className="size-4" />
    New chat
  </Link>
  <button
    type="button"
    aria-label="Hide sidebar"
    onClick={onCollapse}
    className="hidden size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg md:grid"
  >
    <PanelLeftIcon className="size-4" />
  </button>
</div>
```

- [ ] **Step 5: Rewrite `apps/web/src/features/chat/chat-shell.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useMatch } from 'react-router-dom';
import { MenuIcon, PanelLeftIcon } from '../../components/icons';
import { api } from '../../lib/api';
import { readStorage, writeStorage } from '../../lib/storage';
import { AuthDialog } from '../auth/auth-dialog';
import type { AuthMode } from '../auth/auth.types';
import { useAuthUser } from '../auth/use-auth';
import { ChatSidebar } from './chat-sidebar';
import { ReadinessBanner } from './readiness-banner';

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';

const iconButton =
  'grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg';

export function ChatShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [dialogMode, setDialogMode] = useState<AuthMode | null>(null);
  const user = useAuthUser();
  const match = useMatch('/chats/:chatId');
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: api.getReadiness,
    refetchInterval: 30_000,
  });

  const setCollapsedAndRemember = (next: boolean) => {
    setCollapsed(next);
    writeStorage({ key: SIDEBAR_COLLAPSED_KEY, value: next ? 'true' : null });
  };

  return (
    <div className="flex h-screen bg-bg text-fg">
      <aside
        id="chat-sidebar"
        aria-label="Sidebar"
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } w-72 shrink-0 flex-col border-r border-border bg-surface ${
          collapsed ? 'md:hidden' : 'md:static md:flex'
        }`}
      >
        <ChatSidebar
          user={user.data ?? null}
          activeChatId={match?.params.chatId}
          onNavigate={() => setSidebarOpen(false)}
          onSignIn={() => setDialogMode('sign-in')}
          onSignUp={() => setDialogMode('sign-up')}
          onCollapse={() => setCollapsedAndRemember(true)}
        />
      </aside>
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex items-center gap-2 border-b border-border px-2 py-1.5 ${
            collapsed ? '' : 'md:hidden'
          }`}
        >
          <button
            type="button"
            aria-label="Toggle chat history"
            aria-expanded={sidebarOpen}
            aria-controls="chat-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
            className={`${iconButton} md:hidden`}
          >
            <MenuIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Show sidebar"
            onClick={() => setCollapsedAndRemember(false)}
            className={`${iconButton} hidden md:grid`}
          >
            <PanelLeftIcon className="size-4" />
          </button>
          <span className="text-sm font-semibold text-fg">Local LLM Chat</span>
        </header>
        {readiness.data ? <ReadinessBanner readiness={readiness.data} /> : null}
        {readiness.isError ? (
          <div
            role="alert"
            className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger"
          >
            The API is unreachable. Confirm the backend is running.
          </div>
        ) : null}
        <Outlet />
      </div>

      {dialogMode ? (
        <AuthDialog
          initialMode={dialogMode}
          onClose={() => setDialogMode(null)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/lib src/features/chat`
Expected: PASS.

- [ ] **Step 7: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): collapsible desktop sidebar with remembered state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Empty state with example prompts

**Files:**

- Modify: `apps/web/src/features/chat/chat-page.tsx`
- Test: `apps/web/src/features/chat/chat-page.test.tsx`

**Interfaces:**

- Consumes: `ComposerInsertion`, `Composer.insertion` (Task 6).
- Produces: `EXAMPLE_PROMPTS` (module constant in chat-page). Clicking an example fills the composer and focuses it; it never sends.

- [ ] **Step 1: Write the failing test**

Append inside `describe('ChatPage', …)` in `apps/web/src/features/chat/chat-page.test.tsx`:

```tsx
it('fills the composer from an example prompt without sending', async () => {
  renderPage();
  const user = userEvent.setup();
  await screen.findByRole('option', { name: /qwen2.5:1.5b/ });

  await user.click(
    screen.getByRole('button', {
      name: 'Explain how Server-Sent Events work in simple terms',
    }),
  );

  const input = screen.getByLabelText('Message');
  expect(input).toHaveValue(
    'Explain how Server-Sent Events work in simple terms',
  );
  expect(input).toHaveFocus();
  expect(api.createChat).not.toHaveBeenCalled();
  expect(api.streamMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/chat-page.test.tsx`
Expected: FAIL — no example button.

- [ ] **Step 3: Implement**

In `apps/web/src/features/chat/chat-page.tsx`:

Add the type import:

```ts
import type { ComposerInsertion } from './chat.types';
```

Below the `ModelOverride` interface add:

```ts
const EXAMPLE_PROMPTS = [
  'Explain how Server-Sent Events work in simple terms',
  'Write a TypeScript function that debounces another function',
  'Compare PostgreSQL and SQLite for a small web app',
  'Suggest three ideas for a weekend side project',
];
```

Inside `ChatPage`, after the `sendError` state:

```ts
const [insertion, setInsertion] = useState<ComposerInsertion | null>(null);
```

Replace the empty-state `<div className="flex flex-1 flex-col items-center justify-center …">…</div>` with:

```tsx
<div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
  <h2 className="text-2xl font-semibold text-fg">How can I help today?</h2>
  <p className="mt-2 max-w-md text-sm text-fg-muted">
    {models.isError
      ? 'Models could not be loaded. Check that the API and Ollama are running.'
      : modelList.length === 0 && !models.isPending
        ? 'No allowed models are installed in Ollama yet.'
        : 'Ask anything. Your conversation streams from a local model.'}
  </p>
  <ul className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
    {EXAMPLE_PROMPTS.map((example) => (
      <li key={example}>
        <button
          type="button"
          onClick={() =>
            setInsertion((current) => ({
              id: (current?.id ?? 0) + 1,
              text: example,
            }))
          }
          className="h-full w-full rounded-xl border border-border px-4 py-3 text-left text-sm text-fg-muted hover:bg-surface hover:text-fg"
        >
          {example}
        </button>
      </li>
    ))}
  </ul>
</div>
```

Pass the insertion to the composer:

```tsx
<Composer
  draftKey={`draft:${scope}`}
  isBusy={isBusy}
  disabled={!activeModel}
  insertion={insertion}
  onSend={handleSend}
  onStop={cancel}
/>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/features/chat/chat-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "feat(web): example prompts in the new-chat empty state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3 — Polish

### Task 10: Light/dark/system theme toggle

**Files:**

- Create: `apps/web/src/lib/theme.ts`
- Create: `apps/web/src/features/chat/theme-toggle.tsx`
- Modify: `apps/web/src/features/chat/chat-sidebar.tsx`
- Modify: `apps/web/index.html`
- Test: `apps/web/src/lib/theme.test.ts`, `apps/web/src/features/chat/theme-toggle.test.tsx`

**Interfaces:**

- Consumes: `readStorage`, `writeStorage` (Task 8); `SunIcon`, `MoonIcon`, `MonitorIcon` (Task 1).
- Produces: `ThemePreference = 'system' | 'light' | 'dark'`; `THEME_STORAGE_KEY = 'theme'`; `readThemePreference(): ThemePreference`; `applyThemePreference(preference: ThemePreference): void` (sets/removes `data-theme` on `<html>` and persists). `ThemeToggle()` renders `role="group"` named `Theme` with `aria-pressed` buttons `System`, `Light`, `Dark`. System mode needs no JS listener: with no `data-theme`, CSS `color-scheme: light dark` + `light-dark()` follow the OS.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/theme.test.ts`:

```ts
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
```

`apps/web/src/features/chat/theme-toggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('reflects the stored preference and switches themes', async () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/lib/theme.test.ts src/features/chat/theme-toggle.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `lib/theme.ts`**

```ts
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
```

- [ ] **Step 4: Implement `ThemeToggle`**

`apps/web/src/features/chat/theme-toggle.tsx`:

```tsx
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
```

- [ ] **Step 5: Mount the toggle and the pre-paint script**

In `apps/web/src/features/chat/chat-sidebar.tsx`, add `import { ThemeToggle } from './theme-toggle';` and, as the last child of the footer `<div className="space-y-3 border-t border-border p-3 text-sm">`, add:

```tsx
<div className="flex items-center justify-between">
  <span className="text-xs text-fg-subtle">Theme</span>
  <ThemeToggle />
</div>
```

In `apps/web/index.html`, change `<html lang="en" data-theme="dark">` to `<html lang="en">` and insert as the first child of `<head>`:

```html
<script>
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    }
  } catch (error) {}
</script>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @js-rag-stack/web exec vitest run src/lib src/features/chat`
Expected: PASS.

- [ ] **Step 7: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test && pnpm --filter @js-rag-stack/web build`
Expected: all pass.

```bash
git add apps/web/index.html apps/web/src
git commit -m "feat(web): system, light, and dark theme toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Restyle remaining screens with tokens

**Files:**

- Modify: `apps/web/src/features/chat/model-selector.tsx`, `apps/web/src/features/chat/readiness-banner.tsx`, `apps/web/src/features/auth/auth-dialog.tsx`, `apps/web/src/features/auth/account-page.tsx`

**Interfaces:**

- Consumes: tokens (Task 1). No API changes; existing tests (`model-selector.test.tsx`, `auth-dialog.test.tsx`) must keep passing unchanged.

- [ ] **Step 1: Confirm the leftovers**

Run: `grep -rnE "(slate|cyan|rose|amber|emerald)-[0-9]" apps/web/src`
Expected: matches only in the four files above.

- [ ] **Step 2: Restyle `model-selector.tsx`**

Replace the two returns with:

```tsx
if (models.length === 0) {
  return (
    <p
      role="status"
      className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
    >
      No models available
    </p>
  );
}

return (
  <div className="flex items-center gap-2">
    <label htmlFor={id} className="sr-only">
      Model
    </label>
    <select
      id={id}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg hover:bg-surface focus:border-accent disabled:opacity-60"
    >
      {models.map((model) => (
        <option key={model.name} value={model.name}>
          {model.name}
          {model.default ? ' (default)' : ''}
        </option>
      ))}
    </select>
  </div>
);
```

- [ ] **Step 3: Restyle `readiness-banner.tsx`**

Change the banner `className` to:

```tsx
className =
  'border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning';
```

- [ ] **Step 4: Restyle `auth-dialog.tsx`**

Make these exact replacements:

| Find                                                                           | Replace                                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const fieldClass =` value                                                     | `'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-2 focus:outline-accent'` |
| `bg-slate-950/80`                                                              | `bg-black/50`                                                                                                                                                  |
| `border-slate-800 bg-slate-900 p-6`                                            | `border-border bg-bg p-6`                                                                                                                                      |
| `text-lg font-semibold text-slate-100`                                         | `text-lg font-semibold text-fg`                                                                                                                                |
| `mt-1 text-sm text-slate-400`                                                  | `mt-1 text-sm text-fg-muted`                                                                                                                                   |
| `space-y-1 text-sm text-slate-300` (all 3)                                     | `space-y-1 text-sm text-fg-muted`                                                                                                                              |
| `text-sm text-rose-300`                                                        | `text-sm text-danger`                                                                                                                                          |
| `text-sm text-cyan-300 underline-offset-4`                                     | `text-sm text-accent underline-offset-4`                                                                                                                       |
| `bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300` | `bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover`                                                                               |

- [ ] **Step 5: Restyle `account-page.tsx`**

Make these exact replacements (use replace-all where noted):

| Find                                                                        | Replace                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `text-sm text-cyan-300 hover:underline`                                     | `text-sm text-accent hover:underline`                                   |
| `text-2xl font-semibold text-slate-100`                                     | `text-2xl font-semibold text-fg`                                        |
| `text-slate-400` (all)                                                      | `text-fg-muted`                                                         |
| `text-slate-300` (all)                                                      | `text-fg-muted`                                                         |
| `text-slate-200` (all, except the Revoke button handled below)              | `text-fg`                                                               |
| `text-slate-500`                                                            | `text-fg-subtle`                                                        |
| `border-rose-500/50 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10` | `border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger-soft` |
| `text-rose-300` (remaining, all)                                            | `text-danger`                                                           |
| `divide-slate-800 rounded-xl border border-slate-800`                       | `divide-border rounded-xl border border-border`                         |
| `bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300`                    | `bg-success-soft px-2 py-0.5 text-xs text-success`                      |
| `border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800`    | `border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-2`          |

Do the Revoke-button row first so the generic `text-slate-200` replacement doesn't break its match.

- [ ] **Step 6: Verify no raw palette classes remain**

Run: `grep -rnE "(slate|cyan|rose|amber|emerald)-[0-9]" apps/web/src`
Expected: no output (exit code 1).

- [ ] **Step 7: Full web checks and commit**

Run: `pnpm exec prettier --write apps/web && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: all pass.

```bash
git add apps/web/src
git commit -m "style(web): move auth, account, model selector, and banners to tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Final verification

**Files:** none (fix anything that fails, in the owning file).

- [ ] **Step 1: Run the full root quality gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all succeed. (API tests need local Postgres/Redis as in CI; if they are not running, run `pnpm --filter @js-rag-stack/web test` and report that API tests were not run.)

- [ ] **Step 2: Confirm shiki is lazily loaded**

Run: `ls -S apps/web/dist/assets | head -5` and `grep -l "codeToHtml" apps/web/dist/assets/index-*.js || echo "shiki not in entry chunk"`
Expected: `shiki not in entry chunk`.

- [ ] **Step 3: Manual browser checklist** (`pnpm dev`, open http://localhost:5173)

- Light, dark, and system themes all readable; reload keeps the choice with no flash.
- A reply containing a table, list, and fenced code renders; code highlights after streaming ends; Copy shows "Copied".
- Scroll up during a long stream: the view stays put and "Jump to latest" appears; clicking it follows the stream again.
- A chat with ≥ 3 prompts that overflows shows the navigator at ≥ 1280px; hidden when narrower; clicking an entry scrolls and highlights it; highlight follows manual scrolling.
- "Load earlier messages" keeps the reading position.
- Composer grows to ~8 lines then scrolls; counter appears near 10,800 chars.
- Chat ⋯ menu: rename, delete with confirm; menu always visible on a touch device / devtools touch emulation.
- Sidebar collapse persists across reloads; mobile drawer still works.
- With OS "reduce motion" on, scrolling is instant and animations are static.

- [ ] **Step 4: Report**

Summarize results to the user, including anything skipped. Do **not** push; the user will review the `redesign` branch and decide.
