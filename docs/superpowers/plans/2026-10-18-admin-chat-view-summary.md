# Admin Chat View & Cached Admin Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins click a chat id in a usage log to open the chat transcript with a cached, incrementally-updated LLM summary.

**Architecture:** New `admin/chats` Nest module (repository → services → controller) reusing the pure context-window fold helpers; a new `admin_chat_summary` table pinned to `summarized_through_message_id`; cached `GET` + synchronous `POST` refresh under a Redis lock. Admin app gets a `/chats/:chatId` page whose summary card drives refresh/polling via react-query.

**Tech Stack:** NestJS 11, Prisma 7.8 / PostgreSQL, Redis, Ollama; React 19, react-router 7, @tanstack/react-query, Tailwind 4, Jest, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-18-admin-chat-view-summary-design.md`

## Global Constraints

- Summarizer model: current default model (`model.is_default`) at generation time.
- Usage: `UsageKind.ADMIN_SUMMARY` (wire `'admin_summary'`), `chat_id` set, `user_id` and `anonymous_session_id` both `NULL`.
- Lock key `admin-chat-summary-lock:{chatId}`, TTL `REDIS_LOCK_TTL_MS`; held → `409 SUMMARY_IN_PROGRESS` "A summary for this chat is already being generated."
- Degenerate result → `502 SUMMARY_FAILED` "The model returned an empty summary."; stored summary untouched on any failure.
- `maxTokens = min(budget.summaryMaxTokens, 400)`; context settings are the same `CHAT_CONTEXT_*` env values as the context window.
- Request disconnect never aborts generation; the only signal is `AbortSignal.timeout(config.get('OLLAMA_TOTAL_TIMEOUT_MS'))`, created once per `refreshSummary` call.
- Admin code imports only **pure** helpers from `chats/`; never chats services/repositories.
- Client polls `GET` every `2000` ms while `generating`.
- Backend layering: controllers map HTTP ⇄ DTOs, services hold rules, repositories are the only Prisma callers.
- Final gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check`.

## Review Focus

1. User keeps chatting while a refresh runs → result saved with through-id of the last _included_ message, response `stale: true` with the new count; UI shows "Updating…" again rather than looping forever on one state. (Task 4 test `saves through last included entry when chat grew during refresh`; Task 8 test `does not re-fire POST for the same pending count after success`.)
2. Last turn is still streaming / failed / cancelled → those messages don't count as pending and aren't summarized. (Task 2 test on `toHistoryEntries`; Task 4 state test.)
3. Ollama down or times out mid-chunk with an existing summary → old summary still returned by GET, card shows old text + error + Retry. (Task 4 `keeps previous summary when complete() throws`; Task 8 error test.)
4. Two admins open the same stale chat → only one generation; the second sees `generating` and polls. (Task 4 lock test; Task 8 409 test.)
5. Chat deleted between usage page load and click → 404 page, not a crash; usage row with `chatId: null` renders `—`. (Task 3 404 test; Task 6/7 tests.)

---

### Task 1: Data layer — `ADMIN_SUMMARY` kind, `admin_chat_summary` table, ownerless usage

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261018120000_admin_chat_summary/migration.sql`
- Modify: `apps/api/src/usage/usage.types.ts`, `apps/api/src/usage/usage.helpers.ts`, `apps/api/src/usage/usage-recorder.service.ts`
- Modify: `packages/contracts/src/index.ts` (`UsageKind`)
- Test: `apps/api/test/admin.helpers.spec.ts` (or a new `apps/api/test/usage.helpers.spec.ts`), `apps/api/test/usage.integration.spec.ts`

**Interfaces:**

- Produces: Prisma model `AdminChatSummary` (`prisma.adminChatSummary`) exactly as spec §4; `UsageKind` enum value `ADMIN_SUMMARY`; `RecordUsageParams.principal: RequestPrincipal | null`; `toOwnerColumns(owner: UsageOwner | null): OwnerColumns`; `toUsageOwner(principal: RequestPrincipal | null): UsageOwner | null`; `toWireKind(kind) : 'chat' | 'summary' | 'admin_summary'`; contracts `UsageKind = 'chat' | 'summary' | 'admin_summary'`.

- [ ] **Step 1: Write failing tests**

```ts
it('maps a null principal to no owner columns', () => {
  expect(toOwnerColumns(toUsageOwner(null))).toEqual({
    user_id: null,
    anonymous_session_id: null,
  });
});
it('maps ADMIN_SUMMARY to admin_summary', () => {
  expect(toWireKind('ADMIN_SUMMARY')).toBe('admin_summary');
  expect(toWireKind('SUMMARY')).toBe('summary');
  expect(toWireKind('CHAT')).toBe('chat');
});
```

In `usage.integration.spec.ts`: `it('records ownerless ADMIN_SUMMARY rows that do not change user totals')` — create user + chat, record one CHAT row for the user, read totals via `UsageReportingService`, then `recorder.record({ principal: null, chatId, modelId, kind: 'ADMIN_SUMMARY', inputTokens: 50, outputTokens: 20 })`; assert a `usage_log` row exists with `chat_id = chatId`, both owners `null`, and user totals unchanged.

- [ ] **Step 2: Run tests — expect FAIL** (`pnpm --filter @js-rag-stack/api exec jest test/usage` → type/assert errors).

- [ ] **Step 3: Schema + migration**

Add enum value and model per spec §4 with back-relations on `Chat`, `Message`, `Model`. Migration SQL (hand-written, matching existing style):

```sql
ALTER TYPE "UsageKind" ADD VALUE 'ADMIN_SUMMARY';

