# Web UI/UX Redesign — Design Spec

Date: 2026-09-30
Scope: `apps/web` only. No API or contract changes.

## 1. Goals

Improve the chat SPA across four areas, delivered in phases:

1. **Readability** — assistant replies render as markdown with highlighted code; conversation layout reads well; scrolling never fights the user.
2. **Prompt navigator** — a right-hand list of the user's prompts in the current chat; clicking one scrolls to it.
3. **Interaction friction** — composer, chat management, touch support, empty/loading states.
4. **Visual polish** — calm, minimal style (ChatGPT/Claude.ai-like), light + dark themes with a toggle, consistent icons and typography.

### Success criteria

- Markdown (GFM: tables, lists, task lists, code) renders correctly in assistant replies, including mid-stream.
- The prompt navigator appears only when **all** hold: viewport ≥ `xl` (1280px), transcript content overflows its scroll container, and the chat has ≥ 3 user prompts. Clicking an entry scrolls that prompt into view and highlights it.
- Streaming never yanks the viewport when the user has scrolled up.
- Light, dark, and system themes work with no flash of wrong theme on load.
- All controls are keyboard-accessible with visible focus; reduced motion is respected.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass.

### Non-goals

- No backend, OpenAPI, or data-model changes.
- No UI component library (PLAN.md constraint). Rendering libraries (`react-markdown`, `remark-gfm`, `shiki`) are allowed — approved by the user.
- No navigator on viewports narrower than `xl`.
- Prompts in not-yet-loaded older pages are not listed until loaded.

## 2. Decisions (user-approved)

| Topic                       | Decision                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Scope                       | All areas, phased                                                                                       |
| Navigator on narrow screens | Hidden below `xl`                                                                                       |
| Markdown                    | `react-markdown` + `remark-gfm` + `shiki` (lazy-loaded), copy button on code blocks                     |
| Theme                       | System / Light / Dark toggle, persisted in `localStorage`                                               |
| Visual direction            | Calm minimal: neutral grays, one restrained accent, prose-style assistant replies, compact user bubbles |
| Navigator tracking          | `IntersectionObserver` + `ResizeObserver`                                                               |
| Icons                       | Inline SVG components, no icon library                                                                  |

## 3. Components

New units (paths relative to `apps/web/src`):

| Unit                                   | Responsibility                                                                                                                                                                                                                                                 | Depends on                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `features/chat/markdown.tsx`           | Render assistant markdown. Code blocks: language label, copy button, `shiki` highlighting loaded via dynamic `import()`; plain `<pre>` until loaded. Raw HTML disabled (react-markdown default; no `rehype-raw`).                                              | react-markdown, remark-gfm, shiki |
| `features/chat/prompt-navigator.tsx`   | Presentational list. Props: `prompts: { id: string; preview: string }[]`, `activeId: string \| null`, `onSelect(id)`. Preview is the prompt's first line, CSS-truncated with ellipsis.                                                                         | —                                 |
| `features/chat/use-scroll-tracking.ts` | Hook owning scroll behavior: registers message nodes (`registerMessage(id)` ref callback), computes `activePromptId` (IntersectionObserver), `isOverflowing` (ResizeObserver on container + content), `isAtBottom`, `scrollToMessage(id)`, `scrollToBottom()`. | browser observers                 |
| `lib/theme.ts`                         | Read/write theme preference (`system \| light \| dark`) via `lib/storage.ts`; set or remove `data-theme` on `<html>`. System mode needs no listener: CSS `light-dark()` follows the OS.                                                                        | `lib/storage.ts`                  |
| `lib/storage.ts`                       | try/catch-wrapped `localStorage` read/write shared by theme and sidebar state.                                                                                                                                                                                 | —                                 |
| `features/chat/theme-toggle.tsx`       | Three-way segmented control in the sidebar footer.                                                                                                                                                                                                             | `lib/theme.ts`                    |
| `components/icons.tsx`                 | Inline SVG icons: menu, sidebar, pencil, trash, more (⋯), copy, check, send, stop, arrow-down, sun, moon, monitor. `aria-hidden` by default.                                                                                                                   | —                                 |
| `components/confirm-dialog.tsx`        | Accessible confirm using native `<dialog>` (`showModal`) — focus trap, Escape, focus return to invoker.                                                                                                                                                        | —                                 |
| `components/menu.tsx`                  | Minimal popover menu (button + list) for the per-chat ⋯ actions; Escape/outside-click close, arrow-key navigation, focus return.                                                                                                                               | —                                 |

