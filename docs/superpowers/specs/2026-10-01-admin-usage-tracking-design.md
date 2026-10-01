# Usage Tracking, Admin Dashboard & Model Management — Design Spec

Date: 2026-10-01
Scope: `apps/api` (Prisma schema, migration, new modules, chats, auth, ollama,
config, CLI), `packages/contracts`, `packages/api-client`, `apps/web` (model
selector), new `apps/admin`.

## 1. Background

Token counts already land on `message.prompt_tokens` / `completion_tokens`, but
they are deleted with the chat (cascade), summarization calls
(`OllamaService.complete`) are never recorded, and there is no way to see usage
per user or per anonymous visitor. Models live in the `model` table but can only
be changed via SQL, and the default model is fixed by the `OLLAMA_DEFAULT_MODEL`
env var. There is no admin concept at all.

## 2. Goals

1. A durable, append-only usage log: who (user or anonymous session), which
   model, input tokens, output tokens, kind (chat reply / summary), date.
2. A separate admin dashboard app with its own admin accounts and auth.
3. Admins see all registered users and all anonymous sessions on **separate
   pages**, each with usage totals and a drill-down into the usage log.
4. Admins can add models, edit `max_context`, mark a model unavailable
   (`is_available`), and choose the default model.

### Success criteria

- Every completed chat reply and every completed summarization writes exactly one
  `usage_log` row with Ollama-reported input/output token counts.
- Deleting a chat does not delete its usage rows.
- When an anonymous visitor signs up or signs in, their usage rows move to the
  user in the same transaction as their chats.
- A user access token gets `401` on every `/api/v1/admin/*` route except
  admin sign-in / CSRF.
- Exactly one model is default; the default can never be unavailable (DB
  constraint + 409 from the API).
- Unavailable models disappear from `GET /models`; streaming or creating a chat
  with one returns `MODEL_NOT_AVAILABLE`; the web UI asks the user to switch.
- Backend follows Nest module boundaries and SOLID (section 4).
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check`
  pass.

### Non-goals

Charts, CSV export, billing/quotas/rate limits by usage, admin management of
admin accounts in the UI, deleting models, renaming models, logging cancelled or
failed generations (Ollama reports no token counts for them).

## 3. Data model (one migration)

### 3.1 `model` — new columns

| column         | type    | notes          |
| -------------- | ------- | -------------- |
| `is_available` | BOOLEAN | default `true` |
| `is_default`   | BOOLEAN | default `false` |

- `CREATE UNIQUE INDEX model_single_default ON model (is_default) WHERE is_default;`
- `CHECK (NOT is_default OR is_available)` — `model_default_is_available_check`.
- Migration sets `is_default = true` on the `qwen2.5:1.5b` row if it exists.
  At bootstrap, if no row is default, the API marks the `OLLAMA_DEFAULT_MODEL`
  row default (creating it with `max_context = 8192` if missing). From then on
  the env var is only a seed; the DB is the source of truth.
- Models are never deleted (chats reference them with `RESTRICT`).

### 3.2 `usage_log` — new

| column                 | type                     | notes                          |
| ---------------------- | ------------------------ | ------------------------------ |
| `id`                   | UUID v7                  | PK                             |
| `user_id`              | UUID?                    | FK user, `ON DELETE SET NULL`  |
| `anonymous_session_id` | UUID?                    | FK anonymous_session, SET NULL |
| `chat_id`              | UUID?                    | FK chat, `ON DELETE SET NULL`  |
| `model_id`             | UUID                     | FK model, `RESTRICT`           |
| `kind`                 | enum `UsageKind`         | `CHAT` \| `SUMMARY`            |
| `input_tokens`         | INT                      | `>= 0`                         |
| `output_tokens`        | INT                      | `>= 0`                         |
| `created_at`           | TIMESTAMPTZ(3)           | default now                    |

- No check constraint on owner columns (SET NULL can null both after deletes);
  the application always writes exactly one owner.
- Indexes: `(user_id, created_at)`, `(anonymous_session_id, created_at)`,
  `(created_at)`, `(model_id)`.
- Missing token counts from Ollama are recorded as `0`.

### 3.3 `admin` — new

`id`, `email` (unique, VARCHAR 320), `password_hash` (argon2id), `display_name?`,
`last_sign_in_at?`, `created_at`, `updated_at`.

### 3.4 `admin_session` — new

`id`, `admin_id` (FK cascade), `refresh_token_hash` (unique CHAR 64),
`refresh_jti` (unique uuidv7), `expires_at`, `revoked_at?`, `created_at`,
`last_used_at`. Refresh rotates in place: the row's hash/jti are replaced and
the old token stops validating. Indexes: `admin_id`, `expires_at`.

## 4. Backend architecture (Nest modules + SOLID)

Rules every new/changed backend unit follows:

- **S** — one reason to change per class: controllers only map HTTP ⇄ DTOs,
  services hold business rules, repositories are the only Prisma callers.
- **O** — new usage kinds or report filters extend enums/params, not branching
  inside unrelated services.
- **L** — the admin principal is a separate type (`AdminPrincipal`), never a
  variant of `RequestPrincipal`, so no user code path can receive an admin.
- **I** — narrow consumer-facing services: chat code depends on
  `UsageRecorderService` (write only); admin code depends on
  `UsageReportingService` (read only).
- **D** — cross-module collaboration goes through exported services/abstract
  classes, never another module's repository. Password hashing goes through an
  abstract `PasswordHasher` (argon2 implementation) used by user auth, admin
  auth and the CLI.

### 4.1 Module map

```
common/security/SecurityModule (existing, global)
  + PasswordHasher (abstract class) → Argon2PasswordHasher   [exported]