CREATE TABLE "admin_chat_summary" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "chat_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "summarized_through_message_id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "admin_chat_summary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_chat_summary_chat_id_key" ON "admin_chat_summary"("chat_id");
-- FKs: chat_id → chat CASCADE, summarized_through_message_id → message CASCADE, model_id → model RESTRICT (ON UPDATE CASCADE like siblings)
```

Then `pnpm --filter @js-rag-stack/api prisma:generate` and verify `pnpm --filter @js-rag-stack/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL"` prints no differences (or apply to dev DB with `prisma migrate deploy` and run `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel ...` → empty).

- [ ] **Step 4: Usage changes** — nullable principal through `toUsageOwner`/`toOwnerColumns`; `toWireKind` handles 3 values; contracts `UsageKind` widened. Fix any exhaustive switches the typecheck flags (admin `UsageLogTable` kind label is handled in Task 6; a raw string render compiles fine).

- [ ] **Step 5: Run tests — expect PASS**; `pnpm --filter @js-rag-stack/api typecheck`.

- [ ] **Step 6: Commit** `feat(api): admin_chat_summary table and ownerless ADMIN_SUMMARY usage`

---

### Task 2: Shared pure helpers, coded errors, default model lookup

**Files:**

- Modify: `apps/api/src/chats/chats.helpers.ts` (add `isPartOfCompletedTurn`, `toHistoryEntries`)
- Modify: `apps/api/src/chats/chat-history.service.ts` (use `toHistoryEntries`; delete private copy)
- Modify: `apps/api/src/chats/context-window.helpers.ts` (`buildSummaryRequest` `instructions?`)
- Create: `apps/api/src/chats/context-settings.ts` (`readContextSettings`)
- Modify: `apps/api/src/chats/context-window.service.ts` (use `readContextSettings`)
- Modify: `apps/api/src/chats/chats.types.ts` (`SummaryRequestParams.instructions?: string`)
- Create: `apps/api/src/common/errors/coded-error.ts`
- Modify: `apps/api/src/ollama/ollama.errors.ts`, `apps/api/src/common/filters/api-exception.filter.ts`
- Modify: `apps/api/src/models/model-catalog.service.ts`
- Test: `apps/api/test/context-window.helpers.spec.ts`, `apps/api/test/models.integration.spec.ts`, `apps/api/test/security.spec.ts` (or wherever the filter is tested; else new `apps/api/test/api-exception.filter.spec.ts`)

**Interfaces:**

- Produces:
  - `toHistoryEntries(messages: Message[]): ChatHistoryEntry[]` (exact current `loadFromDatabase` filter+map)
  - `buildSummaryRequest({ previousSummary, entries, maxEntryChars, instructions? }): OllamaHistoryMessage[]` — `instructions` defaults to existing `SUMMARY_INSTRUCTIONS`
  - `readContextSettings(config: ConfigService<AppEnvironment, true>): ContextSettings`
  - `class CodedError extends Error { constructor(readonly code: string, message: string, readonly status: number) }`; `OllamaError extends CodedError` (keeps its `OllamaErrorCode` type and default status 503); filter matches `CodedError`.
  - `ModelCatalogService.getDefault(): Promise<Model>` — throws `OllamaError('MODEL_NOT_AVAILABLE', 'No default model is configured.', 409)` when `findDefault()` returns null.

- [ ] **Step 1: Failing tests**