Changed units:

- `message-list.tsx` — new layout, uses `markdown.tsx` and `use-scroll-tracking`, message action row, jump-to-latest button, thinking indicator, streaming cursor.
- `chat-page.tsx` — two-column layout at `xl` (transcript + navigator); derives the prompt list from user messages (server + pending); wires the tracking hook between `MessageList` and `PromptNavigator`; empty state with example prompts.
- `composer.tsx` — auto-growing textarea, inline icon buttons, counter, hint text; accepts an externally inserted value (for example prompts).
- `chat-sidebar.tsx` — ⋯ menu for rename/delete, confirm dialog, icons, theme toggle in footer.
- `chat-shell.tsx` — desktop sidebar collapse (persisted), icon header button.
- `auth-dialog.tsx`, `account-page.tsx`, `model-selector.tsx`, `readiness-banner.tsx` — restyle with tokens.
- `styles.css` — design tokens, prose styles, shiki dual-theme CSS.
- `index.html` — inline pre-hydration theme script; Inter font link.

## 4. Behavior

### 4.1 Prompt navigator

- Prompt list = all loaded user messages in chronological order, plus the pending optimistic user message while streaming.
- Visible iff `viewport ≥ xl && isOverflowing && prompts.length >= 3`. Hidden via CSS below `xl`; the other two conditions are evaluated in JS.
- Rendered as `<nav aria-label="Prompts in this chat">` in a fixed-width (~240px) right column with its own scroll; sticky within the chat area.
- Active prompt: the last user message whose top has crossed the upper ~30% of the scroll container. Marked with `aria-current="true"` and an accent indicator.
- Click / Enter: smooth-scroll (instant under reduced motion) so the prompt's top sits just below the chat header, then move focus to that message's `<article>` (`tabIndex={-1}`). The clicked item is locked as active for ~600ms to avoid highlight flicker during the scroll.

### 4.2 Scrolling

- "At bottom" = within 80px of `scrollHeight`.
- During streaming, auto-follow only when at bottom. Otherwise show a floating "Jump to latest" button (arrow-down icon + label) that scrolls to bottom.
- Sending a message always scrolls to bottom.
- Loading older messages preserves the reading position (restore by `scrollHeight` delta after prepend).

### 4.3 Messages

- Assistant: full-width prose, no bubble; user: right-aligned bubble, max ~75% width.
- Streaming: markdown rendered live; an unclosed code fence renders as a code block. A blinking caret follows streamed text (static under reduced motion). Before the first token, an animated three-dot indicator with `aria-label="Assistant is thinking"`.
- Status (`Stopped`, `Response failed`, `Incomplete`) as small chips.
- Action row below each message, visible on hover/focus-within (always visible on `(hover: none)` devices): Copy (both roles), Details toggle (assistant, existing token info).

### 4.4 Composer

- Auto-grows from 1 row to ~8 rows, then scrolls internally; no resize handle.
- Send/Stop are icon buttons inside the input frame with `aria-label`s.
- Character counter shown when length > 90% of 12,000.
- Hint "Enter to send · Shift+Enter for new line" below the field in muted small text.
- Existing draft persistence and restore-on-reject behavior unchanged.

### 4.5 Sidebar & shell

- Per-chat ⋯ menu with Rename / Delete. Button visible on hover/focus on desktop, always on touch.
- Delete opens `ConfirmDialog` instead of `window.confirm`.
- Desktop collapse button hides the sidebar; state persisted in `localStorage` (try/catch). Mobile slide-over behavior unchanged except icons.
- Footer: user info / auth buttons, plus theme toggle.