models/ModelsModule            (NEW — model registry extracted from ollama/)
  ModelsRepository             (moved from ollama/)
  ModelCatalogService          public reads: listSelectable(), getDefault(),
                               resolveForGeneration(name) → throws
                               MODEL_NOT_ALLOWED / MODEL_NOT_AVAILABLE
  ModelAdministrationService   create / update / setDefault rules
  ModelDefaultSeeder           OnApplicationBootstrap seeding from env
  ModelsController             GET /models (moved from ollama/)
  imports OllamaModule (for installed-model list)
  exports ModelCatalogService, ModelAdministrationService

ollama/OllamaModule            reduced to the LLM client: OllamaService
                               (streamChat, complete, listInstalledModels, ping)

usage/UsageModule              (NEW)
  UsageRepository
  UsageRecorderService         record(params) — never throws (logs warning)
  UsageTransferService         reassignAnonymousUsage(tx, anonId, userId)
  UsageReportingService        totals, per-model breakdown, paginated rows
  exports UsageRecorderService, UsageTransferService, UsageReportingService

chats/ChatsModule              imports ModelsModule, UsageModule
auth/AuthModule                imports UsageModule (transfer on sign-up/in)

admin/AdminModule              (NEW, aggregate; imports the four below)
  admin/auth/AdminAuthModule
    AdminAccountsRepository, AdminSessionsRepository
    AdminTokenService          JWT sign/verify with ADMIN_JWT_SECRET
    AdminCookieService         admin_access_token / admin_refresh_token
    AdminAuthService           sign-in, refresh, sign-out, me
    AdminAccountsService       create/upsert admin (used by CLI)
    AdminAuthGuard             exported; sets request.admin
    AdminAuthController        /admin/auth/*
  admin/users/AdminUsersModule
    AdminUsersRepository, AdminUsersService, AdminUsersController
  admin/anonymous-sessions/AdminAnonymousSessionsModule
    AdminAnonymousSessionsRepository, ...Service, ...Controller
  admin/models/AdminModelsModule
    AdminModelsController → ModelAdministrationService

cli/create-admin.ts            NestFactory.createApplicationContext(AdminCliModule)
                               → AdminAccountsService.upsert()
```

`ChatStreamService` and `ContextWindowService` stop calling `OllamaService` for
model lookup; they use `ModelCatalogService.resolveForGeneration`. Existing
`OllamaService.assertAllowed/assertAvailable/listModels/defaultModel` are
removed.

### 4.2 Usage recording

- `UsageRecorderService.record({ principal, chatId, modelId, kind, inputTokens,
  outputTokens })` maps the principal to `user_id` or `anonymous_session_id`.
- `ChatStreamService`: after `completeGeneration`, record `kind=CHAT` with the
  final chunk's `promptTokens` / `completionTokens`.
- `ContextWindowService.summarize`: after a successful (non-degenerate)
  `complete()`, record `kind=SUMMARY`. `BuildPromptParams` gains `principal`.
- Recording failures log a warning; they never fail the stream.
- `AuthRepository` sign-up/sign-in transactions call
  `UsageTransferService.reassignAnonymousUsage(tx, anonymousSessionId, userId)`
  next to the chat transfer (sets `user_id`, clears `anonymous_session_id`).

### 4.3 Admin auth & request pipeline

- Env: `ADMIN_ORIGIN` (url, default `http://localhost:5174`),
  `ADMIN_JWT_SECRET` (min 32, test default, must be replaced in production),
  `ADMIN_ACCESS_TTL` (default `15m`), `ADMIN_REFRESH_TTL` (default `7d`).
- Cookies: `admin_access_token` (path `/api/v1/admin`), `admin_refresh_token`
  (path `/api/v1/admin/auth`); httpOnly, same secure/sameSite/domain settings
  as user cookies.
- JWT claims include `aud: 'admin'`; `AdminTokenService` rejects any other
  audience, so a user token signed with a different secret can never pass.
- `AdminAuthGuard` is applied at controller level on all admin controllers
  except `sign-in`, `refresh`, `csrf`. It sets `request.admin: AdminPrincipal`
  (`{ admin_id, admin_session_id }`); `express.d.ts` gains `admin?`.
- CORS: `origin: [WEB_ORIGIN, ADMIN_ORIGIN]`.
- `OriginGuard`: requests under `/api/v1/admin` must come from `ADMIN_ORIGIN`;
  everything else from `WEB_ORIGIN` (dev API-origin exception unchanged).
- `CsrfGuard` unchanged (global). `GET /admin/auth/csrf` issues a token using
  the existing `CsrfService`.
- `RequestPrincipalMiddleware` is excluded from `admin/{*path}` so admin
  requests never create anonymous sessions.
- Sign-in failure message is generic ("Invalid email or password.").

### 4.4 Admin API (`/api/v1/admin`, all JSON, camelCase)

Pagination is offset-based for admin lists: `page` (≥1, default 1),
`pageSize` (1–100, default 25); responses `{ items, page, pageSize, total }`.
Date filters `from` / `to` (ISO dates, optional) apply to usage aggregates and
log rows; `to` is exclusive.

| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| GET    | `/admin/auth/csrf`                        | CSRF token |
| POST   | `/admin/auth/sign-in`                     | `{ email, password }` → `{ admin }`, sets cookies |
| POST   | `/admin/auth/refresh`                     | rotate tokens |
| POST   | `/admin/auth/sign-out`                    | revoke session, clear cookies |
| GET    | `/admin/auth/me`                          | `{ admin }` |
| GET    | `/admin/users`                            | `search` (email/name, case-insensitive), `sort` (`lastActivity` \| `totalTokens` \| `createdAt`, default `lastActivity`), `from`, `to`, page params |
| GET    | `/admin/users/:id`                        | user profile + totals + per-model breakdown (`from`/`to`) |
| GET    | `/admin/users/:id/usage`                  | paginated usage rows, newest first |
| GET    | `/admin/anonymous-sessions`               | same as users minus `search`; includes `createdAt`, `lastSeenAt`, `expiresAt` |
| GET    | `/admin/anonymous-sessions/:id`           | session + totals + breakdown |
| GET    | `/admin/anonymous-sessions/:id/usage`     | paginated usage rows |
| GET    | `/admin/models`                           | all models + `installed` flag (Ollama down → `installed: null`) |
| POST   | `/admin/models`                           | `{ name, maxContext, isAvailable? }`; 409 on duplicate name |
| PATCH  | `/admin/models/:id`                       | `{ maxContext?, isAvailable?, isDefault? }` |

Totals shape: `{ requests, inputTokens, outputTokens, totalTokens,
lastActivityAt | null }`. Breakdown: `[{ model, kind, requests, inputTokens,
outputTokens }]`. Usage row: `{ id, createdAt, model, kind, inputTokens,
outputTokens, chatId | null }`.

Anonymous sessions list only sessions with at least one usage row **or** at
least one chat (so the page is not flooded with empty visitor sessions).
Users list includes all users (zero totals allowed).

Aggregation for list pages uses one SQL query (`$queryRaw` with typed result)
joining `usage_log` grouped by owner, so sorting by totals works with
pagination.

Model rules (in `ModelAdministrationService`):

- `isDefault: true` → in one transaction unset the current default, set this
  one (and force `is_available = true` only if the request also sets it;
  otherwise 409 if the model is unavailable).
- `isDefault: false` on the current default → 409 ("choose another default").
- `isAvailable: false` on the default → 409.
- `maxContext` must be an integer 512–1 048 576.
- `name` 1–200 chars, trimmed, unique.

### 4.5 CLI

`pnpm --filter @js-rag-stack/api admin:create --email <email> [--name <name>]`
prompts for the password twice with hidden input (min 12 chars), then upserts
via `AdminAccountsService` (existing email → password reset). Builds through
`nest build` and runs `node dist/cli/create-admin.js`.

## 5. Public behaviour changes

- `GET /models` returns models that are `is_available` **and** installed;
  `default` comes from `is_default`.
- Creating a chat or streaming with an unavailable model →
  `MODEL_NOT_AVAILABLE` (existing error code).
- `ChatSummary` gains `selectedModelAvailable: boolean`.
- Web: if the active chat's model is not available, `ModelSelector` shows
  "‹name› is no longer available — choose another model" and the composer's
  send is disabled until the user picks an available model.

## 6. `apps/admin`

- Vite + React 19 + react-router 7 + @tanstack/react-query + Tailwind 4 +
  vitest + Testing Library; same versions, eslint and tsconfig packages as
  `apps/web`. Dev port 5174 with the same `/api` Vite proxy as web (browser
  `Origin` stays `http://localhost:5174` = `ADMIN_ORIGIN`). Cookies on
  `localhost` are shared across ports, which is why admin cookies use distinct
  names and paths.
- `@js-rag-stack/api-client` gains `createAdminApiClient({ baseUrl })`
  (CSRF via `/admin/auth/csrf`, refresh-on-401 once via `/admin/auth/refresh`).
  Admin types live in `@js-rag-stack/contracts`.
- Routes:
  - `/login` — email/password form.
  - `/users` — table: email, name, joined, requests, input, output, last
    activity; search box, sort select, date-range inputs, pagination.
  - `/users/:id` — header, totals cards, per-model breakdown table, usage log
    table (paginated).
  - `/anonymous`, `/anonymous/:id` — same layout; identity column shows the
    short session id plus created / last seen / expires.
  - `/models` — table: name, max context (inline edit), installed, available
    (toggle), default (radio-style "Make default"); "Add model" form. Server
    409 messages shown inline.
- Shell: left nav (Users, Anonymous, Models), signed-in admin email, sign out.
  Unauthenticated → redirect to `/login`.
- Turbo picks it up via `dev`, `build`, `lint`, `typecheck`, `test` scripts;
  root gets an `admin` script.

## 7. Testing

- API (jest, real Postgres/Redis like existing integration specs):
  - usage rows written for chat replies and summaries; none for cancelled
    streams; chat deletion keeps rows; sign-up and sign-in transfer rows.
  - admin auth: sign-in/refresh/sign-out/me; user cookie → 401 on admin routes;
    admin routes reject `WEB_ORIGIN` on unsafe methods.
  - aggregates: totals, sorting, date filters, pagination, anonymous filter.
  - model rules: single default, default can't be unavailable, unavailable
    models excluded from `/models` and rejected on stream/create, seeding.
  - CLI service: upsert creates and resets.
- Unit tests for pure helpers (principal → owner mapping, query param parsing).
- Web: model selector unavailable state, send disabled.
- Admin app: vitest per page (login, users list/detail, anonymous list/detail,
  models create/toggle/default/409).
- `openapi.json` regenerated; `openapi:check` passes.