```ts
it('toHistoryEntries keeps only completed turns', () => {
  // USER(COMPLETED) + ASSISTANT(COMPLETED), USER + ASSISTANT(FAILED), USER + ASSISTANT(STREAMING)
  expect(toHistoryEntries(messages).map((e) => e.id)).toEqual(['u1', 'a1']);
});
it('buildSummaryRequest uses custom instructions when given', () => {
  const [system] = buildSummaryRequest({
    previousSummary: null,
    entries,
    maxEntryChars: 100,
    instructions: 'ADMIN',
  });
  expect(system).toEqual({ role: 'system', content: 'ADMIN' });
});
it('buildSummaryRequest keeps default instructions', () => {
  expect(
    buildSummaryRequest({
      previousSummary: null,
      entries,
      maxEntryChars: 100,
    })[0].content,
  ).toContain('You keep notes');
});
it('filter maps any CodedError to its status and code', () => {
  // new CodedError('SUMMARY_IN_PROGRESS', 'x', 409) → body { code: 'SUMMARY_IN_PROGRESS', ... }, status 409
});
it('getDefault returns the is_default model', async () => {
  /* ensureDefaultModel, expect name qwen2.5:1.5b */
});
```

Build `messages` from fixture `Message` objects (fill required columns; mirror how `isPartOfCompletedTurn` currently decides — read it before writing the fixture).

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the interfaces above. Pure move for `isPartOfCompletedTurn`/`toHistoryEntries`; no behaviour change in `ChatHistoryService` or `ContextWindowService`.
- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/api test` — all pass (existing context-window and history tests included).
- [ ] **Step 5: Commit** `refactor(api): share history/summary helpers, CodedError, default model lookup`

---

### Task 3: Contracts + `GET /admin/chats/:id`

**Files:**

- Modify: `packages/contracts/src/index.ts` (all types from spec §5.6: `AdminChatOwner`, `AdminChatMessage`, `AdminChatDetail`, `AdminChatSummaryState`)
- Create: `apps/api/src/admin/chats/admin-chats.module.ts`, `admin-chats.repository.ts`, `admin-chats.service.ts`, `admin-chats.controller.ts`, `admin-chats.types.ts`, `admin-chats.helpers.ts`, `models/admin-chat-response.dto.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Test: `apps/api/test/admin-chats.integration.spec.ts`, `apps/api/test/admin.helpers.spec.ts`

**Interfaces:**

- Consumes: Task 1 schema.
- Produces:
  - `AdminChatsRepository.findChat(id: string): Promise<AdminChatRecord | null>` — chat with `selected_model.name`, `user { id, email }`, `anonymous_session_id`, messages ordered `(created_at, id)`.
  - `AdminChatsRepository.findMessages(chatId: string): Promise<Message[]>` (same order) — used by Task 4.
  - `AdminChatsRepository.chatExists(id: string): Promise<boolean>`
  - `toAdminChatDetail(record: AdminChatRecord): AdminChatDetail` (pure, in `admin-chats.helpers.ts`) — enums lowercased, dates ISO, owner: user → `{type:'user',id,email}`, else anonymous id → `{type:'anonymous',id}`, else `null`.
  - `AdminChatsService.getChat(id: string): Promise<AdminChatDetail>` — `NotFoundException('Chat not found.')` when missing.
  - Controller `@Controller('admin/chats')`, `@UseGuards(AdminAuthGuard)`, `@ApiTags('admin-chats')`, `@ApiCookieAuth('admin_access_token')`; `GET :id` with `ParseUUIDPipe`.

- [ ] **Step 1: Failing tests**
  - helpers: `toAdminChatDetail` maps user owner, anonymous owner, null owner; `status: 'FAILED'` → `'failed'`; `role: 'ASSISTANT'` → `'assistant'`.
  - integration: create user + chat + 2 messages; `service.getChat(chat.id)` returns messages in order with owner email; `getChat(randomUUID())` rejects `NotFoundException`.
  - guard metadata: `expect(Reflect.getMetadata('__guards__', AdminChatsController)).toContain(AdminAuthGuard)` (user-token rejection by `AdminAuthGuard` and the global `CsrfGuard` on POST are already covered by `admin-auth.integration.spec.ts` / `security.spec.ts`).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**; module imports `AdminAuthModule`; register in `AdminModule`. DTO classes mirror contracts with `@ApiProperty` like `admin-users-response.dto.ts`.