### 4.6 Empty state

- Greeting plus 3–4 example prompt chips. Clicking one fills the composer (does not send) and focuses it.
- Existing model-error / no-models messages kept.

## 5. Theming & typography

- Semantic tokens exposed via Tailwind v4 `@theme inline`: `bg`, `surface`, `surface-2`, `border`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-hover`, `accent-fg`, `accent-soft`, `danger(-soft)`, `warning(-soft)`, `success(-soft)`. Components use these (`bg-surface`, `text-fg-muted`), never raw palette classes.
- Each token is a CSS `light-dark(light, dark)` value. `:root` has `color-scheme: light dark` (follows OS); `[data-theme="light"|"dark"]` pins `color-scheme`. Browser floor: Chrome 123, Safari 17.5, Firefox 120.
- Neutral gray base, indigo/violet accent. All text/background pairs meet WCAG AA in both themes.
- Inline script in `index.html` sets `data-theme` from storage before first paint.
- `shiki` dual themes (`github-light`, `github-dark`) emitted with `defaultColor: false`; CSS picks `light-dark(var(--shiki-light), var(--shiki-dark))`.
- Inter from Google Fonts, system fallback. Scoped `.prose` styles in `styles.css` for headings, lists, tables, blockquotes, inline code, links.

## 6. Accessibility

- `focus-visible` rings on all interactive elements.
- Transcript keeps `role="log"` + `aria-live="polite"`; the streaming message is `aria-busy="true"` until terminal.
- Menus and dialogs: Escape closes, focus returns to the invoker.
- All motion (smooth scroll, caret, dots, transitions) disabled under `prefers-reduced-motion`.
- Icon-only buttons always have `aria-label`.

## 7. Error handling

- `shiki` load failure: keep unhighlighted `<pre>`; no error surfaced.
- Clipboard failure: copy button shows a brief "Copy failed" state instead of "Copied".
- Storage unavailable (theme, sidebar, drafts): fall back to defaults silently.
- Observers unavailable: navigator stays hidden and auto-follow is disabled (all supported browsers have both observers).

## 8. Testing

Vitest + Testing Library, following existing test patterns in `apps/web/src`. Mock `IntersectionObserver`, `ResizeObserver`, `navigator.clipboard`, `HTMLDialogElement.showModal`, and `shiki` in test setup.

- `prompt-navigator.test.tsx` — list rendering, `onSelect`, `aria-current`.
- Chat-page / navigator integration — hidden with < 3 prompts; hidden when not overflowing; shown when both conditions hold.
- `use-scroll-tracking.test.ts` — at-bottom detection, follow vs. no-follow, active-prompt lock after select.
- `markdown.test.tsx` — code block + language label, copy writes clipboard, raw HTML not rendered, unclosed fence renders safely.
- `confirm-dialog.test.tsx` — confirm/cancel/Escape.
- `lib/theme` tests — persistence, system mode, storage failure.
- Update existing `composer`, `message-list`, `chat-page`, `model-selector`, `auth-dialog` tests for new markup; sidebar delete flow uses the dialog.
- Gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## 9. Phases

Each task is one commit; every commit leaves the app working with all checks green.

0. **Foundation** — final light/dark design tokens in `styles.css`, Inter, `components/icons.tsx`. `index.html` pins `data-theme="dark"` until the toggle lands in phase 3, so partially migrated screens stay coherent. Every later task that rewrites a file moves it fully to tokens.
1. **Readability** — markdown + code blocks, message layout, scroll tracking, jump-to-latest, prompt navigator.
2. **Friction** — auto-grow composer, ⋯ menu + confirm dialog, collapsible sidebar, empty state with examples, message action row.
3. **Polish** — theme toggle + pre-paint script, final palette/typography tuning, restyle auth dialog, account page, model selector, banners.

## 10. Dependencies

Added to `apps/web`: `react-markdown`, `remark-gfm`, `shiki`. Exact versions pinned, matching the repo's pinned-version convention.