- [ ] **Step 4: Run — PASS**, plus `pnpm --filter @js-rag-stack/api typecheck`.
- [ ] **Step 5: Commit** `feat(api): admin chat detail endpoint`

---

### Task 4: Admin summary service + `GET`/`POST /admin/chats/:id/summary`

**Files:**

- Create: `apps/api/src/admin/chats/admin-chat-summary.service.ts`, `admin-chat-summary.helpers.ts`, `admin-chat-summary.errors.ts`
- Modify: `admin-chats.repository.ts` (summary find/upsert), `admin-chats.controller.ts`, `admin-chats.module.ts`, `admin-chats.types.ts`, `models/admin-chat-response.dto.ts`
- Test: `apps/api/test/admin-chat-summary.helpers.spec.ts`, `apps/api/test/admin-chat-summary.service.spec.ts`, `apps/api/test/admin-chats.integration.spec.ts`

**Interfaces:**

- Consumes: `toHistoryEntries`, `entriesAfter`, `chunkEntries`, `getContextBudget`, `estimateMessageTokens`, `isDegenerateSummary`, `buildSummaryRequest`, `readContextSettings` (Task 2); `ModelCatalogService.getDefault`; `OllamaService.complete`; `UsageRecorderService.record({ principal: null, ... })`; `RedisLockService.acquire`; `RedisService.get`; `CodedError`.
- Produces:
  - `ADMIN_SUMMARY_INSTRUCTIONS: string` — exact text from spec §5.4.
  - `toSummaryState({ summary, entries, generating }): { pending: ChatHistoryEntry[]; state: AdminChatSummaryState }` where `summary: AdminChatSummaryWithModel | null` (row + `model.name`). Missing through-id in `entries` ⇒ `state.content` is the stored text, `pending = entries`, `stale = entries.length > 0`; `refreshSummary` then starts from `previousSummary = null` (full re-summarize).
  - `adminSummaryLockKey(chatId: string): string` → `admin-chat-summary-lock:${chatId}`
  - `AdminChatSummaryError extends CodedError` with codes `'SUMMARY_IN_PROGRESS'` (409) / `'SUMMARY_FAILED'` (502), messages from Global Constraints.
  - Repository: `findSummary(chatId): Promise<AdminChatSummaryWithModel | null>`; `upsertSummary({ chatId, content, summarizedThroughMessageId, modelId, tokenCount }): Promise<AdminChatSummaryWithModel>`.
  - `AdminChatSummaryService.getSummary(chatId: string): Promise<AdminChatSummaryState>`; `refreshSummary(chatId: string): Promise<AdminChatSummaryState>` — algorithm in spec §5.4 steps 1–7.
  - Routes `GET :id/summary`, `POST :id/summary` (`@HttpCode(200)`), both `ParseUUIDPipe`, `@ApiOkResponse({ type: AdminChatSummaryStateDto })`, `@ApiConflictResponse()`.
  - Module providers add `AdminChatSummaryService`, `RedisLockService`; imports add `ModelsModule`, `OllamaModule`, `UsageModule`.

- [ ] **Step 1: Failing helper tests** (`toSummaryState`): no summary + 0 entries → `{content:null, stale:false, pendingMessages:0}`; no summary + 4 entries → stale, 4; summary through `a1` with entries `u1,a1,u2,a2` → stale, 2, pending ids `['u2','a2']`; through last → `stale:false`; through id absent → pending = all entries; `generating` passed through; `generatedAt` = `updated_at.toISOString()`, `model` = model name.

- [ ] **Step 2: Failing service tests** (mocks for repository, catalog, ollama, usage, locks, redis; real `ConfigService` via `validateEnvironment({ NODE_ENV: 'test' })` like `context-window.service.spec.ts`):
  - `returns cached state without calling ollama when fresh`
  - `summarizes all entries when no summary exists` — upsert called with `summarizedThroughMessageId` = last entry id, `modelId` = default model id
  - `sends previous summary and only new entries when stale` — `complete` messages[1].content contains `Existing notes:\n<old>` and contains `u2`/`a2` text but not `u1` text; messages[0].content === `ADMIN_SUMMARY_INSTRUCTIONS`
  - `chunks a large backlog and feeds each result forward` (small `max_context`, e.g. 1000, long entries → ≥2 `complete` calls; 2nd call's request contains 1st result)
  - `records ADMIN_SUMMARY usage per call with null principal`
  - `throws SUMMARY_FAILED and saves nothing on degenerate output`
  - `keeps previous summary when complete() throws` (upsert not called; lock released)
  - `throws SUMMARY_IN_PROGRESS when the lock is held` (`acquire` → `undefined`; no `complete` call)
  - `saves through last included entry when chat grew during refresh` — repository `findMessages` returns the snapshot at start; assert upsert through-id is last snapshot entry
  - `releases the lock after success` (`lock.release` called once)
  - `getSummary reports generating when the lock key exists` (`redis.get` → `'token'`)
  - `getSummary/refreshSummary throw NotFoundException for a missing chat`

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement.** `maxTokens: Math.min(budget.summaryMaxTokens, 400)`; `maxEntryChars: budget.chunkTokens * charsPerToken`; extend lock (`lock.extend(ttl)`) after each chunk; release in `finally`; `signal` = `AbortSignal.timeout(OLLAMA_TOTAL_TIMEOUT_MS)` — never wired to the request.
- [ ] **Step 5: Integration test** (`admin-chats.integration.spec.ts`): upsert a summary for a chat, delete the chat, assert `admin_chat_summary` row gone (cascade).
- [ ] **Step 6: Run** `pnpm --filter @js-rag-stack/api test` — PASS.
- [ ] **Step 7: Commit** `feat(api): cached incremental admin chat summary`

---

### Task 5: API client + OpenAPI

**Files:**

- Modify: `packages/api-client/src/admin.ts`, `packages/api-client/openapi.json` (regenerated)
- Test: `apps/admin/src/lib/admin-client.test.ts`

**Interfaces:**

- Produces on `createAdminApiClient`: `getChat(chatId: string): Promise<AdminChatDetail>`; `getChatSummary(chatId: string): Promise<AdminChatSummaryState>`; `refreshChatSummary(chatId: string): Promise<AdminChatSummaryState>` (`authed(() => http.mutation(..., { method: 'POST' }))`, path `/admin/chats/${id(chatId)}/summary`).

- [ ] **Step 1: Failing test** — with a fake `fetchImpl`, `refreshChatSummary('c1')` issues `POST /api/v1/admin/chats/c1/summary` with the CSRF header (mirror the existing `updateModel` test); `getChatSummary` issues `GET`.
- [ ] **Step 2: Run** `pnpm --filter admin test admin-client` — FAIL.
- [ ] **Step 3: Implement**, then `pnpm --filter @js-rag-stack/api openapi:generate`.
- [ ] **Step 4: Run** test — PASS; `pnpm --filter @js-rag-stack/api openapi:check` — PASS.
- [ ] **Step 5: Commit** `feat(api-client): admin chat and summary methods`

---

### Task 6: Usage log table — chat first and clickable

**Files:**

- Modify: `apps/admin/src/components/usage-log-table.tsx`, `apps/admin/src/lib/format.ts` (`formatUsageKind`)
- Test: `apps/admin/src/components/components.test.tsx`

**Interfaces:**

- Produces: `formatUsageKind(kind: UsageKind): string` → `'chat' | 'summary' | 'admin summary'`.

- [ ] **Step 1: Failing tests** (render inside `MemoryRouter` via `renderWithProviders`):
  - first column header text is `Chat`
  - row with `chatId: '0192…'` renders link `getByRole('link', { name: /open chat/i })` with `href="/chats/0192…"` and text `shortId(chatId)`
  - row with `chatId: null` renders `—` and no link
  - kind `admin_summary` renders `admin summary`
- [ ] **Step 2: Run** `pnpm --filter admin test components` — FAIL.
- [ ] **Step 3: Implement** (`Link` from `react-router-dom`, `aria-label={`Open chat ${shortId(chatId)}`}`, `text-accent hover:underline font-mono text-xs`).
- [ ] **Step 4: Run** — PASS; existing users/anonymous page tests still pass (`pnpm --filter admin test`).
- [ ] **Step 5: Commit** `feat(admin): chat column first and linked in usage log`

---

### Task 7: Admin chat page (header + transcript)

**Files:**

- Create: `apps/admin/src/features/chats/admin-chat-page.tsx`, `apps/admin/src/features/chats/chat-transcript.tsx`, `apps/admin/src/features/chats/chats.test.tsx`
- Modify: `apps/admin/src/app.tsx` (route `/chats/:chatId` inside `RequireAdmin`), `apps/admin/src/test/fixtures.ts` (`makeChatDetail`, `makeSummaryState`)

**Interfaces:**

- Consumes: `api.getChat` (Task 5).
- Produces: `AdminChatPage` (reads `chatId` param); `ChatTranscript({ messages }: { messages: AdminChatMessage[] })`; fixtures `makeChatDetail(overrides?)`, `makeSummaryState(overrides?)`. The summary card is not part of this task; Task 8 mounts it above the transcript.

- [ ] **Step 1: Failing tests** (mock `api` like `users.test.tsx`):
  - shows title, model, owner email linking to `/users/<id>`; anonymous owner links to `/anonymous/<id>` with short id; `null` owner shows "Deleted owner"
  - transcript lists "User" / "Assistant · qwen2.5:1.5b" blocks in order with content
  - failed message shows a `failed` badge
  - empty messages → "No messages."
  - `getChat` rejects `ApiClientError` 404 → "This chat no longer exists."
  - "Archived" badge when `archivedAt` set
- [ ] **Step 2: Run** `pnpm --filter admin test chats` — FAIL.
- [ ] **Step 3: Implement.** `useQuery(['chats', chatId], () => api.getChat(chatId))`; back link "← Back" uses `navigate(-1)` if `window.history.state?.idx > 0`, else owner page, else `/users`; content `whitespace-pre-wrap break-words`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(admin): admin chat transcript page`

---

### Task 8: Summary card + `useChatSummary` hook

**Files:**

- Create: `apps/admin/src/features/chats/use-chat-summary.ts`, `apps/admin/src/features/chats/chat-summary-card.tsx`
- Modify: `apps/admin/src/features/chats/admin-chat-page.tsx`, `apps/admin/src/features/chats/chats.test.tsx`

**Interfaces:**

- Consumes: `api.getChatSummary`, `api.refreshChatSummary`, `makeSummaryState`.
- Produces: `useChatSummary(chatId: string): { state: AdminChatSummaryState | undefined; isLoading: boolean; isUpdating: boolean; error: unknown; retry: () => void }`; `ChatSummaryCard({ chatId }: { chatId: string })`.

Hook rules (the part the tests don't fully determine):

- Query key `['chats', chatId, 'summary']`; `refetchInterval: (q) => q.state.data?.generating || conflict ? 2000 : false`.
- Auto-refresh fires once per `(summarizedThroughMessageId, pendingMessages)` pair: keep a ref of the last attempted pair; fire `mutate()` when `state.stale && !state.generating && !mutation.isPending && ref !== pair`.
- On success: `queryClient.setQueryData(key, result)`. On `ApiClientError` with `code === 'SUMMARY_IN_PROGRESS'`: set local `conflict = true` (enables polling), clear the ref so it retries after `generating` turns false; not shown as an error.
- `retry()` clears the error and ref, then `mutate()`.
- `isUpdating = mutation.isPending || state.generating || conflict`.

- [ ] **Step 1: Failing tests**
  - fresh cached summary → text shown with "Summarized through" and model; `refreshChatSummary` not called
  - no summary + stale → "Generating summary…" (`role="status"`) then result text after POST resolves
  - stale with summary → old text + "Updating with 3 new messages…", then new text
  - `does not re-fire POST for the same pending count after success` (POST resolves still `stale: true, pendingMessages: 2` → called exactly once until the pair changes)
  - `generating: true` → no POST; polls `getChatSummary` (use `vi.useFakeTimers({ shouldAdvanceTime: true })`, advance 2000 ms) and shows result when it returns `generating: false, stale: false`
  - POST rejects 409 `SUMMARY_IN_PROGRESS` → no alert; polls
  - POST rejects 503 → old text kept + alert with message + "Retry" button; clicking Retry calls POST again
  - `content: null, stale: false` → "Nothing to summarize yet."
  - card heading includes "visible to admins only"
- [ ] **Step 2: Run** `pnpm --filter admin test chats` — FAIL.
- [ ] **Step 3: Implement** hook and card per spec §6.4 (skeleton `animate-pulse motion-reduce:animate-none`; spinner + text in `role="status" aria-live="polite"`; error `role="alert" text-danger`; old text `opacity-60` while updating). Mount card in `AdminChatPage` above the transcript.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(admin): cached chat summary card with loading states`

---

### Task 9: Full verification

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check` — all green.
- [ ] **Step 2: Manual smoke** (API + admin dev servers, Ollama running): open a user detail page → click chat id → summary skeleton then text; reload → instant, no new `ADMIN_SUMMARY` usage row; send a new message in the web app → reopen → "Updating with 2 new messages…" and one new usage row; user's totals unchanged.
- [ ] **Step 3: Commit** any fixes (`fix(...)`); do not push without asking.
