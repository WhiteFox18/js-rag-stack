# Usage Tracking, Admin Dashboard & Model Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every LLM call's input/output tokens per user or anonymous session, expose them in a separate admin dashboard app with its own admin accounts, and let admins add/edit models, toggle `is_available`, and pick the default model.

**Architecture:** One Prisma migration adds `model.is_available/is_default`, `usage_log`, `admin`, `admin_session`. The model registry moves out of `OllamaModule` into a new `ModelsModule` (catalog reads vs. administration writes). A new `UsageModule` exposes three narrow services (recorder / transfer / reporting). A new `AdminModule` aggregates `AdminAuthModule` (own JWT secret, cookies, guard), `AdminUsersModule`, `AdminAnonymousSessionsModule`, `AdminModelsModule`. A new `apps/admin` Vite app consumes `createAdminApiClient` from `@js-rag-stack/api-client`.

**Tech Stack:** NestJS 11, Prisma 7 (`prisma-client` generator, PostgreSQL 18 `uuidv7()`), Redis, `@nestjs/jwt`, argon2, class-validator, Jest + @swc/jest (API); React 19, react-router 7, TanStack Query 5, Tailwind 4, Vitest 4 + Testing Library (web/admin); pnpm 10 + Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-01-admin-usage-tracking-design.md`

## Global Constraints

- Branch: `feat/admin-usage-tracking` (already created). Commit after every task. **Never `git push`** without asking the user.
- Persistence naming: PascalCase Prisma model names with `@@map("singular_snake_case")`; snake_case fields; **no field-level `@map`**; repositories return raw Prisma records (snake_case) — camelCase only at the HTTP boundary (helpers/DTOs).
- IDs: UUIDv7 via `@default(dbgenerated("uuidv7()"))`; application code never pre-generates persisted IDs.
- Nest + SOLID rules (spec §4): controllers only map HTTP ⇄ DTOs; services hold rules; repositories are the only Prisma callers; a module never injects another module's repository — only exported services; chat code depends only on `UsageRecorderService`; admin code depends only on `UsageReportingService`; `AdminPrincipal` is never part of `RequestPrincipal`.
- Every new file follows existing layout: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `<feature>.repository.ts`, `<feature>.types.ts`, `<feature>.helpers.ts`, `dto/*.dto.ts` (request), `models/*.dto.ts` (response, Swagger classes).
- Params objects: functions with >1 argument take one named-params object typed in `<feature>.types.ts` (existing convention).
- Error codes: `MODEL_NOT_ALLOWED` (400, unknown model), `MODEL_NOT_AVAILABLE` (409 when admin-disabled; existing 503 when not installed in Ollama).
- Usage kinds on the wire are lowercase: `'chat' | 'summary'`. DB enum `UsageKind { CHAT SUMMARY }`.
- Admin pagination: `page` ≥ 1 default 1, `pageSize` 1–100 default 25; response `{ items, page, pageSize, total }`. `from` inclusive, `to` exclusive, ISO 8601.
- `maxContext` 512–1 048 576 integer; model `name` 1–200 chars trimmed; admin password ≥ 12 chars.
- Env defaults: `ADMIN_ORIGIN=http://localhost:5174`, `ADMIN_JWT_SECRET=test-admin-secret-at-least-32-bytes!`, `ADMIN_ACCESS_TTL=15m`, `ADMIN_REFRESH_TTL=7d`.
- Cookies: `admin_access_token` (path `/api/v1/admin`), `admin_refresh_token` (path `/api/v1/admin/auth`).
- Admin app port `5174`, same `/api` Vite proxy as web.
- UI copy, verbatim: `"<name> is no longer available — choose another model"`, `Invalid email or password.`, `Choose another default model first.`, `The default model cannot be made unavailable.`
- Tailwind only, existing color tokens copied from `apps/web/src/styles.css`; no UI library, no chart library.
- Done means: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check` all pass. If `pnpm` is not on `PATH`, use `npx pnpm@10.24.0`.
- API tests need local PostgreSQL (`js_rag_stack` on 5432) and Redis (6379); `pnpm --filter @js-rag-stack/api test` runs `prisma migrate deploy` first. After schema changes run `pnpm --filter @js-rag-stack/api prisma:generate`.

## Review Focus

1. **Anonymous visitor signs up after chatting** — the anonymous session row is deleted inside the transfer transaction; usage rows must be reassigned **before** that delete or `ON DELETE SET NULL` orphans them. Pinned in Task 4 (`moves anonymous usage to the user on sign-up` / `on sign-in`).
2. **A user (non-admin) cookie hitting admin routes** — must get 401, and a forged user JWT must not pass `AdminTokenService` (different secret + `aud`). Pinned in Task 6 (`rejects user access tokens`).
3. **Admin toggles the current default to unavailable / unsets default** — must 409 and leave the DB unchanged; switching default must never leave zero or two defaults even under concurrent PATCHes (partial unique index). Pinned in Task 5.
4. **A chat whose model was disabled** — send must fail with `MODEL_NOT_AVAILABLE` (not 500), PATCH to that model must fail, and the web must show the switch prompt instead of a broken send. Pinned in Task 3 and Task 10.
5. **Sorting/pagination/date filters with users that have zero usage** — zero-usage users still listed with zero totals and sorted last for `lastActivity`/`totalTokens`; `bigint` sums never leak as strings. Pinned in Task 9 (`admin lists` tests).

---

## File Map

API (`apps/api`):

- Modify `prisma/schema.prisma`; create `prisma/migrations/20261001120000_usage_log_admin_and_model_flags/migration.sql`.
- Modify `src/common/security/security.module.ts`; create `src/common/security/password-hasher.ts`.
- Create `src/models/` — `models.module.ts`, `models.repository.ts` (moved), `model-catalog.service.ts`, `model-administration.service.ts`, `model-default.seeder.ts`, `models.controller.ts` (moved), `models.types.ts`, `models.helpers.ts`, `models/models-response.dto.ts` (moved).
- Modify `src/ollama/ollama.module.ts`, `ollama.service.ts`, `ollama.types.ts`; delete `src/ollama/models.repository.ts`, `models.controller.ts`, `models/models-response.dto.ts`.
- Create `src/usage/` — `usage.module.ts`, `usage.repository.ts`, `usage-recorder.service.ts`, `usage-transfer.service.ts`, `usage-reporting.service.ts`, `usage.types.ts`, `usage.helpers.ts`.
- Modify `src/chats/chats.module.ts`, `chats.service.ts`, `chat-stream.service.ts`, `context-window.service.ts`, `chats.types.ts`, `chats.helpers.ts`, `models/chat-response.dto.ts`.
- Modify `src/auth/auth.module.ts`, `auth.repository.ts`, `auth.service.ts`.
- Create `src/admin/` — `admin.module.ts`, `admin.helpers.ts`, `common/admin-query.dto.ts`, `common/admin-usage.dto.ts`, `auth/*`, `users/*`, `anonymous-sessions/*`, `models/*`.
- Create `src/cli/create-admin.ts`, `src/cli/admin-cli.module.ts`.
- Modify `src/config/environment.schema.ts`, `src/main.ts`, `src/app.module.ts`, `src/common/guards/origin.guard.ts`, `src/common/middleware/request-principal.middleware.ts`, `src/common/types/express.d.ts`, `src/common/models/request-principal.ts`, `package.json`.
- Tests: create `test/usage.integration.spec.ts`, `test/models.integration.spec.ts`, `test/admin-auth.integration.spec.ts`, `test/admin-reporting.integration.spec.ts`, `test/admin.helpers.spec.ts`; modify `test/phase4.spec.ts`, `test/context-window.service.spec.ts`, `test/auth.integration.spec.ts`, `test/app.module.spec.ts`, `test/security.spec.ts`, `test/environment.schema.spec.ts`.

Shared: modify `packages/contracts/src/index.ts`; create `packages/api-client/src/http.ts`, `packages/api-client/src/admin.ts`; modify `packages/api-client/src/index.ts`; regenerate `packages/api-client/openapi.json`.

Web: modify `apps/web/src/features/chat/model-selector.tsx`, `model-selector.test.tsx`, `chat.types.ts`, `chat-page.tsx`, `chat-page.test.tsx`, `apps/web/src/test/fixtures.ts`.

Admin (`apps/admin`, new): `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.mjs`, `src/main.tsx`, `src/app.tsx`, `src/styles.css`, `src/lib/api.ts`, `src/lib/format.ts`, `src/test/*`, `src/components/*`, `src/features/{auth,users,anonymous,models}/*`.

Root: `package.json` (`admin` script), `.env.example`, `README.md`.

---

### Task 1: Schema & migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261001120000_usage_log_admin_and_model_flags/migration.sql`
- Test: `apps/api/test/persistence.integration.spec.ts` (append cases)

**Interfaces:**
- Produces: Prisma models `UsageLog` (`prisma.usageLog`), `Admin` (`prisma.admin`), `AdminSession` (`prisma.adminSession`), enum `UsageKind`, `Model.is_available`, `Model.is_default`, relations `User.usage_logs`, `AnonymousSession.usage_logs`, `Chat.usage_logs`, `Model.usage_logs`.

- [ ] **Step 1: Write failing persistence tests** — append inside the `describe('persistence foundation')` block of `apps/api/test/persistence.integration.spec.ts`:

```ts
  it('allows only one default model and never an unavailable default', async () => {
    const name = `test-model-${randomBytes(4).toString('hex')}`;
    const extra = await prisma.model.create({
      data: { name, max_context: 4096 },
    });
    try {
      await expect(
        prisma.model.update({
          where: { id: extra.id },
          data: { is_default: true },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.model.update({
          where: { id: model_id },
          data: { is_available: false },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.model.delete({ where: { id: extra.id } });
    }
  });

  it('keeps usage rows when their chat is deleted', async () => {
    const session = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'Usage keep',
        selected_model_id: model_id,
      },
    });
    const row = await prisma.usageLog.create({
      data: {
        anonymous_session_id: session.id,
        chat_id: chat.id,
        model_id,
        kind: 'CHAT',
        input_tokens: 10,
        output_tokens: 5,
      },
    });
    await prisma.chat.delete({ where: { id: chat.id } });
    const kept = await prisma.usageLog.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(kept.chat_id).toBeNull();
    expect(kept.anonymous_session_id).toBe(session.id);
    await prisma.usageLog.delete({ where: { id: row.id } });
  });

  it('rejects negative token counts', async () => {
    const session = await createAnonymousSession();
    await expect(
      prisma.usageLog.create({
        data: {
          anonymous_session_id: session.id,
          model_id,
          kind: 'SUMMARY',
          input_tokens: -1,
          output_tokens: 0,
        },
      }),
    ).rejects.toThrow();
  });
```

(The qwen row is the seeded default — the migration in Step 3 makes it so. `model_id` already holds its id.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/api exec jest test/persistence.integration.spec.ts`
Expected: FAIL — TypeScript/Prisma errors (`usageLog` does not exist on PrismaService, `is_default` unknown).

- [ ] **Step 3: Update the schema** — in `apps/api/prisma/schema.prisma`:

Add after `enum TokenCountSource { … }`:

```prisma
enum UsageKind {
  CHAT
  SUMMARY
}
```

Replace `model Model { … }` with:

```prisma
model Model {
  id           String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name         String     @unique @db.VarChar(200)
  max_context  Int
  is_available Boolean    @default(true)
  is_default   Boolean    @default(false)
  created_at   DateTime   @default(now()) @db.Timestamptz(3)
  updated_at   DateTime   @updatedAt @db.Timestamptz(3)
  chats        Chat[]     @relation("model_chats")
  usage_logs   UsageLog[] @relation("model_usage_logs")

  @@map("model")
}
```

Add `usage_logs UsageLog[] @relation("user_usage_logs")` to `User`, `usage_logs UsageLog[] @relation("anonymous_session_usage_logs")` to `AnonymousSession`, `usage_logs UsageLog[] @relation("chat_usage_logs")` to `Chat` (align columns like the surrounding fields).

Append at the end of the file:

```prisma
model UsageLog {
  id                   String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  user_id              String?           @db.Uuid
  anonymous_session_id String?           @db.Uuid
  chat_id              String?           @db.Uuid
  model_id             String            @db.Uuid
  kind                 UsageKind
  input_tokens         Int
  output_tokens        Int
  created_at           DateTime          @default(now()) @db.Timestamptz(3)
  user                 User?             @relation("user_usage_logs", fields: [user_id], references: [id], onDelete: SetNull)
  anonymous_session    AnonymousSession? @relation("anonymous_session_usage_logs", fields: [anonymous_session_id], references: [id], onDelete: SetNull)
  chat                 Chat?             @relation("chat_usage_logs", fields: [chat_id], references: [id], onDelete: SetNull)
  model                Model             @relation("model_usage_logs", fields: [model_id], references: [id], onDelete: Restrict)

  @@index([user_id, created_at])
  @@index([anonymous_session_id, created_at])
  @@index([created_at])
  @@index([model_id])
  @@map("usage_log")
}

model Admin {
  id              String         @id @default(dbgenerated("uuidv7()")) @db.Uuid
  email           String         @unique @db.VarChar(320)
  password_hash   String         @db.Text
  display_name    String?        @db.VarChar(100)
  last_sign_in_at DateTime?      @db.Timestamptz(3)
  created_at      DateTime       @default(now()) @db.Timestamptz(3)
  updated_at      DateTime       @updatedAt @db.Timestamptz(3)
  sessions        AdminSession[] @relation("admin_sessions")

  @@map("admin")
}

model AdminSession {
  id                 String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  admin_id           String    @db.Uuid
  refresh_token_hash String    @unique @db.Char(64)
  refresh_jti        String    @unique @default(dbgenerated("uuidv7()")) @db.Uuid
  expires_at         DateTime  @db.Timestamptz(3)
  revoked_at         DateTime? @db.Timestamptz(3)
  created_at         DateTime  @default(now()) @db.Timestamptz(3)
  last_used_at       DateTime  @default(now()) @db.Timestamptz(3)
  admin              Admin     @relation("admin_sessions", fields: [admin_id], references: [id], onDelete: Cascade)

  @@index([admin_id])
  @@index([expires_at])
  @@map("admin_session")
}
```

- [ ] **Step 4: Write the migration** — `apps/api/prisma/migrations/20261001120000_usage_log_admin_and_model_flags/migration.sql`:

```sql
-- Model availability and the single default model.
ALTER TABLE "model" ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "model" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "model" ADD CONSTRAINT "model_default_is_available_check"
    CHECK (NOT "is_default" OR "is_available");
CREATE UNIQUE INDEX "model_single_default" ON "model" ("is_default") WHERE "is_default";

-- Seed the historical default; the API seeds from OLLAMA_DEFAULT_MODEL when absent.
UPDATE "model" SET "is_default" = true WHERE "name" = 'qwen2.5:1.5b';

-- Append-only usage log, kept when chats or owners are deleted.
CREATE TYPE "UsageKind" AS ENUM ('CHAT', 'SUMMARY');

CREATE TABLE "usage_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "chat_id" UUID,
    "model_id" UUID NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_log_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0)
);

CREATE INDEX "usage_log_user_id_created_at_idx" ON "usage_log"("user_id", "created_at");
CREATE INDEX "usage_log_anonymous_session_id_created_at_idx" ON "usage_log"("anonymous_session_id", "created_at");
CREATE INDEX "usage_log_created_at_idx" ON "usage_log"("created_at");
CREATE INDEX "usage_log_model_id_idx" ON "usage_log"("model_id");

ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_anonymous_session_id_fkey"
    FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_model_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admin accounts with their own refresh sessions.
CREATE TABLE "admin" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100),
    "last_sign_in_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

CREATE TABLE "admin_session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "refresh_jti" UUID NOT NULL DEFAULT uuidv7(),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_session_refresh_token_hash_key" ON "admin_session"("refresh_token_hash");
CREATE UNIQUE INDEX "admin_session_refresh_jti_key" ON "admin_session"("refresh_jti");
CREATE INDEX "admin_session_admin_id_idx" ON "admin_session"("admin_id");
CREATE INDEX "admin_session_expires_at_idx" ON "admin_session"("expires_at");
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Generate client, apply, verify no drift**

Run: `pnpm --filter @js-rag-stack/api prisma:generate && pnpm --filter @js-rag-stack/api prisma:migrate:deploy && pnpm --filter @js-rag-stack/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
Expected: generate + deploy succeed; the diff prints an empty migration (only comments). If it prints statements, adjust the SQL (not the schema) until empty — except the partial unique index and CHECK constraints, which Prisma can't express and may appear as nothing (that is fine).

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @js-rag-stack/api exec jest test/persistence.integration.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/test/persistence.integration.spec.ts
git commit -m "feat(api): add usage_log, admin tables and model availability flags"
```

---

### Task 2: `PasswordHasher` abstraction

**Files:**
- Create: `apps/api/src/common/security/password-hasher.ts`
- Modify: `apps/api/src/common/security/security.module.ts`, `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/test/security.spec.ts` (append), `apps/api/test/auth.integration.spec.ts` (constructor update)

**Interfaces:**
- Produces: `abstract class PasswordHasher { hash(plain: string): Promise<string>; verify(params: { hash: string; plain: string }): Promise<boolean> }`, `class Argon2PasswordHasher extends PasswordHasher`, provided globally as `{ provide: PasswordHasher, useClass: Argon2PasswordHasher }`.

- [ ] **Step 1: Failing test** — append to `apps/api/test/security.spec.ts`:

```ts
import { Argon2PasswordHasher } from '../src/common/security/password-hasher';

describe('Argon2PasswordHasher', () => {
  it('hashes with argon2id and verifies', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(
      hasher.verify({ hash, plain: 'correct horse battery' }),
    ).resolves.toBe(true);
    await expect(hasher.verify({ hash, plain: 'wrong' })).resolves.toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(
      new Argon2PasswordHasher().verify({ hash: 'not-a-hash', plain: 'x' }),
    ).resolves.toBe(false);
  });
});
```

(Put the import at the top of the file with the others.)

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/security.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `apps/api/src/common/security/password-hasher.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(params: { hash: string; plain: string }): Promise<boolean>;
}

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify({ hash, plain }: { hash: string; plain: string }) {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
```

`security.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { Argon2PasswordHasher, PasswordHasher } from './password-hasher';

@Global()
@Module({
  providers: [
    CsrfService,
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
  ],
  exports: [CsrfService, PasswordHasher],
})
export class SecurityModule {}
```

In `auth.service.ts`: remove `import * as argon2 from 'argon2';`, inject `private readonly passwords: PasswordHasher` (import from `../common/security/password-hasher`) as the **last constructor parameter before `config`**, replace the `argon2.hash(...)` call with `await this.passwords.hash(input.password)` and the verify with `!(await this.passwords.verify({ hash: user.password_hash, plain: input.password }))`.

In `test/auth.integration.spec.ts`, add `new Argon2PasswordHasher()` to the `new AuthService(...)` call in the matching position (before `config`).

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/api exec jest test/security.spec.ts test/auth.integration.spec.ts && pnpm --filter @js-rag-stack/api typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/security apps/api/src/auth/auth.service.ts apps/api/test/security.spec.ts apps/api/test/auth.integration.spec.ts
git commit -m "refactor(api): extract PasswordHasher abstraction"
```

---

### Task 3: `ModelsModule` — catalog, seeding, public `/models`, unavailable models blocked

**Files:**
- Create: `apps/api/src/models/models.module.ts`, `models.repository.ts`, `model-catalog.service.ts`, `model-default.seeder.ts`, `models.controller.ts`, `models.types.ts`, `models/models-response.dto.ts`
- Delete: `apps/api/src/ollama/models.repository.ts`, `apps/api/src/ollama/models.controller.ts`, `apps/api/src/ollama/models/models-response.dto.ts`
- Modify: `apps/api/src/ollama/ollama.module.ts`, `ollama.service.ts`, `ollama.types.ts` (drop `OllamaModel` if now unused), `apps/api/src/chats/chats.module.ts`, `chats.service.ts`, `chat-stream.service.ts`, `chats.helpers.ts`, `models/chat-response.dto.ts`, `apps/api/src/app.module.ts`, `packages/contracts/src/index.ts`
- Test: create `apps/api/test/models.integration.spec.ts`; modify `apps/api/test/phase4.spec.ts`, `apps/api/test/app.module.spec.ts`

**Interfaces:**
- Consumes: `OllamaService.listInstalledModels(): Promise<string[]>` (renamed passthrough, see Step 3).
- Produces:
  - `ModelsRepository` (internal to ModelsModule): `findAll(): Promise<Model[]>`, `findByName(name: string): Promise<Model | null>`, `findById(id: string): Promise<Model | null>`, `findDefault(): Promise<Model | null>`, `create(data: CreateModelRecord): Promise<Model>`, `update(params: { id: string; data: UpdateModelRecord }): Promise<Model>`, `setDefault(id: string): Promise<Model>`, `seedDefault(params: { name: string; maxContext: number }): Promise<Model>`.
  - `ModelCatalogService` (exported): `listSelectable(): Promise<ModelInfo[]>`, `resolveForGeneration(name: string): Promise<Model>` (throws `OllamaError` — see Errors below).
  - Errors: `ModelCatalogService` throws the existing `OllamaError` with codes `MODEL_NOT_ALLOWED` (400) / `MODEL_NOT_AVAILABLE` (409) — both codes already exist in `OllamaErrorCode` and are mapped by `ApiExceptionFilter`. No new error class.
  - `ChatSummary.selectedModelAvailable: boolean` in contracts.

- [ ] **Step 1: Failing integration test** — create `apps/api/test/models.integration.spec.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { ModelCatalogService } from '../src/models/model-catalog.service';
import { ModelDefaultSeeder } from '../src/models/model-default.seeder';
import { ModelsRepository } from '../src/models/models.repository';
import { OllamaError } from '../src/ollama/ollama.errors';
import { PrismaService } from '../src/prisma/prisma.service';

describe('model catalog', () => {
  let prisma: PrismaService;
  let repository: ModelsRepository;
  let config: ConfigService<AppEnvironment, true>;
  const created: string[] = [];
  const installed = jest.fn<Promise<string[]>, []>();

  function catalog() {
    return new ModelCatalogService(repository, {
      listInstalledModels: installed,
    } as never);
  }

  async function createModel(overrides: { is_available?: boolean } = {}) {
    const model = await prisma.model.create({
      data: {
        name: `test-${randomBytes(4).toString('hex')}`,
        max_context: 4096,
        ...overrides,
      },
    });
    created.push(model.id);
    return model;
  }

  beforeAll(async () => {
    config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    repository = new ModelsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.model.deleteMany({ where: { id: { in: created } } });
    await prisma.onApplicationShutdown();
  });

  it('lists only available and installed models, flagging the DB default', async () => {
    const available = await createModel();
    const disabled = await createModel({ is_available: false });
    installed.mockResolvedValue([
      'qwen2.5:1.5b',
      available.name,
      disabled.name,
    ]);

    const names = (await catalog().listSelectable()).map((m) => m.name);
    expect(names).toContain(available.name);
    expect(names).not.toContain(disabled.name);
    const qwen = (await catalog().listSelectable()).find(
      (m) => m.name === 'qwen2.5:1.5b',
    );
    expect(qwen).toEqual({ name: 'qwen2.5:1.5b', default: true, maxContext: expect.any(Number) as number });
  });

  it('rejects unknown and disabled models for generation', async () => {
    const disabled = await createModel({ is_available: false });
    await expect(catalog().resolveForGeneration('nope:1b')).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
      status: 400,
    });
    const error = await catalog()
      .resolveForGeneration(disabled.name)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect(error).toMatchObject({ code: 'MODEL_NOT_AVAILABLE', status: 409 });
  });

  it('seeds the env default only when no default exists', async () => {
    const seeder = new ModelDefaultSeeder(repository, config);
    await seeder.onApplicationBootstrap();
    const defaults = await prisma.model.findMany({ where: { is_default: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe('qwen2.5:1.5b');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/models.integration.spec.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement ModelsModule.**

`apps/api/src/models/models.types.ts`:

```ts
export interface CreateModelRecord {
  name: string;
  max_context: number;
  is_available: boolean;
}

export interface UpdateModelRecord {
  max_context?: number;
  is_available?: boolean;
}

export interface SeedDefaultModelParams {
  name: string;
  maxContext: number;
}

export interface UpdateModelRecordParams {
  id: string;
  data: UpdateModelRecord;
}
```

`apps/api/src/models/models.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Model } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateModelRecord,
  SeedDefaultModelParams,
  UpdateModelRecordParams,
} from './models.types';

@Injectable()
export class ModelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Model[]> {
    return this.prisma.model.findMany({ orderBy: { name: 'asc' } });
  }

  findByName(name: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { name } });
  }

  findById(id: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { id } });
  }

  findDefault(): Promise<Model | null> {
    return this.prisma.model.findFirst({ where: { is_default: true } });
  }

  create(data: CreateModelRecord): Promise<Model> {
    return this.prisma.model.create({ data });
  }

  update({ id, data }: UpdateModelRecordParams): Promise<Model> {
    return this.prisma.model.update({ where: { id }, data });
  }

  // Clear-then-set in one transaction; the partial unique index rejects a
  // concurrent second default, so the loser's transaction fails cleanly.
  setDefault(id: string): Promise<Model> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.model.updateMany({
        where: { is_default: true, NOT: { id } },
        data: { is_default: false },
      });
      return transaction.model.update({
        where: { id },
        data: { is_default: true, is_available: true },
      });
    });
  }

  async seedDefault({ name, maxContext }: SeedDefaultModelParams): Promise<Model> {
    const model = await this.prisma.model.upsert({
      where: { name },
      create: { name, max_context: maxContext },
      update: {},
    });
    return this.setDefault(model.id);
  }
}
```

`apps/api/src/models/model-catalog.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { ModelInfo } from '@js-rag-stack/contracts';
import type { Model } from '../generated/prisma/client';
import { OllamaError } from '../ollama/ollama.errors';
import { OllamaService } from '../ollama/ollama.service';
import { ModelsRepository } from './models.repository';

@Injectable()
export class ModelCatalogService {
  constructor(
    private readonly models: ModelsRepository,
    private readonly ollama: OllamaService,
  ) {}

  async listSelectable(): Promise<ModelInfo[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.ollama.listInstalledModels(),
    ]);
    const installedNames = new Set(installed);
    return models
      .filter((model) => model.is_available && installedNames.has(model.name))
      .map((model) => ({
        name: model.name,
        default: model.is_default,
        maxContext: model.max_context,
      }));
  }

  async resolveForGeneration(name: string): Promise<Model> {
    const model = await this.models.findByName(name);

    if (!model) {
      throw new OllamaError(
        'MODEL_NOT_ALLOWED',
        'The selected model is not allowed.',
        400,
      );
    }

    if (!model.is_available) {
      throw new OllamaError(
        'MODEL_NOT_AVAILABLE',
        'The selected model is no longer available. Choose another model.',
        409,
      );
    }

    return model;
  }
}
```

`apps/api/src/models/model-default.seeder.ts`:

```ts
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { ModelsRepository } from './models.repository';

const SEED_MAX_CONTEXT = 8192;

@Injectable()
export class ModelDefaultSeeder implements OnApplicationBootstrap {
  private readonly seedName: string;

  constructor(
    private readonly models: ModelsRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.seedName = config.get('OLLAMA_DEFAULT_MODEL', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (await this.models.findDefault()) return;
    await this.models.seedDefault({
      name: this.seedName,
      maxContext: SEED_MAX_CONTEXT,
    });
  }
}
```

Move `ModelsController` to `apps/api/src/models/models.controller.ts` (same route/decorators), injecting `ModelCatalogService` and returning `{ models: await this.catalog.listSelectable() }`. Move `models-response.dto.ts` to `apps/api/src/models/models/models-response.dto.ts` unchanged.

`apps/api/src/models/models.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module';
import { ModelCatalogService } from './model-catalog.service';
import { ModelDefaultSeeder } from './model-default.seeder';
import { ModelsController } from './models.controller';
import { ModelsRepository } from './models.repository';

@Module({
  imports: [OllamaModule],
  controllers: [ModelsController],
  providers: [ModelsRepository, ModelCatalogService, ModelDefaultSeeder],
  exports: [ModelCatalogService],
})
export class ModelsModule {}
```

(Task 5 adds `ModelAdministrationService` to providers/exports.)

Slim `apps/api/src/ollama/ollama.service.ts` down to the LLM client facade — no model table, no config, no bootstrap:

```ts
import { Injectable } from '@nestjs/common';
import { OllamaClientService } from './ollama-client.service';
import type {
  CompleteOllamaChatParams,
  OllamaCompletion,
  StreamOllamaChatParams,
} from './ollama.types';

@Injectable()
export class OllamaService {
  constructor(private readonly client: OllamaClientService) {}

  listInstalledModels(): Promise<string[]> {
    return this.client.listInstalledModels();
  }

  streamChat(params: StreamOllamaChatParams) {
    return this.client.streamChat(params);
  }

  complete(params: CompleteOllamaChatParams): Promise<OllamaCompletion> {
    return this.client.complete(params);
  }

  async ping(): Promise<void> {
    await this.client.listInstalledModels();
  }
}
```

`ollama.module.ts`: `providers: [OllamaClientService, OllamaService], exports: [OllamaService]`, no controllers. Remove `OllamaModel` from `ollama.types.ts` if nothing references it (`grep -rn OllamaModel apps/api/src`).

Chats: `chats.module.ts` imports `ModelsModule` (keep `OllamaModule` — ContextWindow/ChatStream still stream/complete). In `chats.service.ts` replace the `OllamaService` dependency with `private readonly catalog: ModelCatalogService` and both `this.ollama.assertAllowed(...)` calls with `this.catalog.resolveForGeneration(...)` (create **and** update both reject disabled models). In `chat-stream.service.ts` add `private readonly catalog: ModelCatalogService` as the parameter right after `ollama`, and replace `this.ollama.assertAllowed(` with `this.catalog.resolveForGeneration(`.

`app.module.ts`: add `ModelsModule` to imports after `OllamaModule`.

Contracts — in `packages/contracts/src/index.ts` add to `ChatSummary`: `selectedModelAvailable: boolean;`. In `chats.helpers.ts` `toChatSummary` add `selectedModelAvailable: chat.selected_model.is_available,`. In `src/chats/models/chat-response.dto.ts` add to the summary DTO class:

```ts
  @ApiProperty()
  selectedModelAvailable!: boolean;
```

- [ ] **Step 4: Update existing tests.**
  - `test/phase4.spec.ts`: the two tests `lists installed models that have a model row…` and `fails bootstrap when the default model has no model row` move out — delete them (covered by `models.integration.spec.ts`). Every `new ChatStreamService(` call gets a `catalog` argument right after the `ollama` argument: `{ resolveForGeneration: jest.fn().mockResolvedValue(createModelRecord()) } as never`, and remove `assertAllowed` from those `ollama` mocks. `new ChatsService(` calls: replace the `ollama` argument with `catalog` (`{ resolveForGeneration: jest.fn().mockResolvedValue(createModelRecord()) }`), and update assertions `expect(ollama.assertAllowed)` → `expect(catalog.resolveForGeneration)`; delete `assertAvailable` expectations. `createModelRecord()` must include `is_available: true, is_default: true`.
  - `test/context-window.service.spec.ts` `model()` helper: add `is_available: true, is_default: true`.
  - `test/app.module.spec.ts`: import `ModelsRepository` from `../src/models/models.repository`; mock adds `findDefault: jest.fn().mockResolvedValue({ name: 'qwen2.5:1.5b' })`.
  - Add a phase4 test that a stream with a disabled model fails before any lock is taken:

```ts
  it('rejects streaming with a disabled model before locking', async () => {
    const locks = { acquirePrincipalGenerationLock: jest.fn(), acquireGenerationLock: jest.fn() };
    const service = new ChatStreamService(
      {} as never,
      { findOwnedChat: jest.fn().mockResolvedValue(createChatRecord()) } as never,
      {} as never,
      locks as never,
      {} as never,
      {
        resolveForGeneration: jest.fn().mockRejectedValue(
          new OllamaError('MODEL_NOT_AVAILABLE', 'gone', 409),
        ),
      } as never,
      { assertContentFits: jest.fn() } as never,
      {} as never,
      config,
    );
    await expect(
      service.stream({
        chatId: 'chat-id',
        principal: { type: 'anonymous', anonymous_session_id: 'a' },
        content: 'hi',
        signal: new AbortController().signal,
        emit: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_AVAILABLE' });
    expect(locks.acquirePrincipalGenerationLock).not.toHaveBeenCalled();
  });
```

  Use the file's existing chat-record helper (look for how other ChatStreamService tests build `findOwnedChat`'s return; reuse it instead of `createChatRecord` if named differently). The constructor argument order is: `repository, ownership, history, locks, ollama, catalog, contextWindow, usage, config` — `usage` is added in Task 4; **in this task omit the `{} as never` usage slot** (8 args) and Task 4 adds it.

- [ ] **Step 5: Run** `pnpm --filter @js-rag-stack/api exec jest && pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/web typecheck` — Expected: PASS. (Web typecheck may fail where fixtures build `ChatSummary`; add `selectedModelAvailable: true` to `makeChat` in `apps/web/src/test/fixtures.ts`.)

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src apps/api/test packages/contracts apps/web/src/test/fixtures.ts
git commit -m "refactor(api): extract ModelsModule with DB default and availability"
```

---

### Task 4: `UsageModule` — recording and anonymous transfer

**Files:**
- Create: `apps/api/src/usage/usage.module.ts`, `usage.repository.ts`, `usage-recorder.service.ts`, `usage-transfer.service.ts`, `usage.types.ts`, `usage.helpers.ts`
- Modify: `apps/api/src/chats/chats.module.ts`, `chat-stream.service.ts`, `context-window.service.ts`, `chats.types.ts`; `apps/api/src/auth/auth.module.ts`, `auth.repository.ts`, `auth.types.ts`; `apps/api/src/app.module.ts`
- Test: create `apps/api/test/usage.integration.spec.ts`; modify `test/phase4.spec.ts`, `test/context-window.service.spec.ts`, `test/auth.integration.spec.ts`

**Interfaces:**
- Consumes: `RequestPrincipal`, Prisma `UsageKind`, `Prisma.TransactionClient`.
- Produces:
  - `type UsageOwner = { type: 'user'; id: string } | { type: 'anonymous'; id: string }` (in `usage.types.ts`)
  - `toUsageOwner(principal: RequestPrincipal): UsageOwner`, `toOwnerColumns(owner: UsageOwner): { user_id: string | null; anonymous_session_id: string | null }` (in `usage.helpers.ts`)
  - `UsageRecorderService.record(params: RecordUsageParams): Promise<void>` — never throws.
  - `interface RecordUsageParams { principal: RequestPrincipal; chatId: string | null; modelId: string; kind: UsageKind; inputTokens?: number; outputTokens?: number }`
  - `UsageTransferService.reassignAnonymousUsage(params: { transaction: Prisma.TransactionClient; anonymousSessionId: string; userId: string }): Promise<void>`
  - `UsageRepository` (internal): `create(data: CreateUsageRecord): Promise<void>`, `reassignAnonymous(params)`, plus read methods added in Task 8.
  - `BuildPromptParams.principal: RequestPrincipal` (new field).

- [ ] **Step 1: Failing integration test** — `apps/api/test/usage.integration.spec.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AnonymousSessionsRepository } from '../src/anonymous-sessions/anonymous-sessions.repository';
import { AnonymousSessionsService } from '../src/anonymous-sessions/anonymous-sessions.service';
import { AuthCookieService } from '../src/auth/auth-cookie.service';
import { AuthRepository } from '../src/auth/auth.repository';
import { AuthService } from '../src/auth/auth.service';
import { ChatHistoryService } from '../src/chats/chat-history.service';
import { ChatsRepository } from '../src/chats/chats.repository';
import { RedisLockService } from '../src/chats/redis-lock.service';
import { Argon2PasswordHasher } from '../src/common/security/password-hasher';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { UsageRecorderService } from '../src/usage/usage-recorder.service';
import { UsageRepository } from '../src/usage/usage.repository';
import { UsageTransferService } from '../src/usage/usage-transfer.service';

describe('usage recording', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let recorder: UsageRecorderService;
  let auth: AuthService;
  let anonymousSessions: AnonymousSessionsService;
  let model_id: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        COOKIE_SECURE: 'false',
      }),
    );
    prisma = new PrismaService(config);
    redis = new RedisService(config);
    const usageRepository = new UsageRepository(prisma);
    recorder = new UsageRecorderService(usageRepository);
    anonymousSessions = new AnonymousSessionsService(
      new AnonymousSessionsRepository(prisma),
      config,
    );
    const chats = new ChatsRepository(prisma);
    const locks = new RedisLockService(redis, config);
    auth = new AuthService(
      new AuthRepository(prisma, new UsageTransferService(usageRepository)),
      new JwtService(),
      new AuthCookieService(config),
      anonymousSessions,
      new ChatHistoryService(chats, redis, locks, config),
      new Argon2PasswordHasher(),
      config,
    );
    await prisma.onModuleInit();
    await redis.onModuleInit();
    model_id = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.usageLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await redis.onApplicationShutdown();
    await prisma.onApplicationShutdown();
  });

  function response(): Response {
    return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  }

  function request(): Request {
    return { get: () => undefined, ip: '127.0.0.1' } as unknown as Request;
  }

  async function anonymousWithUsage() {
    const principal = await anonymousSessions.create(response());
    await recorder.record({
      principal,
      chatId: null,
      modelId: model_id,
      kind: 'CHAT',
      inputTokens: 100,
      outputTokens: 20,
    });
    await recorder.record({
      principal,
      chatId: null,
      modelId: model_id,
      kind: 'SUMMARY',
      inputTokens: 50,
      outputTokens: undefined,
    });
    return principal;
  }

  it('records chat and summary rows for an anonymous principal, missing counts as 0', async () => {
    const principal = await anonymousWithUsage();
    const rows = await prisma.usageLog.findMany({
      where: { anonymous_session_id: principal.anonymous_session_id },
      orderBy: { created_at: 'asc' },
    });
    expect(rows.map((r) => [r.kind, r.input_tokens, r.output_tokens])).toEqual([
      ['CHAT', 100, 20],
      ['SUMMARY', 50, 0],
    ]);
    await prisma.anonymousSession.delete({ where: { id: principal.anonymous_session_id } });
  });

  it('never throws when the write fails', async () => {
    await expect(
      recorder.record({
        principal: { type: 'anonymous', anonymous_session_id: '00000000-0000-7000-8000-000000000000' },
        chatId: null,
        modelId: model_id,
        kind: 'CHAT',
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('moves anonymous usage to the user on sign-up', async () => {
    const principal = await anonymousWithUsage();
    const user = await auth.signUp({
      input: {
        email: `usage-${randomBytes(6).toString('hex')}@example.com`,
        password: 'a-long-enough-password',
      },
      principal,
      request: request(),
      response: response(),
    });
    userIds.push(user.id);
    const rows = await prisma.usageLog.findMany({ where: { user_id: user.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.anonymous_session_id === null)).toBe(true);
  });

  it('moves anonymous usage to the user on sign-in', async () => {
    const email = `usage-${randomBytes(6).toString('hex')}@example.com`;
    const user = await auth.signUp({
      input: { email, password: 'a-long-enough-password' },
      request: request(),
      response: response(),
    });
    userIds.push(user.id);
    const principal = await anonymousWithUsage();
    await auth.signIn({
      input: { email, password: 'a-long-enough-password' },
      principal,
      request: request(),
      response: response(),
    });
    expect(await prisma.usageLog.count({ where: { user_id: user.id } })).toBe(2);
  });
});
```

If `AnonymousSessionsService.create` or `Request` usage differs (check `auth.integration.spec.ts` helpers `createResponse`/`createRequest`), reuse those helpers' shapes instead of the minimal ones above.

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/usage.integration.spec.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement UsageModule.**

`apps/api/src/usage/usage.types.ts`:

```ts
import type { RequestPrincipal } from '../common/models/request-principal';
import type { Prisma, UsageKind } from '../generated/prisma/client';

export type UsageOwner =
  | { type: 'user'; id: string }
  | { type: 'anonymous'; id: string };

export interface OwnerColumns {
  user_id: string | null;
  anonymous_session_id: string | null;
}

export interface RecordUsageParams {
  principal: RequestPrincipal;
  chatId: string | null;
  modelId: string;
  kind: UsageKind;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CreateUsageRecord extends OwnerColumns {
  chat_id: string | null;
  model_id: string;
  kind: UsageKind;
  input_tokens: number;
  output_tokens: number;
}

export interface ReassignAnonymousUsageParams {
  transaction: Prisma.TransactionClient;
  anonymousSessionId: string;
  userId: string;
}
```

`apps/api/src/usage/usage.helpers.ts`:

```ts
import type { RequestPrincipal } from '../common/models/request-principal';
import type { OwnerColumns, UsageOwner } from './usage.types';

export function toUsageOwner(principal: RequestPrincipal): UsageOwner {
  return principal.type === 'authenticated'
    ? { type: 'user', id: principal.user_id }
    : { type: 'anonymous', id: principal.anonymous_session_id };
}

export function toOwnerColumns(owner: UsageOwner): OwnerColumns {
  return owner.type === 'user'
    ? { user_id: owner.id, anonymous_session_id: null }
    : { user_id: null, anonymous_session_id: owner.id };
}

export function toTokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}
```

`apps/api/src/usage/usage.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateUsageRecord,
  ReassignAnonymousUsageParams,
} from './usage.types';

@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUsageRecord): Promise<void> {
    await this.prisma.usageLog.create({ data, select: { id: true } });
  }

  async reassignAnonymous({
    transaction,
    anonymousSessionId,
    userId,
  }: ReassignAnonymousUsageParams): Promise<void> {
    await transaction.usageLog.updateMany({
      where: { anonymous_session_id: anonymousSessionId },
      data: { anonymous_session_id: null, user_id: userId },
    });
  }
}
```

`apps/api/src/usage/usage-recorder.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { getErrorMessage } from '../common/utils/error';
import { toOwnerColumns, toTokenCount, toUsageOwner } from './usage.helpers';
import { UsageRepository } from './usage.repository';
import type { RecordUsageParams } from './usage.types';

@Injectable()
export class UsageRecorderService {
  private readonly logger = new Logger(UsageRecorderService.name);

  constructor(private readonly usage: UsageRepository) {}

  // Usage logging must never break a user's generation.
  async record(params: RecordUsageParams): Promise<void> {
    try {
      await this.usage.create({
        ...toOwnerColumns(toUsageOwner(params.principal)),
        chat_id: params.chatId,
        model_id: params.modelId,
        kind: params.kind,
        input_tokens: toTokenCount(params.inputTokens),
        output_tokens: toTokenCount(params.outputTokens),
      });
    } catch (error) {
      this.logger.warn(`Usage record failed: ${getErrorMessage(error)}`);
    }
  }
}
```

`apps/api/src/usage/usage-transfer.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { UsageRepository } from './usage.repository';
import type { ReassignAnonymousUsageParams } from './usage.types';

@Injectable()
export class UsageTransferService {
  constructor(private readonly usage: UsageRepository) {}

  reassignAnonymousUsage(params: ReassignAnonymousUsageParams): Promise<void> {
    return this.usage.reassignAnonymous(params);
  }
}
```

`apps/api/src/usage/usage.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UsageRecorderService } from './usage-recorder.service';
import { UsageRepository } from './usage.repository';
import { UsageTransferService } from './usage-transfer.service';

@Module({
  providers: [UsageRepository, UsageRecorderService, UsageTransferService],
  exports: [UsageRecorderService, UsageTransferService],
})
export class UsageModule {}
```

(Task 8 adds `UsageReportingService`.) Add `UsageModule` to `app.module.ts` imports.

**Auth wiring:** `auth.module.ts` imports `UsageModule`. `AuthRepository` constructor becomes `constructor(private readonly prisma: PrismaService, private readonly usageTransfer: UsageTransferService) {}`. In `transferAnonymousChats`, insert **before** `transaction.anonymousSession.deleteMany(...)`:

```ts
    // Must run before the session row is deleted: usage FKs are SET NULL.
    await this.usageTransfer.reassignAnonymousUsage({
      transaction,
      anonymousSessionId,
      userId,
    });
```

Update `test/auth.integration.spec.ts`: `new AuthRepository(prisma, new UsageTransferService(new UsageRepository(prisma)))`.

**Chats wiring:** `chats.module.ts` imports `UsageModule`. In `chats.types.ts` add `principal: RequestPrincipal;` to `BuildPromptParams` and `SummarizeParams` (both interfaces live in that file — search for them). 

`chat-stream.service.ts`: add constructor param `private readonly usage: UsageRecorderService` after `contextWindow`; pass `principal` into `this.contextWindow.buildPrompt({ … principal, … })`; right after `const completed = await this.repository.completeGeneration({...});` add:

```ts
      await this.usage.record({
        principal,
        chatId,
        modelId: selectedModel.id,
        kind: 'CHAT',
        inputTokens: finalChunk.promptTokens,
        outputTokens: finalChunk.completionTokens,
      });
```

`context-window.service.ts`: add constructor param `private readonly usage: UsageRecorderService` after `ollama`; destructure `principal` in `buildPrompt` and pass it to `this.summarize({ … principal })`; in `summarize`, immediately after the `this.ollama.complete(...)` call resolves (before the degenerate check — the tokens were spent either way), add:

```ts
      await this.usage.record({
        principal,
        chatId,
        modelId: model.id,
        kind: 'SUMMARY',
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
      });
```

- [ ] **Step 4: Update unit tests.**
  - `test/phase4.spec.ts`: every `new ChatStreamService(` gets `usage` after `contextWindow` and before `config`: `{ record: jest.fn().mockResolvedValue(undefined) } as never`. Every `buildPrompt` expectation that matched exact params now includes `principal`. In the existing "completes a stream" test (the one that asserts `completeGeneration`), assert:

```ts
    expect(usage.record).toHaveBeenCalledWith({
      principal,
      chatId: 'chat-id',
      modelId: createModelRecord().id,
      kind: 'CHAT',
      inputTokens: expect.any(Number) as number,
      outputTokens: expect.any(Number) as number,
    });
```

  (bind the mock to a `const usage = { record: jest.fn() }` and use the test's actual principal/chat id variables.) In the cancelled-stream test assert `expect(usage.record).not.toHaveBeenCalled()`.
  - `test/context-window.service.spec.ts`: `new ContextWindowService(` gets `usage` after the ollama mock; `buildPrompt` calls pass `principal: { type: 'anonymous', anonymous_session_id: 'anon' }`. Add to the test that summarizes a large backlog in chunks: `expect(usage.record).toHaveBeenCalledTimes(<number of ollama.complete calls>)` with `kind: 'SUMMARY'` — use `ollama.complete.mock.calls.length` for the count.

- [ ] **Step 5: Run** `pnpm --filter @js-rag-stack/api exec jest && pnpm --filter @js-rag-stack/api typecheck` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src apps/api/test
git commit -m "feat(api): record per-call token usage and transfer it on sign-up"
```

---
### Task 5: `ModelAdministrationService` — create / edit / availability / default rules

**Files:**
- Create: `apps/api/src/models/model-administration.service.ts`, `apps/api/src/models/models.helpers.ts`
- Modify: `apps/api/src/models/models.module.ts`, `apps/api/src/models/models.types.ts`, `apps/api/src/common/utils/error.ts`, `apps/api/src/auth/auth.helpers.ts` (+ its importers), `packages/contracts/src/index.ts`
- Test: `apps/api/test/models.integration.spec.ts` (append)

**Interfaces:**
- Consumes: `ModelsRepository` (Task 3), `OllamaService.listInstalledModels()`.
- Produces:
  - contracts: `interface AdminModel { id: string; name: string; maxContext: number; isAvailable: boolean; isDefault: boolean; installed: boolean | null; createdAt: string; updatedAt: string }`, `interface AdminModelsResponse { models: AdminModel[] }`, `interface CreateModelInput { name: string; maxContext: number; isAvailable?: boolean }`, `interface UpdateModelInput { maxContext?: number; isAvailable?: boolean; isDefault?: boolean }`.
  - `ModelAdministrationService.listAll(): Promise<AdminModel[]>`, `.create(input: CreateModelInput): Promise<AdminModel>`, `.update(params: { id: string; input: UpdateModelInput }): Promise<AdminModel>` — exported from `ModelsModule`.
  - `isUniqueViolation(error: unknown): boolean` now lives in `apps/api/src/common/utils/error.ts`.
  - `toAdminModel(params: { model: Model; installed: Set<string> | null }): AdminModel` in `models.helpers.ts`.

- [ ] **Step 1: Failing tests** — append to `apps/api/test/models.integration.spec.ts` (inside the describe; add `import { ModelAdministrationService } from '../src/models/model-administration.service';` and `import { ConflictException, NotFoundException } from '@nestjs/common';`):

```ts
  describe('administration', () => {
    function admin(installedNames: string[] | Error = ['qwen2.5:1.5b']) {
      return new ModelAdministrationService(repository, {
        listInstalledModels: () =>
          installedNames instanceof Error
            ? Promise.reject(installedNames)
            : Promise.resolve(installedNames),
      } as never);
    }

    async function restoreQwenDefault() {
      const qwen = await prisma.model.findUniqueOrThrow({
        where: { name: 'qwen2.5:1.5b' },
      });
      await repository.setDefault(qwen.id);
    }

    afterEach(restoreQwenDefault);

    it('creates a model, trimming the name, and rejects duplicates', async () => {
      const name = `  test-${randomBytes(4).toString('hex')}  `;
      const model = await admin().create({ name, maxContext: 2048 });
      created.push(model.id);
      expect(model).toMatchObject({
        name: name.trim(),
        maxContext: 2048,
        isAvailable: true,
        isDefault: false,
        installed: false,
      });
      await expect(
        admin().create({ name: name.trim(), maxContext: 2048 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports installed as null when Ollama is down', async () => {
      const models = await admin(new Error('down')).listAll();
      expect(models.every((m) => m.installed === null)).toBe(true);
    });

    it('switches the default atomically', async () => {
      const next = await createModel();
      const updated = await admin().update({
        id: next.id,
        input: { isDefault: true },
      });
      expect(updated.isDefault).toBe(true);
      expect(
        await prisma.model.count({ where: { is_default: true } }),
      ).toBe(1);
    });

    it('refuses to unset or disable the default', async () => {
      const qwen = await prisma.model.findUniqueOrThrow({
        where: { name: 'qwen2.5:1.5b' },
      });
      await expect(
        admin().update({ id: qwen.id, input: { isDefault: false } }),
      ).rejects.toThrow('Choose another default model first.');
      await expect(
        admin().update({ id: qwen.id, input: { isAvailable: false } }),
      ).rejects.toThrow('The default model cannot be made unavailable.');
      const after = await prisma.model.findUniqueOrThrow({
        where: { id: qwen.id },
      });
      expect(after).toMatchObject({ is_default: true, is_available: true });
    });

    it('requires availability before making a disabled model default', async () => {
      const disabled = await createModel({ is_available: false });
      await expect(
        admin().update({ id: disabled.id, input: { isDefault: true } }),
      ).rejects.toBeInstanceOf(ConflictException);
      const ok = await admin().update({
        id: disabled.id,
        input: { isDefault: true, isAvailable: true },
      });
      expect(ok).toMatchObject({ isDefault: true, isAvailable: true });
    });

    it('edits max context and availability; 404 for unknown ids', async () => {
      const model = await createModel();
      const updated = await admin().update({
        id: model.id,
        input: { maxContext: 16384, isAvailable: false },
      });
      expect(updated).toMatchObject({ maxContext: 16384, isAvailable: false });
      await expect(
        admin().update({
          id: '00000000-0000-7000-8000-000000000000',
          input: { maxContext: 1024 },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/models.integration.spec.ts` — Expected: FAIL (service missing).

- [ ] **Step 3: Implement.**

Move `isUniqueViolation` from `src/auth/auth.helpers.ts` into `src/common/utils/error.ts` (same body) and update every importer (`grep -rn isUniqueViolation apps/api/src`).

Add to `packages/contracts/src/index.ts` the four interfaces listed in **Produces** verbatim.

`apps/api/src/models/models.types.ts` — append:

```ts
export interface UpdateModelParams {
  id: string;
  input: import('@js-rag-stack/contracts').UpdateModelInput;
}

export interface ToAdminModelParams {
  model: import('../generated/prisma/client').Model;
  installed: Set<string> | null;
}
```

(Prefer top-of-file `import type` lines over inline `import()` — shown inline here only for brevity.)

`apps/api/src/models/models.helpers.ts`:

```ts
import type { AdminModel } from '@js-rag-stack/contracts';
import type { ToAdminModelParams } from './models.types';

export function toAdminModel({ model, installed }: ToAdminModelParams): AdminModel {
  return {
    id: model.id,
    name: model.name,
    maxContext: model.max_context,
    isAvailable: model.is_available,
    isDefault: model.is_default,
    installed: installed ? installed.has(model.name) : null,
    createdAt: model.created_at.toISOString(),
    updatedAt: model.updated_at.toISOString(),
  };
}
```

`apps/api/src/models/model-administration.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminModel, CreateModelInput } from '@js-rag-stack/contracts';
import { isUniqueViolation } from '../common/utils/error';
import type { Model } from '../generated/prisma/client';
import { OllamaService } from '../ollama/ollama.service';
import { toAdminModel } from './models.helpers';
import { ModelsRepository } from './models.repository';
import type { UpdateModelParams } from './models.types';

@Injectable()
export class ModelAdministrationService {
  constructor(
    private readonly models: ModelsRepository,
    private readonly ollama: OllamaService,
  ) {}

  async listAll(): Promise<AdminModel[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.installedNames(),
    ]);
    return models.map((model) => toAdminModel({ model, installed }));
  }

  async create(input: CreateModelInput): Promise<AdminModel> {
    try {
      const model = await this.models.create({
        name: input.name.trim(),
        max_context: input.maxContext,
        is_available: input.isAvailable ?? true,
      });
      return this.present(model);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A model with this name already exists.');
      }
      throw error;
    }
  }

  async update({ id, input }: UpdateModelParams): Promise<AdminModel> {
    const model = await this.models.findById(id);
    if (!model) throw new NotFoundException('Model not found.');

    this.assertTransition(model, input);

    let updated = model;
    if (input.maxContext !== undefined || input.isAvailable !== undefined) {
      updated = await this.models.update({
        id,
        data: {
          max_context: input.maxContext,
          is_available: input.isAvailable,
        },
      });
    }
    if (input.isDefault === true && !model.is_default) {
      updated = await this.models.setDefault(id);
    }
    return this.present(updated);
  }

  private assertTransition(
    model: Model,
    input: UpdateModelParams['input'],
  ): void {
    if (model.is_default && input.isDefault === false) {
      throw new ConflictException('Choose another default model first.');
    }
    if (model.is_default && input.isAvailable === false) {
      throw new ConflictException(
        'The default model cannot be made unavailable.',
      );
    }
    if (
      input.isDefault === true &&
      input.isAvailable === false
    ) {
      throw new ConflictException(
        'The default model cannot be made unavailable.',
      );
    }
    if (
      input.isDefault === true &&
      !model.is_available &&
      input.isAvailable !== true
    ) {
      throw new ConflictException(
        'Make the model available before setting it as default.',
      );
    }
  }

  private async present(model: Model): Promise<AdminModel> {
    return toAdminModel({ model, installed: await this.installedNames() });
  }

  private async installedNames(): Promise<Set<string> | null> {
    try {
      return new Set(await this.ollama.listInstalledModels());
    } catch {
      return null;
    }
  }
}
```

`models.module.ts`: add `ModelAdministrationService` to `providers` and `exports`.

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/api exec jest && pnpm --filter @js-rag-stack/api typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src apps/api/test packages/contracts
git commit -m "feat(api): add model administration rules"
```

---

### Task 6: Admin auth — env, tokens, sessions, guard, controller, origin isolation

**Files:**
- Modify: `apps/api/src/config/environment.schema.ts`, `apps/api/src/main.ts`, `apps/api/src/common/guards/origin.guard.ts`, `apps/api/src/common/middleware/request-principal.middleware.ts`, `apps/api/src/common/types/express.d.ts`, `apps/api/src/common/security/security.helpers.ts`, `apps/api/src/auth/auth.helpers.ts` (move `hashToken`), `packages/contracts/src/index.ts`
- Create: `apps/api/src/common/models/admin-principal.ts`, `apps/api/src/admin/admin.helpers.ts`, and under `apps/api/src/admin/auth/`: `admin-auth.module.ts`, `admin-auth.controller.ts`, `admin-auth.service.ts`, `admin-auth.guard.ts`, `admin-accounts.service.ts`, `admin-accounts.repository.ts`, `admin-sessions.repository.ts`, `admin-token.service.ts`, `admin-cookie.service.ts`, `admin-auth.types.ts`, `admin-auth.helpers.ts`, `dto/admin-sign-in.dto.ts`, `models/admin-response.dto.ts`
- Test: create `apps/api/test/admin-auth.integration.spec.ts`, `apps/api/test/admin.helpers.spec.ts`; modify `apps/api/test/security.spec.ts`, `apps/api/test/environment.schema.spec.ts`

**Interfaces:**
- Produces:
  - Env: `ADMIN_ORIGIN`, `ADMIN_JWT_SECRET`, `ADMIN_ACCESS_TTL`, `ADMIN_REFRESH_TTL` (defaults in Global Constraints).
  - `interface AdminPrincipal { admin_id: string; admin_session_id: string }` (`common/models/admin-principal.ts`); `Express.Request.admin?: AdminPrincipal`.
  - `ADMIN_ROUTE_PREFIX = '/api/v1/admin'`, `isAdminPath(url: string | undefined): boolean`, `getAdminPrincipal(request: Request): AdminPrincipal` (throws 401) — `admin/admin.helpers.ts`.
  - contracts: `interface AdminProfile { id: string; email: string; displayName: string | null }`, `interface AdminAuthResponse { admin: AdminProfile }`, `interface AdminSignInInput { email: string; password: string }`.
  - `AdminAuthService`: `signIn(params: { input: AdminSignInInput; response: Response }): Promise<AdminProfile>`, `refresh(params: { rawToken: string; response: Response }): Promise<AdminProfile>`, `authenticate(rawAccessToken: string): Promise<AdminPrincipal>`, `signOut(params: { principal: AdminPrincipal; response: Response }): Promise<void>`, `me(adminId: string): Promise<AdminProfile>`.
  - `AdminAccountsService.upsert(params: { email: string; password: string; displayName?: string | null }): Promise<AdminProfile>`.
  - `AdminAuthGuard` (exported). `AdminAuthModule` exports `AdminAuthGuard`, `AdminAuthService`, `AdminAccountsService`.
  - `hashToken(token: string): string` now in `common/security/security.helpers.ts`.

- [ ] **Step 1: Failing tests.**

`apps/api/test/admin.helpers.spec.ts`:

```ts
import { isAdminPath } from '../src/admin/admin.helpers';

describe('isAdminPath', () => {
  it.each([
    ['/api/v1/admin', true],
    ['/api/v1/admin/users?page=2', true],
    ['/api/v1/admin/auth/sign-in', true],
    ['/api/v1/administrator', false],
    ['/api/v1/chats', false],
    [undefined, false],
  ])('%s → %s', (url, expected) => {
    expect(isAdminPath(url)).toBe(expected);
  });
});
```

Append to `apps/api/test/security.spec.ts` (inside the existing describe; reuse its `createContext` helper):

```ts
  it('isolates admin routes to ADMIN_ORIGIN and user routes to WEB_ORIGIN', () => {
    const guard = new OriginGuard(config);
    const post = (url: string, origin: string) =>
      createContext({
        method: 'POST',
        originalUrl: url,
        get: (name: string) =>
          name.toLowerCase() === 'origin' ? origin : undefined,
      } as unknown as Request);

    expect(guard.canActivate(post('/api/v1/admin/models', 'http://localhost:5174'))).toBe(true);
    expect(() => guard.canActivate(post('/api/v1/admin/models', 'http://localhost:5173'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(post('/api/v1/chats', 'http://localhost:5174'))).toThrow(ForbiddenException);
  });
```

(Import `ForbiddenException` from `@nestjs/common` if not already imported.)

Append to `apps/api/test/environment.schema.spec.ts` a case mirroring the existing production-secret test: `NODE_ENV=production` with real JWT/CSRF secrets but default `ADMIN_JWT_SECRET` → `validateEnvironment` throws mentioning `ADMIN_JWT_SECRET`. Copy the structure of the existing production test in that file.

`apps/api/test/admin-auth.integration.spec.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AdminAccountsRepository } from '../src/admin/auth/admin-accounts.repository';
import { AdminAccountsService } from '../src/admin/auth/admin-accounts.service';
import { AdminAuthGuard } from '../src/admin/auth/admin-auth.guard';
import { AdminAuthService } from '../src/admin/auth/admin-auth.service';
import { AdminCookieService } from '../src/admin/auth/admin-cookie.service';
import { AdminSessionsRepository } from '../src/admin/auth/admin-sessions.repository';
import { AdminTokenService } from '../src/admin/auth/admin-token.service';
import { Argon2PasswordHasher } from '../src/common/security/password-hasher';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';

describe('admin authentication', () => {
  let prisma: PrismaService;
  let config: ConfigService<AppEnvironment, true>;
  let auth: AdminAuthService;
  let accounts: AdminAccountsService;
  let cookies: AdminCookieService;
  const emails: string[] = [];
  const password = 'admin-password-123';

  function response() {
    const jar: Record<string, string> = {};
    const res = {
      cookie: jest.fn((name: string, value: string) => {
        jar[name] = value;
      }),
      clearCookie: jest.fn(),
    } as unknown as Response;
    return { res, jar };
  }

  async function createAdmin() {
    const email = `admin-${randomBytes(6).toString('hex')}@example.com`;
    emails.push(email);
    await accounts.upsert({ email, password });
    return email;
  }

  beforeAll(async () => {
    config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
        COOKIE_SECURE: 'false',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const hasher = new Argon2PasswordHasher();
    const accountsRepository = new AdminAccountsRepository(prisma);
    cookies = new AdminCookieService(config);
    accounts = new AdminAccountsService(accountsRepository, hasher);
    auth = new AdminAuthService(
      accountsRepository,
      new AdminSessionsRepository(prisma),
      new AdminTokenService(new JwtService(), config),
      cookies,
      hasher,
      config,
    );
  });

  afterAll(async () => {
    await prisma.admin.deleteMany({ where: { email: { in: emails } } });
    await prisma.onApplicationShutdown();
  });

  it('signs in, authenticates, refreshes with rotation, and signs out', async () => {
    const email = await createAdmin();
    const first = response();
    const profile = await auth.signIn({
      input: { email: email.toUpperCase(), password },
      response: first.res,
    });
    expect(profile.email).toBe(email);
    const access = first.jar[cookies.accessCookieName];
    const refresh = first.jar[cookies.refreshCookieName];
    expect(access).toEqual(expect.any(String));

    const principal = await auth.authenticate(access!);
    expect(principal.admin_id).toBe(profile.id);

    const second = response();
    await auth.refresh({ rawToken: refresh!, response: second.res });
    await expect(
      auth.refresh({ rawToken: refresh!, response: response().res }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const rotatedPrincipal = await auth.authenticate(
      second.jar[cookies.accessCookieName]!,
    );
    await auth.signOut({ principal: rotatedPrincipal, response: response().res });
    await expect(
      auth.authenticate(second.jar[cookies.accessCookieName]!),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses one generic message for unknown email and wrong password', async () => {
    const email = await createAdmin();
    await expect(
      auth.signIn({ input: { email, password: 'wrong-password!' }, response: response().res }),
    ).rejects.toThrow('Invalid email or password.');
    await expect(
      auth.signIn({ input: { email: 'nobody@example.com', password }, response: response().res }),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('rejects user access tokens and missing cookies at the guard', async () => {
    const userToken = await new JwtService().signAsync(
      { sub: 'u', sessionId: 's', jti: 'j', type: 'access' },
      { secret: config.get('JWT_ACCESS_SECRET', { infer: true }) },
    );
    const guard = new AdminAuthGuard(auth, cookies);
    const context = (cookieJar: Record<string, string>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ cookies: cookieJar }) as unknown as Request,
        }),
      }) as never;

    await expect(guard.canActivate(context({ access_token: userToken }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(context({ [cookies.accessCookieName]: userToken })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('upsert creates then resets the password; rejects short passwords', async () => {
    const email = await createAdmin();
    await accounts.upsert({ email, password: 'a-brand-new-password' });
    await expect(
      auth.signIn({ input: { email, password }, response: response().res }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.signIn({ input: { email, password: 'a-brand-new-password' }, response: response().res }),
    ).resolves.toMatchObject({ email });
    await expect(accounts.upsert({ email, password: 'short' })).rejects.toThrow(
      'Admin passwords must be at least 12 characters.',
    );
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin.helpers.spec.ts test/admin-auth.integration.spec.ts test/security.spec.ts test/environment.schema.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement config & request pipeline.**

`environment.schema.ts` — add to the object (after `WEB_ORIGIN`):

```ts
    ADMIN_ORIGIN: z.url().default('http://localhost:5174'),
```

and after `COOKIE_DOMAIN`:

```ts
    ADMIN_JWT_SECRET: z
      .string()
      .min(32)
      .default('test-admin-secret-at-least-32-bytes!'),
    ADMIN_ACCESS_TTL: z
      .string()
      .regex(/^\d+[dhm]$/)
      .default('15m'),
    ADMIN_REFRESH_TTL: z
      .string()
      .regex(/^\d+[dhm]$/)
      .default('7d'),
```

Add `'ADMIN_JWT_SECRET'` to the production secret list in `superRefine`.

`common/models/admin-principal.ts`:

```ts
export interface AdminPrincipal {
  admin_id: string;
  admin_session_id: string;
}
```

`express.d.ts`: import `AdminPrincipal` and add `admin?: AdminPrincipal;` to `Request`.

`admin/admin.helpers.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from '../common/models/admin-principal';

export const ADMIN_ROUTE_PREFIX = '/api/v1/admin';

export function isAdminPath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0] ?? '';
  return path === ADMIN_ROUTE_PREFIX || path.startsWith(`${ADMIN_ROUTE_PREFIX}/`);
}

export function getAdminPrincipal(request: Request): AdminPrincipal {
  if (!request.admin) {
    throw new UnauthorizedException('Admin authentication is required.');
  }
  return request.admin;
}
```

`origin.guard.ts`: read `this.adminOrigin = config.get('ADMIN_ORIGIN', { infer: true })`; in `canActivate` after the safe-method check:

```ts
    const expectedOrigin = isAdminPath(request.originalUrl)
      ? this.adminOrigin
      : this.allowedOrigin;
    const origin = request.get('origin');

    if (origin === expectedOrigin) {
      return true;
    }
```

(keep the dev API-origin exception below unchanged).

`request-principal.middleware.ts`: first line of `use`:

```ts
    // Admin requests never resolve or create a user/anonymous principal.
    if (isAdminPath(request.originalUrl)) {
      next();
      return;
    }
```

`main.ts`: `origin: [config.get('WEB_ORIGIN', { infer: true }), config.get('ADMIN_ORIGIN', { infer: true })],`.

Move `hashToken` from `auth/auth.helpers.ts` to `common/security/security.helpers.ts` (same body, add `createHash` import there) and update importers.

- [ ] **Step 4: Implement AdminAuthModule.**

Contracts — add `AdminProfile`, `AdminAuthResponse`, `AdminSignInInput` (see Interfaces).

`admin/auth/admin-auth.types.ts`:

```ts
import type { Prisma } from '../../generated/prisma/client';

export interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AdminTokenClaims {
  sub: string;
  sessionId: string;
  jti: string;
  type: 'access' | 'refresh';
}

export interface AdminSessionIdentity {
  id: string;
  adminId: string;
  refreshJti: string;
}

export interface AdminSessionCredentials {
  tokens: AdminTokens;
  refreshTokenHash: string;
}

export type CreateAdminCredentials = (
  identity: AdminSessionIdentity,
) => Promise<AdminSessionCredentials>;

export interface CreateAdminSessionParams {
  adminId: string;
  expiresAt: Date;
  createCredentials: CreateAdminCredentials;
}

export interface CreateAdminSessionRecordParams extends CreateAdminSessionParams {
  transaction: Prisma.TransactionClient;
}

export interface RotateAdminSessionParams extends CreateAdminSessionParams {
  sessionId: string;
}

export interface FindActiveAdminSessionParams {
  sessionId: string;
  adminId: string;
}

export interface VerifyAdminTokenParams {
  rawToken: string;
  type: AdminTokenClaims['type'];
}

export interface UpsertAdminRecord {
  email: string;
  password_hash: string;
  display_name: string | null;
}

export class AdminSessionRotatedError extends Error {}
```

`admin/auth/admin-auth.helpers.ts`:

```ts
import type { AdminProfile } from '@js-rag-stack/contracts';
import type { Admin } from '../../generated/prisma/client';

export function toAdminProfile(admin: Admin): AdminProfile {
  return { id: admin.id, email: admin.email, displayName: admin.display_name };
}

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

`admin/auth/admin-token.service.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { parseDurationSeconds } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import type {
  AdminSessionIdentity,
  AdminTokenClaims,
  AdminTokens,
  VerifyAdminTokenParams,
} from './admin-auth.types';

const AUDIENCE = 'admin';

@Injectable()
export class AdminTokenService {
  private readonly secret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.secret = config.get('ADMIN_JWT_SECRET', { infer: true });
    this.accessTtlSeconds = parseDurationSeconds(
      config.get('ADMIN_ACCESS_TTL', { infer: true }),
    );
    this.refreshTtlSeconds = parseDurationSeconds(
      config.get('ADMIN_REFRESH_TTL', { infer: true }),
    );
  }

  async sign(identity: AdminSessionIdentity): Promise<AdminTokens> {
    const base = { sub: identity.adminId, sessionId: identity.id };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, jti: randomUUID(), type: 'access' } satisfies AdminTokenClaims,
        { secret: this.secret, expiresIn: this.accessTtlSeconds, audience: AUDIENCE },
      ),
      this.jwt.signAsync(
        { ...base, jti: identity.refreshJti, type: 'refresh' } satisfies AdminTokenClaims,
        { secret: this.secret, expiresIn: this.refreshTtlSeconds, audience: AUDIENCE },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  async verify({ rawToken, type }: VerifyAdminTokenParams): Promise<AdminTokenClaims> {
    let claims: AdminTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AdminTokenClaims>(rawToken, {
        secret: this.secret,
        audience: AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Admin authentication is invalid.');
    }
    if (
      claims.type !== type ||
      typeof claims.sub !== 'string' ||
      typeof claims.sessionId !== 'string' ||
      typeof claims.jti !== 'string'
    ) {
      throw new UnauthorizedException('Admin authentication is invalid.');
    }
    return claims;
  }
}
```

(The `randomUUID()` here is a JWT id, not a persisted id — allowed.)

`admin/auth/admin-cookie.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { parseDurationMs } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import { ADMIN_ROUTE_PREFIX } from '../admin.helpers';
import type { AdminTokens } from './admin-auth.types';

const REFRESH_PATH = `${ADMIN_ROUTE_PREFIX}/auth`;

@Injectable()
export class AdminCookieService {
  readonly accessCookieName = 'admin_access_token';
  readonly refreshCookieName = 'admin_refresh_token';
  private readonly baseOptions: CookieOptions;
  private readonly accessMaxAge: number;
  private readonly refreshMaxAge: number;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.baseOptions = {
      httpOnly: true,
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
    this.accessMaxAge = parseDurationMs(config.get('ADMIN_ACCESS_TTL', { infer: true }));
    this.refreshMaxAge = parseDurationMs(config.get('ADMIN_REFRESH_TTL', { infer: true }));
  }

  set(response: Response, tokens: AdminTokens): void {
    response.cookie(this.accessCookieName, tokens.accessToken, {
      ...this.baseOptions,
      path: ADMIN_ROUTE_PREFIX,
      maxAge: this.accessMaxAge,
    });
    response.cookie(this.refreshCookieName, tokens.refreshToken, {
      ...this.baseOptions,
      path: REFRESH_PATH,
      maxAge: this.refreshMaxAge,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.accessCookieName, { ...this.baseOptions, path: ADMIN_ROUTE_PREFIX });
    response.clearCookie(this.refreshCookieName, { ...this.baseOptions, path: REFRESH_PATH });
  }
}
```

`admin/auth/admin-accounts.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Admin } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpsertAdminRecord } from './admin-auth.types';

@Injectable()
export class AdminAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { email } });
  }

  findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  upsert(data: UpsertAdminRecord): Promise<Admin> {
    return this.prisma.admin.upsert({
      where: { email: data.email },
      create: data,
      update: { password_hash: data.password_hash, display_name: data.display_name },
    });
  }

  async touchSignIn(id: string): Promise<void> {
    await this.prisma.admin.update({
      where: { id },
      data: { last_sign_in_at: new Date() },
    });
  }
}
```

`admin/auth/admin-sessions.repository.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AdminSession } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSessionRotatedError,
  type AdminTokens,
  type CreateAdminSessionParams,
  type CreateAdminSessionRecordParams,
  type FindActiveAdminSessionParams,
  type RotateAdminSessionParams,
} from './admin-auth.types';

@Injectable()
export class AdminSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: CreateAdminSessionParams): Promise<AdminTokens> {
    return this.prisma.$transaction((transaction) =>
      this.createRecord({ ...params, transaction }),
    );
  }

  findById(id: string): Promise<AdminSession | null> {
    return this.prisma.adminSession.findUnique({ where: { id } });
  }

  findActive({ sessionId, adminId }: FindActiveAdminSessionParams) {
    return this.prisma.adminSession.findFirst({
      where: {
        id: sessionId,
        admin_id: adminId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true, admin_id: true },
    });
  }

  // Revoke-then-create in one transaction; a reused refresh token loses the race.
  rotate({ sessionId, ...params }: RotateAdminSessionParams): Promise<AdminTokens> {
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.adminSession.updateMany({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: new Date(), last_used_at: new Date() },
      });
      if (revoked.count !== 1) throw new AdminSessionRotatedError();
      return this.createRecord({ ...params, transaction });
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  private async createRecord({
    transaction,
    adminId,
    expiresAt,
    createCredentials,
  }: CreateAdminSessionRecordParams): Promise<AdminTokens> {
    // The refresh JWT embeds DB-generated ids; the placeholder hash never leaves the transaction.
    const session = await transaction.adminSession.create({
      data: {
        admin_id: adminId,
        refresh_token_hash: randomBytes(32).toString('hex'),
        expires_at: expiresAt,
      },
      select: { id: true, admin_id: true, refresh_jti: true },
    });
    const credentials = await createCredentials({
      id: session.id,
      adminId: session.admin_id,
      refreshJti: session.refresh_jti,
    });
    await transaction.adminSession.update({
      where: { id: session.id },
      data: { refresh_token_hash: credentials.refreshTokenHash },
    });
    return credentials.tokens;
  }
}
```

`admin/auth/admin-accounts.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminProfile } from '@js-rag-stack/contracts';
import { PasswordHasher } from '../../common/security/password-hasher';
import { normalizeAdminEmail, toAdminProfile } from './admin-auth.helpers';
import { AdminAccountsRepository } from './admin-accounts.repository';

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly accounts: AdminAccountsRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async upsert({
    email,
    password,
    displayName = null,
  }: {
    email: string;
    password: string;
    displayName?: string | null;
  }): Promise<AdminProfile> {
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(
        `Admin passwords must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
      );
    }
    const admin = await this.accounts.upsert({
      email: normalizeAdminEmail(email),
      password_hash: await this.passwords.hash(password),
      display_name: displayName?.trim() || null,
    });
    return toAdminProfile(admin);
  }
}
```

(Move the inline param type into `admin-auth.types.ts` as `UpsertAdminParams` to match the params-object convention.)

`admin/auth/admin-auth.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminProfile, AdminSignInInput } from '@js-rag-stack/contracts';
import type { Response } from 'express';
import type { AdminPrincipal } from '../../common/models/admin-principal';
import { PasswordHasher } from '../../common/security/password-hasher';
import { hashToken, safeEqual } from '../../common/security/security.helpers';
import { parseDurationMs } from '../../common/utils/duration';
import type { AppEnvironment } from '../../config/environment.schema';
import { normalizeAdminEmail, toAdminProfile } from './admin-auth.helpers';
import { AdminSessionRotatedError } from './admin-auth.types';
import { AdminAccountsRepository } from './admin-accounts.repository';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSessionsRepository } from './admin-sessions.repository';
import { AdminTokenService } from './admin-token.service';

const INVALID_CREDENTIALS = 'Invalid email or password.';

@Injectable()
export class AdminAuthService {
  private readonly refreshTtlMs: number;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly accounts: AdminAccountsRepository,
    private readonly sessions: AdminSessionsRepository,
    private readonly tokens: AdminTokenService,
    private readonly cookies: AdminCookieService,
    private readonly passwords: PasswordHasher,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.refreshTtlMs = parseDurationMs(config.get('ADMIN_REFRESH_TTL', { infer: true }));
  }

  async signIn({ input, response }: { input: AdminSignInInput; response: Response }): Promise<AdminProfile> {
    const admin = await this.accounts.findByEmail(normalizeAdminEmail(input.email));
    // Verify against a dummy hash for unknown emails so timing does not reveal accounts.
    const hash = admin?.password_hash ?? (await this.getDummyHash());
    const valid = await this.passwords.verify({ hash, plain: input.password });
    if (!admin || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const tokens = await this.sessions.create({
      adminId: admin.id,
      expiresAt: this.refreshExpiry(),
      createCredentials: (identity) => this.credentials(identity),
    });
    await this.accounts.touchSignIn(admin.id);
    this.cookies.set(response, tokens);
    return toAdminProfile(admin);
  }

  async refresh({ rawToken, response }: { rawToken: string; response: Response }): Promise<AdminProfile> {
    const claims = await this.tokens.verify({ rawToken, type: 'refresh' });
    const session = await this.sessions.findById(claims.sessionId);
    if (
      !session ||
      session.admin_id !== claims.sub ||
      session.refresh_jti !== claims.jti ||
      session.revoked_at ||
      session.expires_at <= new Date() ||
      !safeEqual({ left: session.refresh_token_hash, right: hashToken(rawToken) })
    ) {
      throw new UnauthorizedException('Admin refresh token is invalid.');
    }
    const admin = await this.accounts.findById(session.admin_id);
    if (!admin) throw new UnauthorizedException('Admin refresh token is invalid.');

    try {
      const tokens = await this.sessions.rotate({
        sessionId: session.id,
        adminId: admin.id,
        expiresAt: this.refreshExpiry(),
        createCredentials: (identity) => this.credentials(identity),
      });
      this.cookies.set(response, tokens);
    } catch (error) {
      if (error instanceof AdminSessionRotatedError) {
        throw new UnauthorizedException('Admin refresh token has already been used.');
      }
      throw error;
    }
    return toAdminProfile(admin);
  }

  async authenticate(rawAccessToken: string): Promise<AdminPrincipal> {
    const claims = await this.tokens.verify({ rawToken: rawAccessToken, type: 'access' });
    const session = await this.sessions.findActive({ sessionId: claims.sessionId, adminId: claims.sub });
    if (!session) throw new UnauthorizedException('Admin session is invalid.');
    return { admin_id: session.admin_id, admin_session_id: session.id };
  }

  async signOut({ principal, response }: { principal: AdminPrincipal; response: Response }): Promise<void> {
    await this.sessions.revoke(principal.admin_session_id);
    this.cookies.clear(response);
  }

  async me(adminId: string): Promise<AdminProfile> {
    const admin = await this.accounts.findById(adminId);
    if (!admin) throw new UnauthorizedException('Admin no longer exists.');
    return toAdminProfile(admin);
  }

  private async credentials(identity: Parameters<AdminTokenService['sign']>[0]) {
    const tokens = await this.tokens.sign(identity);
    return { tokens, refreshTokenHash: hashToken(tokens.refreshToken) };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlMs);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash('dummy-password-for-timing');
    return this.dummyHash;
  }
}
```

(Check `safeEqual`'s actual signature in `common/security/security.helpers.ts` — it's `safeEqual({ left, right })`. Move the inline param types into `admin-auth.types.ts` as `AdminSignInParams`, `AdminRefreshParams`, `AdminSignOutParams`.)

`admin/auth/admin-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AdminCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.cookies.accessCookieName];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Admin authentication is required.');
    }
    request.admin = await this.auth.authenticate(token);
    return true;
  }
}
```

`admin/auth/dto/admin-sign-in.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminSignInDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
```

`admin/auth/models/admin-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class AdminProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
}

export class AdminAuthResponseDto {
  @ApiProperty({ type: AdminProfileDto }) admin!: AdminProfileDto;
}
```

`admin/auth/admin-auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getCookie } from '../../auth/auth.helpers';
import { CsrfResponseDto } from '../../auth/models/auth-response.dto';
import { CsrfService } from '../../common/security/csrf.service';
import { getAdminPrincipal } from '../admin.helpers';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSignInDto } from './dto/admin-sign-in.dto';
import { AdminAuthResponseDto } from './models/admin-response.dto';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AdminCookieService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token for the admin app' })
  @ApiOkResponse({ type: CsrfResponseDto })
  getCsrf(@Res({ passthrough: true }) response: Response): CsrfResponseDto {
    return { csrfToken: this.csrf.issue(response) };
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as an admin' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async signIn(
    @Res({ passthrough: true }) response: Response,
    @Body() body: AdminSignInDto,
  ): Promise<AdminAuthResponseDto> {
    return { admin: await this.auth.signIn({ input: body, response }) };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate admin tokens' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminAuthResponseDto> {
    const rawToken = getCookie({ request, name: this.cookies.refreshCookieName });
    return { admin: await this.auth.refresh({ rawToken, response }) };
  }

  @Post('sign-out')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out the current admin session' })
  @ApiNoContentResponse()
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOut({ principal: getAdminPrincipal(request), response });
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Current admin profile' })
  @ApiOkResponse({ type: AdminAuthResponseDto })
  async me(@Req() request: Request): Promise<AdminAuthResponseDto> {
    return { admin: await this.auth.me(getAdminPrincipal(request).admin_id) };
  }
}
```

(`getCookie` is a pure helper; importing it from `auth.helpers` is acceptable, but if you prefer strict module isolation move it to `common/utils/cookies.ts` and update auth. Choose the move — it keeps `admin/` independent of `auth/`. Same for `CsrfResponseDto`: move it to `common/security/csrf-response.dto.ts` and update auth's imports.)

`admin/auth/admin-auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAccountsRepository } from './admin-accounts.repository';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';
import { AdminSessionsRepository } from './admin-sessions.repository';
import { AdminTokenService } from './admin-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController],
  providers: [
    AdminAccountsRepository,
    AdminSessionsRepository,
    AdminTokenService,
    AdminCookieService,
    AdminAuthService,
    AdminAccountsService,
    AdminAuthGuard,
  ],
  exports: [AdminAuthGuard, AdminAuthService, AdminCookieService, AdminAccountsService],
})
export class AdminAuthModule {}
```

(Wiring into `AppModule` happens in Task 9 via `AdminModule`.)

- [ ] **Step 5: Run** `pnpm --filter @js-rag-stack/api exec jest && pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src apps/api/test packages/contracts
git commit -m "feat(api): add isolated admin authentication"
```

---

### Task 7: `admin:create` CLI

**Files:**
- Create: `apps/api/src/cli/admin-cli.module.ts`, `apps/api/src/cli/create-admin.ts`, `apps/api/src/cli/create-admin.helpers.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/test/admin.helpers.spec.ts` (append)

**Interfaces:**
- Consumes: `AdminAccountsService.upsert` (Task 6).
- Produces: `parseCreateAdminArgs(argv: string[]): { email: string; name: string | null }` (throws `Error('Usage: admin:create --email <email> [--name <name>]')` when `--email` missing).

- [ ] **Step 1: Failing test** — append to `apps/api/test/admin.helpers.spec.ts`:

```ts
import { parseCreateAdminArgs } from '../src/cli/create-admin.helpers';

describe('parseCreateAdminArgs', () => {
  it('parses email and optional name', () => {
    expect(parseCreateAdminArgs(['--email', 'a@b.co', '--name', 'Ops'])).toEqual({
      email: 'a@b.co',
      name: 'Ops',
    });
    expect(parseCreateAdminArgs(['--email=a@b.co'])).toEqual({ email: 'a@b.co', name: null });
  });

  it('requires --email', () => {
    expect(() => parseCreateAdminArgs([])).toThrow('Usage: admin:create --email <email> [--name <name>]');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin.helpers.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`apps/api/src/cli/create-admin.helpers.ts`:

```ts
import { parseArgs } from 'node:util';

const USAGE = 'Usage: admin:create --email <email> [--name <name>]';

export function parseCreateAdminArgs(argv: string[]): { email: string; name: string | null } {
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== '--'),
    options: { email: { type: 'string' }, name: { type: 'string' } },
    strict: true,
  });
  if (!values.email) throw new Error(USAGE);
  return { email: values.email, name: values.name ?? null };
}

// Reads a line without echoing; supports pasted input and backspace.
export function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    return Promise.reject(new Error('admin:create needs an interactive terminal.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdout.write(question);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
```

`apps/api/src/cli/admin-cli.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { SecurityModule } from '../common/security/security.module';
import { validateEnvironment } from '../config/environment.schema';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SecurityModule,
    PrismaModule,
    AdminAuthModule,
  ],
})
export class AdminCliModule {}
```

`apps/api/src/cli/create-admin.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AdminAccountsService } from '../admin/auth/admin-accounts.service';
import { getErrorMessage } from '../common/utils/error';
import { AdminCliModule } from './admin-cli.module';
import { parseCreateAdminArgs, promptHidden } from './create-admin.helpers';

async function main(): Promise<void> {
  const { email, name } = parseCreateAdminArgs(process.argv.slice(2));
  const password = await promptHidden('Password: ');
  const confirmation = await promptHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  const app = await NestFactory.createApplicationContext(AdminCliModule, {
    logger: ['error', 'warn'],
  });
  try {
    const admin = await app.get(AdminAccountsService).upsert({
      email,
      password,
      displayName: name,
    });
    process.stdout.write(`Admin ready: ${admin.email} (${admin.id})\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});
```

`apps/api/package.json` scripts: add `"admin:create": "nest build && node dist/cli/create-admin.js"`.

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin.helpers.spec.ts && pnpm --filter @js-rag-stack/api build && ls apps/api/dist/cli/create-admin.js` — Expected: PASS and file exists.

- [ ] **Step 5: Manual smoke (optional, needs a TTY):** `pnpm --filter @js-rag-stack/api admin:create --email you@example.com` → prompts twice → prints `Admin ready: …`. If the executor has no TTY, skip and say so in the report.

- [ ] **Step 6: Commit**

```bash
git add -A apps/api/src/cli apps/api/package.json apps/api/test/admin.helpers.spec.ts
git commit -m "feat(api): add admin:create CLI"
```

---

### Task 8: `UsageReportingService` — totals, breakdown, rows

**Files:**
- Create: `apps/api/src/usage/usage-reporting.service.ts`
- Modify: `apps/api/src/usage/usage.repository.ts`, `usage.types.ts`, `usage.helpers.ts`, `usage.module.ts`, `packages/contracts/src/index.ts`
- Test: create `apps/api/test/admin-reporting.integration.spec.ts`

**Interfaces:**
- Produces (contracts, verbatim):

```ts
export type UsageKind = 'chat' | 'summary';

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastActivityAt: string | null;
}

export interface UsageBreakdownItem {
  model: string;
  kind: UsageKind;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageRow {
  id: string;
  createdAt: string;
  model: string;
  kind: UsageKind;
  inputTokens: number;
  outputTokens: number;
  chatId: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
```

- `usage.types.ts`: `interface UsageRange { from?: Date; to?: Date }`, `interface PageRequest { page: number; pageSize: number }`, `interface UsageQueryParams { owner: UsageOwner; range: UsageRange }`, `interface UsageRowsParams extends UsageQueryParams { page: PageRequest }`.
- `UsageReportingService.getTotals(params: UsageQueryParams): Promise<UsageTotals>`, `.getBreakdown(params: UsageQueryParams): Promise<UsageBreakdownItem[]>`, `.listRows(params: UsageRowsParams): Promise<Paginated<UsageRow>>` — exported from `UsageModule`.
- `usage.helpers.ts`: `toUsageWhere(params: UsageQueryParams): Prisma.UsageLogWhereInput`, `toWireKind(kind: UsageKind /* prisma */): 'chat' | 'summary'`, `toSafeNumber(value: bigint | number | null | undefined): number`.

- [ ] **Step 1: Failing test** — `apps/api/test/admin-reporting.integration.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsageReportingService } from '../src/usage/usage-reporting.service';
import { UsageRepository } from '../src/usage/usage.repository';

describe('usage reporting', () => {
  let prisma: PrismaService;
  let reporting: UsageReportingService;
  let model_id: string;
  let anonymousId: string;

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    reporting = new UsageReportingService(new UsageRepository(prisma));
    model_id = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
    const session = await prisma.anonymousSession.create({
      data: {
        token_hash: Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });
    anonymousId = session.id;
    const row = (kind: 'CHAT' | 'SUMMARY', input: number, output: number, at: string) => ({
      anonymous_session_id: anonymousId,
      model_id,
      kind,
      input_tokens: input,
      output_tokens: output,
      created_at: new Date(at),
    });
    await prisma.usageLog.createMany({
      data: [
        row('CHAT', 100, 10, '2026-09-01T10:00:00Z'),
        row('CHAT', 200, 20, '2026-09-15T10:00:00Z'),
        row('SUMMARY', 50, 5, '2026-09-20T10:00:00Z'),
      ],
    });
  });

  afterAll(async () => {
    await prisma.usageLog.deleteMany({ where: { anonymous_session_id: anonymousId } });
    await prisma.anonymousSession.delete({ where: { id: anonymousId } });
    await prisma.onApplicationShutdown();
  });

  const owner = () => ({ type: 'anonymous' as const, id: anonymousId });

  it('totals all rows', async () => {
    await expect(reporting.getTotals({ owner: owner(), range: {} })).resolves.toEqual({
      requests: 3,
      inputTokens: 350,
      outputTokens: 35,
      totalTokens: 385,
      lastActivityAt: '2026-09-20T10:00:00.000Z',
    });
  });

  it('applies from-inclusive / to-exclusive ranges', async () => {
    const totals = await reporting.getTotals({
      owner: owner(),
      range: { from: new Date('2026-09-15T10:00:00Z'), to: new Date('2026-09-20T10:00:00Z') },
    });
    expect(totals).toMatchObject({ requests: 1, inputTokens: 200 });
  });

  it('returns zero totals for an owner with no usage', async () => {
    await expect(
      reporting.getTotals({
        owner: { type: 'user', id: '00000000-0000-7000-8000-000000000000' },
        range: {},
      }),
    ).resolves.toEqual({ requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, lastActivityAt: null });
  });

  it('breaks down by model and kind', async () => {
    const breakdown = await reporting.getBreakdown({ owner: owner(), range: {} });
    expect(breakdown).toEqual(
      expect.arrayContaining([
        { model: 'qwen2.5:1.5b', kind: 'chat', requests: 2, inputTokens: 300, outputTokens: 30 },
        { model: 'qwen2.5:1.5b', kind: 'summary', requests: 1, inputTokens: 50, outputTokens: 5 },
      ]),
    );
  });

  it('paginates rows newest first', async () => {
    const page = await reporting.listRows({
      owner: owner(),
      range: {},
      page: { page: 2, pageSize: 2 },
    });
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      model: 'qwen2.5:1.5b',
      kind: 'chat',
      inputTokens: 100,
      createdAt: '2026-09-01T10:00:00.000Z',
      chatId: null,
    });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin-reporting.integration.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

Add the contracts block above to `packages/contracts/src/index.ts`. Add the types to `usage.types.ts`.

`usage.helpers.ts` — append:

```ts
import type { Prisma, UsageKind as DbUsageKind } from '../generated/prisma/client';
import type { UsageQueryParams } from './usage.types';

export function toUsageWhere({ owner, range }: UsageQueryParams): Prisma.UsageLogWhereInput {
  return {
    ...(owner.type === 'user'
      ? { user_id: owner.id }
      : { anonymous_session_id: owner.id }),
    ...(range.from || range.to
      ? { created_at: { gte: range.from, lt: range.to } }
      : {}),
  };
}

export function toWireKind(kind: DbUsageKind): 'chat' | 'summary' {
  return kind === 'CHAT' ? 'chat' : 'summary';
}

export function toSafeNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}
```

(Merge the imports with the file's existing ones.)

`usage.repository.ts` — add:

```ts
  aggregate(where: Prisma.UsageLogWhereInput) {
    return this.prisma.usageLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true },
      _max: { created_at: true },
    });
  }

  async breakdown(where: Prisma.UsageLogWhereInput) {
    const groups = await this.prisma.usageLog.groupBy({
      by: ['model_id', 'kind'],
      where,
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true },
      orderBy: [{ model_id: 'asc' }, { kind: 'asc' }],
    });
    const models = await this.prisma.model.findMany({
      where: { id: { in: groups.map((group) => group.model_id) } },
      select: { id: true, name: true },
    });
    return { groups, modelNames: new Map(models.map((m) => [m.id, m.name])) };
  }

  findRows({ where, skip, take }: { where: Prisma.UsageLogWhereInput; skip: number; take: number }) {
    return this.prisma.$transaction([
      this.prisma.usageLog.findMany({
        where,
        include: { model: { select: { name: true } } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.usageLog.count({ where }),
    ]);
  }
```

(Import `Prisma` type from `../generated/prisma/client`; move the inline params type into `usage.types.ts` as `FindUsageRowsParams`.)

`usage-reporting.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Paginated, UsageBreakdownItem, UsageRow, UsageTotals } from '@js-rag-stack/contracts';
import { toSafeNumber, toUsageWhere, toWireKind } from './usage.helpers';
import { UsageRepository } from './usage.repository';
import type { UsageQueryParams, UsageRowsParams } from './usage.types';

@Injectable()
export class UsageReportingService {
  constructor(private readonly usage: UsageRepository) {}

  async getTotals(params: UsageQueryParams): Promise<UsageTotals> {
    const result = await this.usage.aggregate(toUsageWhere(params));
    const inputTokens = toSafeNumber(result._sum.input_tokens);
    const outputTokens = toSafeNumber(result._sum.output_tokens);
    return {
      requests: result._count._all,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      lastActivityAt: result._max.created_at?.toISOString() ?? null,
    };
  }

  async getBreakdown(params: UsageQueryParams): Promise<UsageBreakdownItem[]> {
    const { groups, modelNames } = await this.usage.breakdown(toUsageWhere(params));
    return groups.map((group) => ({
      model: modelNames.get(group.model_id) ?? 'unknown',
      kind: toWireKind(group.kind),
      requests: group._count._all,
      inputTokens: toSafeNumber(group._sum.input_tokens),
      outputTokens: toSafeNumber(group._sum.output_tokens),
    }));
  }

  async listRows({ page, ...params }: UsageRowsParams): Promise<Paginated<UsageRow>> {
    const [rows, total] = await this.usage.findRows({
      where: toUsageWhere(params),
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        model: row.model.name,
        kind: toWireKind(row.kind),
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        chatId: row.chat_id,
      })),
      page: page.page,
      pageSize: page.pageSize,
      total,
    };
  }
}
```

`usage.module.ts`: add `UsageReportingService` to providers and exports.

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin-reporting.integration.spec.ts && pnpm --filter @js-rag-stack/api typecheck` — Expected: PASS. If `groupBy` with `orderBy` complains in Prisma 7 typings, drop the `orderBy` and sort in the service by `model` then `kind`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/usage apps/api/test/admin-reporting.integration.spec.ts packages/contracts
git commit -m "feat(api): add usage reporting service"
```

---

### Task 9: Admin users, anonymous sessions & models endpoints; `AdminModule` wiring

**Files:**
- Create: `apps/api/src/admin/admin.module.ts`; `apps/api/src/admin/common/admin-query.dto.ts`, `admin-usage.dto.ts`, `admin-query.helpers.ts`, `admin-list.sql.ts`; `apps/api/src/admin/users/{admin-users.module,admin-users.controller,admin-users.service,admin-users.repository,admin-users.types}.ts`, `apps/api/src/admin/users/models/admin-users-response.dto.ts`, `apps/api/src/admin/users/dto/list-users-query.dto.ts`; `apps/api/src/admin/anonymous-sessions/{admin-anonymous-sessions.module,admin-anonymous-sessions.controller,admin-anonymous-sessions.service,admin-anonymous-sessions.repository,admin-anonymous-sessions.types}.ts`, `apps/api/src/admin/anonymous-sessions/models/admin-anonymous-response.dto.ts`; `apps/api/src/admin/models/{admin-models.module,admin-models.controller}.ts`, `apps/api/src/admin/models/dto/{create-model.dto,update-model.dto}.ts`, `apps/api/src/admin/models/models/admin-models-response.dto.ts`
- Modify: `apps/api/src/app.module.ts`, `packages/contracts/src/index.ts`, `packages/api-client/openapi.json` (regenerated)
- Test: append to `apps/api/test/admin-reporting.integration.spec.ts`, `apps/api/test/admin.helpers.spec.ts`; modify `apps/api/test/app.module.spec.ts`

**Interfaces:**
- Consumes: `UsageReportingService` (Task 8), `ModelAdministrationService` (Task 5), `AdminAuthGuard` (Task 6), `Paginated`, `UsageTotals`, `UsageBreakdownItem`, `UsageRow` (contracts).
- Produces (contracts, verbatim):

```ts
export type AdminUserSort = 'lastActivity' | 'totalTokens' | 'createdAt';

export interface UsageRangeQuery {
  from?: string;
  to?: string;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  usage: UsageTotals;
}

export interface AdminUserDetail {
  user: { id: string; email: string; displayName: string | null; createdAt: string };
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
}

export interface AdminAnonymousListItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  chatCount: number;
  usage: UsageTotals;
}

export interface AdminAnonymousDetail {
  session: { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; chatCount: number };
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
}
```

- Admin helpers: `toUsageRange(query: UsageRangeQuery): UsageRange` (throws `BadRequestException('"from" must be before "to".')` when both set and `from >= to`), `toPageRequest(query: PageQuery): PageRequest`, `escapeLike(value: string): string` — in `admin/common/admin-query.helpers.ts`.
- Routes per spec §4.4.

- [ ] **Step 1: Failing tests.**

Append to `apps/api/test/admin.helpers.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { escapeLike, toPageRequest, toUsageRange } from '../src/admin/common/admin-query.helpers';

describe('admin query helpers', () => {
  it('defaults paging', () => {
    expect(toPageRequest({})).toEqual({ page: 1, pageSize: 25 });
    expect(toPageRequest({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10 });
  });

  it('parses ranges and rejects inverted ones', () => {
    expect(toUsageRange({})).toEqual({});
    expect(toUsageRange({ from: '2026-09-01', to: '2026-10-01' })).toEqual({
      from: new Date('2026-09-01'),
      to: new Date('2026-10-01'),
    });
    expect(() => toUsageRange({ from: '2026-10-01', to: '2026-09-01' })).toThrow(BadRequestException);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
```

Append to `apps/api/test/admin-reporting.integration.spec.ts` a new top-level `describe('admin lists', …)` with its own `beforeAll` that creates three users with distinct emails (`list-<hex>-a@example.com`, `-b`, `-c`) via `prisma.user.create({ data: { email, password_hash: 'x' } })`, gives user **a** usage `(100 in / 10 out, 2026-09-10)`, user **b** usage `(1000 in / 100 out, 2026-09-05)`, user **c** none; creates one anonymous session with usage and one empty anonymous session with no chats; `afterAll` deletes the usage rows, users and sessions. Tests:

```ts
  it('sorts users by total tokens, zero-usage last, with numbers not strings', async () => {
    const page = await users.list({ search: hex, sort: 'totalTokens', range: {}, page: { page: 1, pageSize: 25 } });
    expect(page.items.map((u) => u.email)).toEqual([emailB, emailA, emailC]);
    expect(page.items[0]?.usage).toEqual({
      requests: 1, inputTokens: 1000, outputTokens: 100, totalTokens: 1100,
      lastActivityAt: '2026-09-05T00:00:00.000Z',
    });
    expect(typeof page.items[0]?.usage.inputTokens).toBe('number');
    expect(page.items[2]?.usage).toMatchObject({ requests: 0, totalTokens: 0, lastActivityAt: null });
    expect(page.total).toBe(3);
  });

  it('sorts by last activity with nulls last and paginates', async () => {
    const page = await users.list({ search: hex, sort: 'lastActivity', range: {}, page: { page: 1, pageSize: 2 } });
    expect(page.items.map((u) => u.email)).toEqual([emailA, emailB]);
    expect(page.total).toBe(3);
  });

  it('applies the date range to totals', async () => {
    const page = await users.list({
      search: hex, sort: 'totalTokens',
      range: { from: new Date('2026-09-08T00:00:00Z') },
      page: { page: 1, pageSize: 25 },
    });
    expect(page.items[0]?.email).toBe(emailA);
  });

  it('treats search wildcards literally', async () => {
    const page = await users.list({ search: '%', sort: 'createdAt', range: {}, page: { page: 1, pageSize: 25 } });
    expect(page.items.every((u) => u.email.includes('%'))).toBe(true);
  });

  it('returns user detail and 404 for unknown users', async () => {
    const detail = await users.get({ id: userA.id, range: {} });
    expect(detail.usage.inputTokens).toBe(100);
    expect(detail.breakdown).toHaveLength(1);
    await expect(users.get({ id: '00000000-0000-7000-8000-000000000000', range: {} })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only anonymous sessions with usage or chats', async () => {
    const page = await anonymous.list({ sort: 'createdAt', range: {}, page: { page: 1, pageSize: 100 } });
    const ids = page.items.map((s) => s.id);
    expect(ids).toContain(activeSessionId);
    expect(ids).not.toContain(emptySessionId);
  });
```

where `users = new AdminUsersService(new AdminUsersRepository(prisma), reporting)` and `anonymous = new AdminAnonymousSessionsService(new AdminAnonymousSessionsRepository(prisma), reporting)`; `hex` is the random token embedded in the three emails (search is a substring match).

In `test/app.module.spec.ts` add expected paths: `/api/v1/admin/auth/csrf`, `/api/v1/admin/auth/sign-in`, `/api/v1/admin/auth/refresh`, `/api/v1/admin/auth/sign-out`, `/api/v1/admin/auth/me`, `/api/v1/admin/users`, `/api/v1/admin/users/{id}`, `/api/v1/admin/users/{id}/usage`, `/api/v1/admin/anonymous-sessions`, `/api/v1/admin/anonymous-sessions/{id}`, `/api/v1/admin/anonymous-sessions/{id}/usage`, `/api/v1/admin/models`, `/api/v1/admin/models/{id}`.

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/api exec jest test/admin.helpers.spec.ts test/admin-reporting.integration.spec.ts test/app.module.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement shared admin pieces.**

Add the contracts block. `admin/common/admin-query.helpers.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { PageQuery, UsageRangeQuery } from '@js-rag-stack/contracts';
import type { PageRequest, UsageRange } from '../../usage/usage.types';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function toPageRequest(query: PageQuery): PageRequest {
  return { page: query.page ?? 1, pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE };
}

export function toUsageRange(query: UsageRangeQuery): UsageRange {
  const range: UsageRange = {};
  if (query.from) range.from = new Date(query.from);
  if (query.to) range.to = new Date(query.to);
  if (range.from && range.to && range.from >= range.to) {
    throw new BadRequestException('"from" must be before "to".');
  }
  return range;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
```

(`UsageRange`/`PageRequest` are type-only imports from the usage module — types are not providers, so this does not break module encapsulation.)

`admin/common/admin-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from './admin-query.helpers';

export class UsageRangeQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class UsagePageQueryDto extends UsageRangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}
```

`admin/common/admin-usage.dto.ts` — Swagger response classes `UsageTotalsDto`, `UsageBreakdownItemDto`, `UsageRowDto`, `UsageRowsPageDto` mirroring the contracts field-for-field (use `@ApiProperty({ enum: ['chat', 'summary'] })` for `kind`, `@ApiProperty({ type: String, nullable: true })` for nullable strings, `@ApiProperty({ type: UsageRowDto, isArray: true }) items`, plus `page`, `pageSize`, `total`).

`admin/common/admin-list.sql.ts` — shared SQL fragments:

```ts
import { Prisma } from '../../generated/prisma/client';
import type { UsageRange } from '../../usage/usage.types';

export function usageRangeSql(range: UsageRange): Prisma.Sql {
  return Prisma.sql`${range.from ? Prisma.sql` AND created_at >= ${range.from}` : Prisma.empty}${
    range.to ? Prisma.sql` AND created_at < ${range.to}` : Prisma.empty
  }`;
}

export function usageAggregateSql(ownerColumn: 'user_id' | 'anonymous_session_id', range: UsageRange): Prisma.Sql {
  const column = Prisma.raw(`"${ownerColumn}"`);
  return Prisma.sql`
    SELECT ${column} AS owner_id,
           COUNT(*)::int AS requests,
           SUM(input_tokens)::bigint AS input_tokens,
           SUM(output_tokens)::bigint AS output_tokens,
           SUM(input_tokens + output_tokens)::bigint AS total_tokens,
           MAX(created_at) AS last_activity_at
    FROM "usage_log"
    WHERE ${column} IS NOT NULL ${usageRangeSql(range)}
    GROUP BY ${column}`;
}

export interface UsageAggregateColumns {
  requests: number | null;
  input_tokens: bigint | null;
  output_tokens: bigint | null;
  last_activity_at: Date | null;
}
```

(`ownerColumn` is a closed union from code, never user input, so `Prisma.raw` is safe.)

Add a mapper in `admin/common/admin-query.helpers.ts`:

```ts
import type { UsageTotals } from '@js-rag-stack/contracts';
import { toSafeNumber } from '../../usage/usage.helpers';
import type { UsageAggregateColumns } from './admin-list.sql';

export function toUsageTotals(row: UsageAggregateColumns): UsageTotals {
  const inputTokens = toSafeNumber(row.input_tokens);
  const outputTokens = toSafeNumber(row.output_tokens);
  return {
    requests: row.requests ?? 0,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    lastActivityAt: row.last_activity_at?.toISOString() ?? null,
  };
}
```

- [ ] **Step 4: Implement AdminUsersModule.**

`admin/users/admin-users.types.ts`:

```ts
import type { AdminUserSort } from '@js-rag-stack/contracts';
import type { PageRequest, UsageRange } from '../../usage/usage.types';
import type { UsageAggregateColumns } from '../common/admin-list.sql';

export interface ListUsersParams {
  search?: string;
  sort: AdminUserSort;
  range: UsageRange;
  page: PageRequest;
}

export interface UserUsageRow extends UsageAggregateColumns {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
}

export interface GetUserParams {
  id: string;
  range: UsageRange;
}

export interface GetUserUsageParams extends GetUserParams {
  page: PageRequest;
}
```

`admin/users/admin-users.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { usageAggregateSql } from '../common/admin-list.sql';
import { escapeLike } from '../common/admin-query.helpers';
import type { ListUsersParams, UserUsageRow } from './admin-users.types';

const SORTS = {
  lastActivity: Prisma.sql`s.last_activity_at DESC NULLS LAST, u.created_at DESC`,
  totalTokens: Prisma.sql`COALESCE(s.total_tokens, 0) DESC, u.created_at DESC`,
  createdAt: Prisma.sql`u.created_at DESC`,
} as const;

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWithUsage({ search, sort, range, page }: ListUsersParams) {
    const filter = this.searchSql(search);
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<UserUsageRow[]>`
        SELECT u.id, u.email, u.display_name, u.created_at,
               s.requests, s.input_tokens, s.output_tokens, s.last_activity_at
        FROM "user" u
        LEFT JOIN (${usageAggregateSql('user_id', range)}) s ON s.owner_id = u.id
        ${filter}
        ORDER BY ${SORTS[sort]}, u.id
        LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM "user" u ${filter}`,
    ]);
    return { rows, total: counts[0]?.total ?? 0 };
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private searchSql(search: string | undefined): Prisma.Sql {
    const term = search?.trim();
    if (!term) return Prisma.empty;
    const pattern = `%${escapeLike(term)}%`;
    return Prisma.sql`WHERE u.email ILIKE ${pattern} OR u.display_name ILIKE ${pattern}`;
  }
}
```

`admin/users/admin-users.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUserDetail, AdminUserListItem, Paginated, UsageRow } from '@js-rag-stack/contracts';
import type { User } from '../../generated/prisma/client';
import { UsageReportingService } from '../../usage/usage-reporting.service';
import { toUsageTotals } from '../common/admin-query.helpers';
import { AdminUsersRepository } from './admin-users.repository';
import type { GetUserParams, GetUserUsageParams, ListUsersParams } from './admin-users.types';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: AdminUsersRepository,
    private readonly reporting: UsageReportingService,
  ) {}

  async list(params: ListUsersParams): Promise<Paginated<AdminUserListItem>> {
    const { rows, total } = await this.users.listWithUsage(params);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: row.created_at.toISOString(),
        usage: toUsageTotals(row),
      })),
      page: params.page.page,
      pageSize: params.page.pageSize,
      total,
    };
  }

  async get({ id, range }: GetUserParams): Promise<AdminUserDetail> {
    const user = await this.require(id);
    const owner = { type: 'user' as const, id };
    const [usage, breakdown] = await Promise.all([
      this.reporting.getTotals({ owner, range }),
      this.reporting.getBreakdown({ owner, range }),
    ]);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at.toISOString(),
      },
      usage,
      breakdown,
    };
  }

  async usage({ id, range, page }: GetUserUsageParams): Promise<Paginated<UsageRow>> {
    await this.require(id);
    return this.reporting.listRows({ owner: { type: 'user', id }, range, page });
  }

  private async require(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
```

`admin/users/dto/list-users-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { UsagePageQueryDto } from '../../common/admin-query.dto';

export const ADMIN_USER_SORTS: AdminUserSort[] = ['lastActivity', 'totalTokens', 'createdAt'];

export class ListUsersQueryDto extends UsagePageQueryDto {
  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;

  @ApiPropertyOptional({ enum: ADMIN_USER_SORTS, default: 'lastActivity' })
  @IsOptional()
  @IsIn(ADMIN_USER_SORTS)
  sort?: AdminUserSort;
}
```

`admin/users/models/admin-users-response.dto.ts` — Swagger classes `AdminUserListItemDto` (`id`, `email`, `displayName` nullable, `createdAt`, `usage: UsageTotalsDto`), `AdminUsersPageDto` (`items: AdminUserListItemDto[]`, `page`, `pageSize`, `total`), `AdminUserSummaryDto` (`id`, `email`, `displayName`, `createdAt`), `AdminUserDetailDto` (`user`, `usage`, `breakdown: UsageBreakdownItemDto[]`).

`admin/users/admin-users.controller.ts`:

```ts
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminUserDetail, AdminUserListItem, Paginated, UsageRow } from '@js-rag-stack/contracts';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { UsagePageQueryDto, UsageRangeQueryDto } from '../common/admin-query.dto';
import { toPageRequest, toUsageRange } from '../common/admin-query.helpers';
import { UsageRowsPageDto } from '../common/admin-usage.dto';
import { AdminUsersService } from './admin-users.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { AdminUserDetailDto, AdminUsersPageDto } from './models/admin-users-response.dto';

@ApiTags('admin-users')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with usage totals' })
  @ApiOkResponse({ type: AdminUsersPageDto })
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<AdminUserListItem>> {
    return this.users.list({
      search: query.search,
      sort: query.sort ?? 'lastActivity',
      range: toUsageRange(query),
      page: toPageRequest(query),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'User usage totals and per-model breakdown' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse()
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsageRangeQueryDto,
  ): Promise<AdminUserDetail> {
    return this.users.get({ id, range: toUsageRange(query) });
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Paginated usage log rows for a user' })
  @ApiOkResponse({ type: UsageRowsPageDto })
  @ApiNotFoundResponse()
  usage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: UsagePageQueryDto,
  ): Promise<Paginated<UsageRow>> {
    return this.users.usage({ id, range: toUsageRange(query), page: toPageRequest(query) });
  }
}
```

`admin/users/admin-users.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UsageModule } from '../../usage/usage.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersRepository } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AdminAuthModule, UsageModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersRepository, AdminUsersService],
})
export class AdminUsersModule {}
```

- [ ] **Step 5: Implement AdminAnonymousSessionsModule** — same shape as users, with these differences:

`admin-anonymous-sessions.types.ts`: `ListAnonymousParams { sort: AdminUserSort; range; page }`, `AnonymousUsageRow extends UsageAggregateColumns { id; created_at: Date; last_seen_at: Date; expires_at: Date; chat_count: number }`, `GetAnonymousParams`, `GetAnonymousUsageParams`.

`admin-anonymous-sessions.repository.ts`:

```ts
const SORTS = {
  lastActivity: Prisma.sql`s.last_activity_at DESC NULLS LAST, a.last_seen_at DESC`,
  totalTokens: Prisma.sql`COALESCE(s.total_tokens, 0) DESC, a.last_seen_at DESC`,
  createdAt: Prisma.sql`a.created_at DESC`,
} as const;

// Hide visitor sessions that never chatted nor used a model.
const HAS_ACTIVITY = Prisma.sql`
  WHERE EXISTS (SELECT 1 FROM "usage_log" l WHERE l.anonymous_session_id = a.id)
     OR EXISTS (SELECT 1 FROM "chat" c WHERE c.anonymous_session_id = a.id)`;

async listWithUsage({ sort, range, page }: ListAnonymousParams) {
  const [rows, counts] = await Promise.all([
    this.prisma.$queryRaw<AnonymousUsageRow[]>`
      SELECT a.id, a.created_at, a.last_seen_at, a.expires_at,
             (SELECT COUNT(*)::int FROM "chat" c WHERE c.anonymous_session_id = a.id) AS chat_count,
             s.requests, s.input_tokens, s.output_tokens, s.last_activity_at
      FROM "anonymous_session" a
      LEFT JOIN (${usageAggregateSql('anonymous_session_id', range)}) s ON s.owner_id = a.id
      ${HAS_ACTIVITY}
      ORDER BY ${SORTS[sort]}, a.id
      LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
    this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM "anonymous_session" a ${HAS_ACTIVITY}`,
  ]);
  return { rows, total: counts[0]?.total ?? 0 };
}

findById(id: string) {
  return this.prisma.anonymousSession.findUnique({
    where: { id },
    include: { _count: { select: { chats: true } } },
  });
}
```

Service maps to `AdminAnonymousListItem` / `AdminAnonymousDetail` (`session.chatCount` from `_count.chats`), owner `{ type: 'anonymous', id }`, `NotFoundException('Anonymous session not found.')`. Controller at `admin/anonymous-sessions` with the same three routes; its list query DTO is `ListAnonymousQueryDto extends UsagePageQueryDto` with only `sort`. Swagger DTOs `AdminAnonymousListItemDto`, `AdminAnonymousPageDto`, `AdminAnonymousDetailDto`. Module imports `AdminAuthModule, UsageModule`.

- [ ] **Step 6: Implement AdminModelsModule.**

`admin/models/dto/create-model.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const MIN_CONTEXT = 512;
export const MAX_CONTEXT = 1_048_576;

export class CreateModelDto {
  @ApiProperty({ example: 'llama3.2:3b', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ minimum: MIN_CONTEXT, maximum: MAX_CONTEXT, example: 8192 })
  @IsInt()
  @Min(MIN_CONTEXT)
  @Max(MAX_CONTEXT)
  maxContext!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
```

`admin/models/dto/update-model.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_CONTEXT, MIN_CONTEXT } from './create-model.dto';

export class UpdateModelDto {
  @ApiPropertyOptional({ minimum: MIN_CONTEXT, maximum: MAX_CONTEXT })
  @IsOptional()
  @IsInt()
  @Min(MIN_CONTEXT)
  @Max(MAX_CONTEXT)
  maxContext?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
```

`admin/models/models/admin-models-response.dto.ts` — `AdminModelDto` (all `AdminModel` fields; `installed` as `@ApiProperty({ type: Boolean, nullable: true })`) and `AdminModelsResponseDto { models: AdminModelDto[] }`.

`admin/models/admin-models.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminModel, AdminModelsResponse } from '@js-rag-stack/contracts';
import { ModelAdministrationService } from '../../models/model-administration.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { AdminModelDto, AdminModelsResponseDto } from './models/admin-models-response.dto';

@ApiTags('admin-models')
@ApiCookieAuth('admin_access_token')
@UseGuards(AdminAuthGuard)
@Controller('admin/models')
export class AdminModelsController {
  constructor(private readonly models: ModelAdministrationService) {}

  @Get()
  @ApiOperation({ summary: 'List all models with install status' })
  @ApiOkResponse({ type: AdminModelsResponseDto })
  async list(): Promise<AdminModelsResponse> {
    return { models: await this.models.listAll() };
  }

  @Post()
  @ApiOperation({ summary: 'Register a model' })
  @ApiOkResponse({ type: AdminModelDto })
  @ApiConflictResponse({ description: 'Duplicate name' })
  create(@Body() body: CreateModelDto): Promise<AdminModel> {
    return this.models.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit context size, availability or default' })
  @ApiOkResponse({ type: AdminModelDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Default model rules violated' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateModelDto,
  ): Promise<AdminModel> {
    return this.models.update({ id, input: body });
  }
}
```

`admin/models/admin-models.module.ts`: `imports: [AdminAuthModule, ModelsModule], controllers: [AdminModelsController]`.

`admin/admin.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AdminAnonymousSessionsModule } from './anonymous-sessions/admin-anonymous-sessions.module';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminModelsModule } from './models/admin-models.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [AdminAuthModule, AdminUsersModule, AdminAnonymousSessionsModule, AdminModelsModule],
})
export class AdminModule {}
```

`app.module.ts`: import `AdminModule` (after `ChatsModule`).

In `apps/api/src/common/swagger/openapi.ts`, if cookie auth schemes are registered (`addCookieAuth`), add `admin_access_token` and `admin_refresh_token` the same way the user cookies are registered.

- [ ] **Step 7: Run** `pnpm --filter @js-rag-stack/api exec jest && pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint && pnpm openapi:generate && pnpm openapi:check` — Expected: PASS; `packages/api-client/openapi.json` updated.

- [ ] **Step 8: Commit**

```bash
git add -A apps/api packages/contracts packages/api-client/openapi.json
git commit -m "feat(api): add admin users, anonymous sessions and models endpoints"
```

---
### Task 10: API client (shared http + admin client) and web "model unavailable" state

**Files:**
- Create: `packages/api-client/src/http.ts`, `packages/api-client/src/admin.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `apps/web/src/features/chat/model-selector.tsx`, `model-selector.test.tsx`, `chat.types.ts`, `chat-page.tsx`, `chat-page.test.tsx`

**Interfaces:**
- Produces:
  - `createHttp(options: { baseUrl: string; fetchImpl?: typeof fetch; csrfPath: string }): { request<T>(path: string, init?: RequestInit): Promise<T>; mutation<T>(path: string, init: RequestInit): Promise<T> }`; `ApiClientError`, `toApiError`, `toQuery(params: object): string` moved into `http.ts` and re-exported from `index.ts`.
  - `createAdminApiClient(options: ApiClientOptions)` returning: `signIn(input: AdminSignInInput): Promise<AdminAuthResponse>`, `signOut(): Promise<void>`, `getMe(): Promise<AdminAuthResponse>`, `listUsers(query?: ListUsersQuery): Promise<Paginated<AdminUserListItem>>`, `getUser(id: string, range?: UsageRangeQuery): Promise<AdminUserDetail>`, `getUserUsage(id: string, query?: UsagePageQuery): Promise<Paginated<UsageRow>>`, `listAnonymousSessions(query?: ListAnonymousQuery)`, `getAnonymousSession(id, range?)`, `getAnonymousSessionUsage(id, query?)`, `listModels(): Promise<AdminModelsResponse>`, `createModel(input: CreateModelInput): Promise<AdminModel>`, `updateModel(id: string, input: UpdateModelInput): Promise<AdminModel>`. Every call except `signIn` retries once after `POST /admin/auth/refresh` on a 401 (single in-flight refresh shared by concurrent calls).
  - Types (in `admin.ts`, exported): `type UsagePageQuery = PageQuery & UsageRangeQuery`, `type ListUsersQuery = UsagePageQuery & { search?: string; sort?: AdminUserSort }`, `type ListAnonymousQuery = UsagePageQuery & { sort?: AdminUserSort }`, `type AdminApiClient = ReturnType<typeof createAdminApiClient>`.
  - Web: `ModelSelectorProps.unavailableModel: string | null`.

- [ ] **Step 1: Failing web tests.**

Append to `apps/web/src/features/chat/model-selector.test.tsx`:

```tsx
  it('asks the user to switch when the chat model is unavailable', async () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[{ name: 'a', default: true, maxContext: 8192 }]}
        value="old:1b"
        unavailableModel="old:1b"
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'old:1b is no longer available — choose another model',
    );
    expect(screen.getByLabelText('Model')).toHaveValue('');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
```

Add `unavailableModel={null}` to the two existing renders.

Append to `apps/web/src/features/chat/chat-page.test.tsx`:

```tsx
  it('blocks sending in a chat whose model was disabled until another is chosen', async () => {
    api.getChat.mockResolvedValue({
      ...makeChat({ id: 'c1', selectedModel: 'old:1b', selectedModelAvailable: false }),
      nextCursor: null,
      messages: [],
      context: { usedTokens: null, maxTokens: 8192, summary: null, summarizedThroughMessageId: null },
    });
    renderPage('/chats/c1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'old:1b is no longer available — choose another model',
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'qwen2.5:1.5b');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeEnabled();
  });
```

(If the composer's textbox has an accessible name, use `getByRole('textbox', { name: … })` as the other tests do. If other tests in the file build `getChat` results with a fixture helper that already includes `context`, reuse it.)

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/web test` — Expected: FAIL (prop unknown / no alert).

- [ ] **Step 3: Implement the shared http module.**

`packages/api-client/src/http.ts`:

```ts
export interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export interface HttpOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  csrfPath: string;
}

export function createHttp({ baseUrl, fetchImpl = fetch, csrfPath }: HttpOptions) {
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${root}/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function mutation<T>(path: string, init: RequestInit): Promise<T> {
    const csrf = await request<{ csrfToken: string }>(csrfPath);
    return request<T>(path, {
      ...init,
      headers: { ...init.headers, 'X-CSRF-Token': csrf.csrfToken },
    });
  }

  return { root, fetchImpl, request, mutation };
}

export function toQuery(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
```

Move the body of the existing `toApiError` from `index.ts` into `http.ts` as `export async function toApiError(response: Response): Promise<ApiClientError>` (unchanged logic). In `index.ts`: delete `ApiErrorBody`, `ApiClientError`, `toQuery`, `toApiError`; add `export { ApiClientError, type ApiErrorBody } from './http';` and `export * from './admin';`; inside `createApiClient` replace the local `request`/`mutation` with `const { root, request, mutation } = createHttp({ baseUrl, fetchImpl, csrfPath: '/auth/csrf' });` (`streamMessage` keeps using `fetchImpl` and `root`, and `toApiError` imported from `./http`).

`packages/api-client/src/admin.ts`:

```ts
import type {
  AdminAnonymousDetail,
  AdminAnonymousListItem,
  AdminAuthResponse,
  AdminModel,
  AdminModelsResponse,
  AdminSignInInput,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserSort,
  CreateModelInput,
  PageQuery,
  Paginated,
  UpdateModelInput,
  UsageRangeQuery,
  UsageRow,
} from '@js-rag-stack/contracts';
import { ApiClientError, createHttp, toQuery } from './http';

export type UsagePageQuery = PageQuery & UsageRangeQuery;
export type ListUsersQuery = UsagePageQuery & { search?: string; sort?: AdminUserSort };
export type ListAnonymousQuery = UsagePageQuery & { sort?: AdminUserSort };

export function createAdminApiClient({
  baseUrl,
  fetchImpl,
}: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const http = createHttp({ baseUrl, fetchImpl, csrfPath: '/admin/auth/csrf' });
  let refreshing: Promise<void> | null = null;

  async function authed<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      refreshing ??= http
        .mutation<AdminAuthResponse>('/admin/auth/refresh', { method: 'POST' })
        .then(() => undefined)
        .finally(() => {
          refreshing = null;
        });
      await refreshing;
      return call();
    }
  }

  const get = <T>(path: string) => authed(() => http.request<T>(path));
  const id = (value: string) => encodeURIComponent(value);

  return {
    signIn: (input: AdminSignInInput) =>
      http.mutation<AdminAuthResponse>('/admin/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    signOut: () =>
      authed(() => http.mutation<void>('/admin/auth/sign-out', { method: 'POST' })),
    getMe: () => get<AdminAuthResponse>('/admin/auth/me'),
    listUsers: (query: ListUsersQuery = {}) =>
      get<Paginated<AdminUserListItem>>(`/admin/users${toQuery(query)}`),
    getUser: (userId: string, range: UsageRangeQuery = {}) =>
      get<AdminUserDetail>(`/admin/users/${id(userId)}${toQuery(range)}`),
    getUserUsage: (userId: string, query: UsagePageQuery = {}) =>
      get<Paginated<UsageRow>>(`/admin/users/${id(userId)}/usage${toQuery(query)}`),
    listAnonymousSessions: (query: ListAnonymousQuery = {}) =>
      get<Paginated<AdminAnonymousListItem>>(`/admin/anonymous-sessions${toQuery(query)}`),
    getAnonymousSession: (sessionId: string, range: UsageRangeQuery = {}) =>
      get<AdminAnonymousDetail>(`/admin/anonymous-sessions/${id(sessionId)}${toQuery(range)}`),
    getAnonymousSessionUsage: (sessionId: string, query: UsagePageQuery = {}) =>
      get<Paginated<UsageRow>>(
        `/admin/anonymous-sessions/${id(sessionId)}/usage${toQuery(query)}`,
      ),
    listModels: () => get<AdminModelsResponse>('/admin/models'),
    createModel: (input: CreateModelInput) =>
      authed(() =>
        http.mutation<AdminModel>('/admin/models', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    updateModel: (modelId: string, input: UpdateModelInput) =>
      authed(() =>
        http.mutation<AdminModel>(`/admin/models/${id(modelId)}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      ),
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
```

- [ ] **Step 4: Implement the web change.**

`chat.types.ts` `ModelSelectorProps`: add `unavailableModel: string | null;`.

`model-selector.tsx` — replace the returned JSX (after the empty-list branch):

```tsx
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Model
      </label>
      <select
        id={id}
        value={unavailableModel ? '' : (value ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg hover:bg-surface focus:border-accent disabled:opacity-60"
      >
        {unavailableModel && (
          <option value="" disabled>
            Choose a model
          </option>
        )}
        {models.map((model) => (
          <option key={model.name} value={model.name}>
            {model.name}
            {model.default ? ' (default)' : ''}
          </option>
        ))}
      </select>
      {unavailableModel && (
        <p
          role="alert"
          className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
        >
          {unavailableModel} is no longer available — choose another model
        </p>
      )}
    </div>
  );
```

(destructure `unavailableModel` in the signature.)

`chat-page.tsx` — after `activeModelInfo` is computed:

```tsx
  const hasOverride = override?.scope === scope;
  const chatModelDisabled =
    !hasOverride && chat.data?.pages[0]?.selectedModelAvailable === false;
  const unavailableModel =
    activeModel && (chatModelDisabled || (models.isSuccess && !activeModelInfo))
      ? activeModel
      : null;
```

Pass `unavailableModel={unavailableModel}` to `<ModelSelector>`, change the composer's `disabled={!activeModel}` to `disabled={!activeModel || Boolean(unavailableModel)}`, and make `handleSend` start with `if (!activeModel || unavailableModel) return false;`. Update `makeChat` in `apps/web/src/test/fixtures.ts` if Task 3 did not already add `selectedModelAvailable: true`.

- [ ] **Step 5: Run** `pnpm --filter @js-rag-stack/web test && pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/api-client typecheck && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/api-client lint` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A packages/api-client/src apps/web/src
git commit -m "feat: admin API client and unavailable-model prompt in web"
```

---

### Task 11: `apps/admin` scaffold — auth, shell, shared components

**Files:**
- Create: `apps/admin/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.mjs`
- Create: `apps/admin/src/main.tsx`, `app.tsx`, `styles.css`, `lib/api.ts`, `lib/format.ts`, `lib/format.test.ts`, `lib/admin-client.test.ts`, `test/setup.ts`, `test/render.tsx`, `test/fixtures.ts`
- Create: `apps/admin/src/features/auth/use-admin.ts`, `login-page.tsx`, `login-page.test.tsx`, `require-admin.tsx`, `require-admin.test.tsx`
- Create: `apps/admin/src/components/admin-shell.tsx`, `pagination.tsx`, `range-filter.tsx`, `usage-totals.tsx`, `usage-breakdown-table.tsx`, `usage-log-table.tsx`, `components.test.tsx`
- Modify: root `package.json` (add `"admin": "pnpm --filter @js-rag-stack/admin dev"`), `pnpm-lock.yaml` (via install)

**Interfaces:**
- Consumes: `createAdminApiClient`, `ApiClientError` (Task 10); contracts types.
- Produces (used by Tasks 12–13):
  - `api: AdminApiClient` (`src/lib/api.ts`), `toErrorMessage(error: unknown): string`, `isUnauthorized(error: unknown): boolean`.
  - `formatNumber(n: number): string` (en-US grouping), `formatDateTime(iso: string | null): string` (`'—'` for null), `shortId(id: string): string` (first 8 chars), `toIsoStart(date: string): string | undefined` (`'YYYY-MM-DD'` → ISO at 00:00 UTC; `''` → undefined), `toIsoEndExclusive(date: string): string | undefined` (next day 00:00 UTC) — `src/lib/format.ts`.
  - `useAdmin()` → `{ admin: AdminProfile | null; isLoading: boolean }` (query key `['admin','me']`), `useSignOut()` mutation.
  - `<RequireAdmin>` route element: loading text, redirect to `/login` on 401, else `<Outlet />` inside `<AdminShell>`.
  - `<AdminShell admin={AdminProfile}>` with nav links `Users` → `/users`, `Anonymous` → `/anonymous`, `Models` → `/models`, admin email, `Sign out` button.
  - `<Pagination page pageSize total onPage(page: number)>`; renders `Page X of Y`, `Previous`/`Next` buttons.
  - `<RangeFilter value={{ from: string; to: string }} onChange(value)>` — two `<input type="date">` labelled `From` and `To`.
  - `<UsageTotalsCards usage={UsageTotals}>` — four stat tiles: `Requests`, `Input tokens`, `Output tokens`, `Last activity`.
  - `<UsageBreakdownTable items={UsageBreakdownItem[]}>`, `<UsageLogTable rows={UsageRow[]}>` — plain `<table>`s with `<caption className="sr-only">`.

- [ ] **Step 1: Scaffold the package** (copy versions exactly from `apps/web/package.json`).

`apps/admin/package.json`:

```json
{
  "name": "@js-rag-stack/admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "lint": "eslint src vite.config.ts",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/inter": "5.3.0",
    "@js-rag-stack/api-client": "workspace:*",
    "@js-rag-stack/contracts": "workspace:*",
    "@tanstack/react-query": "5.101.0",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-router-dom": "7.17.0"
  },
  "devDependencies": {
    "@js-rag-stack/eslint-config": "workspace:*",
    "@js-rag-stack/typescript-config": "workspace:*",
    "@tailwindcss/vite": "4.3.0",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "25.9.2",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "eslint": "10.4.1",
    "jsdom": "29.1.1",
    "tailwindcss": "4.3.0",
    "typescript": "7.0.2",
    "vite": "8.0.16",
    "vitest": "4.1.8"
  }
}
```

`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.mjs`: copy from `apps/web` verbatim.

`vite.config.ts`: copy `apps/web/vite.config.ts`, change `port: 5173` → `port: 5174`, and `setupFiles: './src/test/setup.ts'` stays.

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="robots" content="noindex" />
    <title>Admin · Local LLM Chat</title>
  </head>
  <body class="bg-bg text-fg">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/styles.css`: copy from `apps/web/src/styles.css` the `@import 'tailwindcss';` line, the `:root { … }` token block, the `:root[data-theme=…]` blocks, `@theme { … }` and `@theme inline { … }` blocks, and the `body` base rule if present. Do **not** copy chat-specific rules (markdown, code blocks, scrollbars for the message list).

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

`src/test/render.tsx`: copy from `apps/web/src/test/render.tsx` verbatim.

`src/test/fixtures.ts`:

```ts
import type {
  AdminAnonymousListItem,
  AdminModel,
  AdminUserListItem,
  UsageTotals,
} from '@js-rag-stack/contracts';

export function makeTotals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    requests: 3,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    lastActivityAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeUser(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: '0199a000-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada',
    createdAt: '2026-09-01T10:00:00.000Z',
    usage: makeTotals(),
    ...overrides,
  };
}

export function makeAnonymous(
  overrides: Partial<AdminAnonymousListItem> = {},
): AdminAnonymousListItem {
  return {
    id: '0199a000-0000-7000-8000-0000000000aa',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastSeenAt: '2026-09-30T10:00:00.000Z',
    expiresAt: '2026-10-31T10:00:00.000Z',
    chatCount: 2,
    usage: makeTotals(),
    ...overrides,
  };
}

export function makeModel(overrides: Partial<AdminModel> = {}): AdminModel {
  return {
    id: '0199a000-0000-7000-8000-0000000000m1',
    name: 'qwen2.5:1.5b',
    maxContext: 8192,
    isAvailable: true,
    isDefault: true,
    installed: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}
```

Run `pnpm install` at the repo root so the workspace links the new package and updates `pnpm-lock.yaml`.

- [ ] **Step 2: Failing tests.**

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatNumber, shortId, toIsoEndExclusive, toIsoStart } from './format';

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
```

`src/lib/admin-client.test.ts`:

```ts
import { createAdminApiClient } from '@js-rag-stack/api-client';
import { describe, expect, it, vi } from 'vitest';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createAdminApiClient', () => {
  it('refreshes once on 401 and retries the request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(json(200, { admin: { id: 'a', email: 'a@b.co', displayName: null } }))
      .mockResolvedValueOnce(json(200, { admin: { id: 'a', email: 'a@b.co', displayName: null } }));
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await expect(client.getMe()).resolves.toMatchObject({ admin: { id: 'a' } });
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/v1/admin/auth/me',
      '/api/v1/admin/auth/csrf',
      '/api/v1/admin/auth/refresh',
      '/api/v1/admin/auth/me',
    ]);
  });

  it('surfaces 401 when refresh fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 't' }))
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }));
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await expect(client.getMe()).rejects.toMatchObject({ status: 401 });
  });

  it('serializes list queries, skipping empty values', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(200, { items: [], page: 1, pageSize: 25, total: 0 }));
    const client = createAdminApiClient({ baseUrl: '', fetchImpl });
    await client.listUsers({ search: '', sort: 'totalTokens', page: 2 });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/admin/users?sort=totalTokens&page=2');
  });
});
```

`src/features/auth/login-page.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { LoginPage } from './login-page';

const api = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderLogin() {
  return renderWithProviders({
    route: '/login',
    ui: (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/users" element={<p>Users landing</p>} />
      </Routes>
    ),
  });
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs in and navigates to users', async () => {
    api.signIn.mockResolvedValue({ admin: { id: 'a', email: 'a@b.co', displayName: null } });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'admin-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Users landing')).toBeInTheDocument();
    expect(api.signIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'admin-password-123' });
  });

  it('shows the server error', async () => {
    api.signIn.mockRejectedValue(new ApiClientError(401, 'UNAUTHORIZED', 'Invalid email or password.'));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope-nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});
```

`src/features/auth/require-admin.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RequireAdmin } from './require-admin';

const api = vi.hoisted(() => ({ getMe: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderGuarded() {
  return renderWithProviders({
    route: '/users',
    ui: (
      <Routes>
        <Route element={<RequireAdmin />}>
          <Route path="/users" element={<p>Secret users</p>} />
        </Route>
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    ),
  });
}

describe('RequireAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects to login when unauthenticated', async () => {
    api.getMe.mockRejectedValue(new ApiClientError(401, 'UNAUTHORIZED', 'no'));
    renderGuarded();
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });

  it('renders the shell with nav and signs out', async () => {
    api.getMe.mockResolvedValue({ admin: { id: 'a', email: 'ops@example.com', displayName: null } });
    api.signOut.mockResolvedValue(undefined);
    renderGuarded();
    expect(await screen.findByText('Secret users')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: 'Anonymous' })).toHaveAttribute('href', '/anonymous');
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '/models');
    expect(screen.getByText('ops@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });
});
```

`src/components/components.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTotals } from '../test/fixtures';
import { Pagination } from './pagination';
import { RangeFilter } from './range-filter';
import { UsageTotalsCards } from './usage-totals';

describe('shared components', () => {
  it('paginates and disables edges', async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={25} total={60} onPage={onPage} />);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('shows Page 1 of 1 for empty results', () => {
    render(<Pagination page={1} pageSize={25} total={0} onPage={vi.fn()} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('reports date range changes', async () => {
    const onChange = vi.fn();
    render(<RangeFilter value={{ from: '', to: '' }} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '' });
  });

  it('renders usage totals', () => {
    render(<UsageTotalsCards usage={makeTotals({ inputTokens: 1200 })} />);
    expect(screen.getByText('Input tokens').nextSibling).toHaveTextContent('1,200');
  });
});
```

- [ ] **Step 3: Run** `pnpm --filter @js-rag-stack/admin test` — Expected: FAIL (modules missing).

- [ ] **Step 4: Implement.**

`src/lib/api.ts`:

```ts
import { ApiClientError, createAdminApiClient } from '@js-rag-stack/api-client';

export const api = createAdminApiClient({ baseUrl: '' });

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
```

`src/lib/format.ts`:

```ts
const numberFormat = new Intl.NumberFormat('en-US');
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function toIsoStart(date: string): string | undefined {
  return date ? new Date(`${date}T00:00:00.000Z`).toISOString() : undefined;
}

export function toIsoEndExclusive(date: string): string | undefined {
  if (!date) return undefined;
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString();
}
```

`src/features/auth/use-admin.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isUnauthorized } from '../../lib/api';

export const ADMIN_QUERY_KEY = ['admin', 'me'] as const;

export function useAdmin() {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: api.getMe,
    retry: (count, error) => !isUnauthorized(error) && count < 1,
  });
  return {
    admin: query.data?.admin ?? null,
    isLoading: query.isPending,
    isUnauthorized: query.isError && isUnauthorized(query.error),
    error: query.error,
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.signOut,
    onSettled: () => {
      queryClient.clear();
    },
  });
}
```

`src/features/auth/login-page.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { ADMIN_QUERY_KEY } from './use-admin';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useMutation({
    mutationFn: api.signIn,
    onSuccess: (data) => {
      queryClient.setQueryData(ADMIN_QUERY_KEY, data);
      void navigate('/users', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate({ email, password });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-semibold text-fg">Admin sign in</h1>
        <label className="block space-y-1 text-sm">
          <span className="text-fg-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-fg focus:border-accent"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-fg-muted">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-fg focus:border-accent"
          />
        </label>
        {signIn.isError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {toErrorMessage(signIn.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={signIn.isPending}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
```

(Use `<label>` wrapping so `getByLabelText('Email')` works — the label's accessible name is its text content; if Testing Library includes the input value in the name, switch to `htmlFor`/`useId` pairs.)

`src/components/admin-shell.tsx`:

```tsx
import type { AdminProfile } from '@js-rag-stack/contracts';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSignOut } from '../features/auth/use-admin';

const NAV = [
  { to: '/users', label: 'Users' },
  { to: '/anonymous', label: 'Anonymous' },
  { to: '/models', label: 'Models' },
];

export function AdminShell({ admin, children }: { admin: AdminProfile; children: ReactNode }) {
  const navigate = useNavigate();
  const signOut = useSignOut();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-surface p-4 md:w-56 md:border-r md:border-b-0">
        <p className="text-sm font-semibold">Admin</p>
        <nav className="flex gap-1 md:flex-col">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-xs text-fg-subtle">
          <p className="truncate">{admin.email}</p>
          <button
            type="button"
            onClick={() =>
              signOut.mutate(undefined, {
                onSettled: () => void navigate('/login', { replace: true }),
              })
            }
            className="rounded-lg border border-border px-2 py-1 text-fg-muted hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
```

`src/features/auth/require-admin.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom';
import { AdminShell } from '../../components/admin-shell';
import { toErrorMessage } from '../../lib/api';
import { useAdmin } from './use-admin';

export function RequireAdmin() {
  const { admin, isLoading, isUnauthorized, error } = useAdmin();

  if (isLoading) {
    return <p className="p-6 text-sm text-fg-muted">Loading…</p>;
  }
  if (isUnauthorized || (!admin && !error)) {
    return <Navigate to="/login" replace />;
  }
  if (!admin) {
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        {toErrorMessage(error)}
      </p>
    );
  }
  return (
    <AdminShell admin={admin}>
      <Outlet />
    </AdminShell>
  );
}
```

`src/components/pagination.tsx`:

```tsx
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const button =
    'rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-surface disabled:opacity-50';
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-fg-muted">
      <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
```

`src/components/range-filter.tsx`:

```tsx
import { useId } from 'react';

export interface DateRangeValue {
  from: string;
  to: string;
}

export function RangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const input = 'rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={fromId} className="text-fg-muted">From</label>
      <input id={fromId} type="date" className={input} value={value.from} max={value.to || undefined}
        onChange={(event) => onChange({ ...value, from: event.target.value })} />
      <label htmlFor={toId} className="text-fg-muted">To</label>
      <input id={toId} type="date" className={input} value={value.to} min={value.from || undefined}
        onChange={(event) => onChange({ ...value, to: event.target.value })} />
    </div>
  );
}
```

`src/components/usage-totals.tsx`:

```tsx
import type { UsageTotals } from '@js-rag-stack/contracts';
import { formatDateTime, formatNumber } from '../lib/format';

export function UsageTotalsCards({ usage }: { usage: UsageTotals }) {
  const tiles = [
    { label: 'Requests', value: formatNumber(usage.requests) },
    { label: 'Input tokens', value: formatNumber(usage.inputTokens) },
    { label: 'Output tokens', value: formatNumber(usage.outputTokens) },
    { label: 'Last activity', value: formatDateTime(usage.lastActivityAt) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs text-fg-subtle">{tile.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-fg">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

`src/components/usage-breakdown-table.tsx` and `usage-log-table.tsx` — plain tables with shared classes `w-full text-left text-sm`, header row `text-xs text-fg-subtle`, body rows `border-t border-border`, numeric cells `text-right tabular-nums` formatted with `formatNumber`, dates with `formatDateTime`, an empty state row `No usage yet.` spanning all columns. Columns — breakdown: `Model`, `Kind`, `Requests`, `Input`, `Output`; log: `Date`, `Model`, `Kind`, `Input`, `Output`, `Chat` (`shortId(chatId)` or `—`). Captions (`sr-only`): `Usage by model`, `Usage log`. Wrap each table in `<div className="overflow-x-auto">` so phones scroll the table, not the page.

`src/app.tsx` (pages from Tasks 12–13 are stubbed here as placeholders and replaced in those tasks — use these exact temporary components so this task's build passes):

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/login-page';
import { RequireAdmin } from './features/auth/require-admin';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/users" element={<h1 className="text-lg font-semibold">Users</h1>} />
        <Route path="/anonymous" element={<h1 className="text-lg font-semibold">Anonymous</h1>} />
        <Route path="/models" element={<h1 className="text-lg font-semibold">Models</h1>} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
```

`src/main.tsx`: copy `apps/web/src/main.tsx` verbatim (same QueryClient defaults, BrowserRouter, Inter font, `./styles.css`).

Root `package.json` scripts: add `"admin": "pnpm --filter @js-rag-stack/admin dev",`.

- [ ] **Step 5: Run** `pnpm --filter @js-rag-stack/admin test && pnpm --filter @js-rag-stack/admin typecheck && pnpm --filter @js-rag-stack/admin lint && pnpm --filter @js-rag-stack/admin build` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/admin package.json pnpm-lock.yaml
git commit -m "feat(admin): scaffold admin app with auth and shell"
```

---

### Task 12: Admin users & anonymous pages

**Files:**
- Create: `apps/admin/src/features/users/users-page.tsx`, `user-detail-page.tsx`, `users.test.tsx`
- Create: `apps/admin/src/features/anonymous/anonymous-page.tsx`, `anonymous-detail-page.tsx`, `anonymous.test.tsx`
- Create: `apps/admin/src/components/usage-detail.tsx` (shared detail body), `apps/admin/src/lib/use-list-state.ts`
- Modify: `apps/admin/src/app.tsx`

**Interfaces:**
- Consumes: `api.listUsers/getUser/getUserUsage/listAnonymousSessions/getAnonymousSession/getAnonymousSessionUsage`, shared components & format helpers (Task 11).
- Produces:
  - `useListState()` → `{ page, setPage, range, setRange, rangeQuery }` where `rangeQuery = { from: toIsoStart(range.from), to: toIsoEndExclusive(range.to) }`; changing the range resets `page` to 1. State lives in URL search params (`page`, `from`, `to`, plus page-specific `search`, `sort`) via `useSearchParams` so links/back button work.
  - `<UsageDetail detailQueryKey range usage breakdown rowsQuery>` is **not** generic-over-API; instead export `UsageDetailBody({ usage, breakdown, rows, page, onPage, isRowsLoading })`.

- [ ] **Step 1: Failing tests.**

`src/features/users/users.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTotals, makeUser } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { UserDetailPage } from './user-detail-page';
import { UsersPage } from './users-page';

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  getUserUsage: vi.fn(),
}));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderAt(route: string) {
  return renderWithProviders({
    route,
    ui: (
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId" element={<UserDetailPage />} />
      </Routes>
    ),
  });
}

describe('users pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listUsers.mockResolvedValue({
      items: [
        makeUser(),
        makeUser({ id: 'u2', email: 'bob@example.com', displayName: null, usage: makeTotals({ requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, lastActivityAt: null }) }),
      ],
      page: 1,
      pageSize: 25,
      total: 2,
    });
  });

  it('lists users with totals and default sort', async () => {
    renderAt('/users');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(within(table).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(table).getByText('1,200')).toBeInTheDocument();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    expect(api.listUsers).toHaveBeenCalledWith({ page: 1, sort: 'lastActivity', search: undefined, from: undefined, to: undefined });
  });

  it('searches, sorts and filters by date, resetting to page 1', async () => {
    renderAt('/users?page=2');
    await screen.findByRole('table', { name: 'Users' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search users' }), 'ada');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'totalTokens');
    await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
    await waitFor(() =>
      expect(api.listUsers).toHaveBeenLastCalledWith({
        page: 1,
        sort: 'totalTokens',
        search: 'ada',
        from: '2026-09-01T00:00:00.000Z',
        to: undefined,
      }),
    );
  });

  it('links to user detail and shows totals, breakdown and log', async () => {
    api.getUser.mockResolvedValue({
      user: { id: 'u1', email: 'ada@example.com', displayName: 'Ada', createdAt: '2026-09-01T10:00:00.000Z' },
      usage: makeTotals(),
      breakdown: [{ model: 'qwen2.5:1.5b', kind: 'chat', requests: 3, inputTokens: 1200, outputTokens: 300 }],
    });
    api.getUserUsage.mockResolvedValue({
      items: [{ id: 'r1', createdAt: '2026-09-30T10:00:00.000Z', model: 'qwen2.5:1.5b', kind: 'summary', inputTokens: 40, outputTokens: 4, chatId: null }],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    renderAt('/users/u1');
    expect(await screen.findByRole('heading', { name: 'ada@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Usage by model' })).toHaveTextContent('chat');
    expect(await screen.findByRole('table', { name: 'Usage log' })).toHaveTextContent('summary');
  });

  it('shows not found for unknown users', async () => {
    const { ApiClientError } = await import('@js-rag-stack/api-client');
    api.getUser.mockRejectedValue(new ApiClientError(404, 'NOT_FOUND', 'User not found.'));
    api.getUserUsage.mockRejectedValue(new ApiClientError(404, 'NOT_FOUND', 'User not found.'));
    renderAt('/users/missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('User not found.');
  });
});
```

`src/features/anonymous/anonymous.test.tsx` — same structure against `AnonymousPage`/`AnonymousDetailPage` at `/anonymous` and `/anonymous/:sessionId`, mocking `listAnonymousSessions`, `getAnonymousSession`, `getAnonymousSessionUsage`; asserts:
  - table named `Anonymous sessions` shows `shortId` (`0199a000`) as a link to `/anonymous/<full id>`, the chat count `2`, and `1,200` input tokens;
  - there is **no** searchbox;
  - sort select + date range call `listAnonymousSessions` with `{ page: 1, sort, from, to }`;
  - detail heading is `Session 0199a000` and shows `Created`, `Last seen`, `Expires`, `Chats` values plus the breakdown and log tables.

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/admin test` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/lib/use-list-state.ts`:

```ts
import { useSearchParams } from 'react-router-dom';
import type { DateRangeValue } from '../components/range-filter';
import { toIsoEndExclusive, toIsoStart } from './format';

export function useListState() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const range: DateRangeValue = { from: params.get('from') ?? '', to: params.get('to') ?? '' };

  function update(changes: Record<string, string | number | undefined>, resetPage: boolean) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (resetPage) next.delete('page');
      return next;
    }, { replace: true });
  }

  return {
    page,
    range,
    rangeQuery: { from: toIsoStart(range.from), to: toIsoEndExclusive(range.to) },
    param: (key: string) => params.get(key) ?? '',
    setPage: (value: number) => update({ page: value > 1 ? value : undefined }, false),
    setRange: (value: DateRangeValue) => update({ from: value.from, to: value.to }, true),
    setParam: (key: string, value: string) => update({ [key]: value }, true),
  };
}
```

`src/features/users/users-page.tsx`:

```tsx
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../components/pagination';
import { RangeFilter } from '../../components/range-filter';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useListState } from '../../lib/use-list-state';

export const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: 'lastActivity', label: 'Last activity' },
  { value: 'totalTokens', label: 'Total tokens' },
  { value: 'createdAt', label: 'Newest' },
];

export function UsersPage() {
  const list = useListState();
  const sortId = useId();
  const search = list.param('search');
  const sort = (list.param('sort') || 'lastActivity') as AdminUserSort;
  const query = { page: list.page, sort, search: search || undefined, ...list.rangeQuery };
  const users = useQuery({
    queryKey: ['users', query],
    queryFn: () => api.listUsers(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Users</h1>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search email or name"
          value={search}
          onChange={(event) => list.setParam('search', event.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <label htmlFor={sortId} className="text-sm text-fg-muted">Sort by</label>
        <select id={sortId} value={sort} onChange={(event) => list.setParam('sort', event.target.value)}
          className="rounded-lg border border-border bg-bg px-2 py-1 text-sm">
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <RangeFilter value={list.range} onChange={list.setRange} />
      </div>
      {users.isError && (
        <p role="alert" className="text-sm text-danger">{toErrorMessage(users.error)}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="bg-surface text-xs text-fg-subtle">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Requests</th>
              <th className="px-3 py-2 text-right">Input</th>
              <th className="px-3 py-2 text-right">Output</th>
              <th className="px-3 py-2">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((user) => (
              <tr key={user.id} className="border-t border-border hover:bg-surface">
                <td className="px-3 py-2">
                  <Link to={`/users/${user.id}`} className="text-accent hover:underline">{user.email}</Link>
                </td>
                <td className="px-3 py-2">{user.displayName ?? '—'}</td>
                <td className="px-3 py-2">{formatDateTime(user.createdAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(user.usage.requests)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(user.usage.inputTokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(user.usage.outputTokens)}</td>
                <td className="px-3 py-2">{formatDateTime(user.usage.lastActivityAt)}</td>
              </tr>
            ))}
            {users.data?.items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-fg-subtle">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {users.data && (
        <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={list.setPage} />
      )}
    </section>
  );
}
```

Note the test expects `listUsers` called with `{ page, sort, search, from, to }` — the `query` object above has exactly those keys.

`src/components/usage-detail.tsx`:

```tsx
import type { Paginated, UsageBreakdownItem, UsageRow, UsageTotals } from '@js-rag-stack/contracts';
import { Pagination } from './pagination';
import { UsageBreakdownTable } from './usage-breakdown-table';
import { UsageLogTable } from './usage-log-table';
import { UsageTotalsCards } from './usage-totals';

export function UsageDetailBody({
  usage,
  breakdown,
  rows,
  onPage,
}: {
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
  rows: Paginated<UsageRow> | undefined;
  onPage: (page: number) => void;
}) {
  return (
    <div className="space-y-6">
      <UsageTotalsCards usage={usage} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By model</h2>
        <UsageBreakdownTable items={breakdown} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Usage log</h2>
        {rows ? (
          <>
            <UsageLogTable rows={rows.items} />
            <Pagination page={rows.page} pageSize={rows.pageSize} total={rows.total} onPage={onPage} />
          </>
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}
```

`src/features/users/user-detail-page.tsx`:

```tsx
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { RangeFilter } from '../../components/range-filter';
import { UsageDetailBody } from '../../components/usage-detail';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useListState } from '../../lib/use-list-state';

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const list = useListState();
  const detail = useQuery({
    queryKey: ['users', userId, list.rangeQuery],
    queryFn: () => api.getUser(userId, list.rangeQuery),
  });
  const rows = useQuery({
    queryKey: ['users', userId, 'usage', list.page, list.rangeQuery],
    queryFn: () => api.getUserUsage(userId, { page: list.page, ...list.rangeQuery }),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <Link to="/users" className="text-sm text-accent hover:underline">← Users</Link>
      {detail.isError && (
        <p role="alert" className="text-sm text-danger">{toErrorMessage(detail.error)}</p>
      )}
      {detail.data && (
        <>
          <header className="space-y-1">
            <h1 className="text-lg font-semibold">{detail.data.user.email}</h1>
            <p className="text-sm text-fg-muted">
              {detail.data.user.displayName ?? 'No name'} · joined {formatDateTime(detail.data.user.createdAt)}
            </p>
          </header>
          <RangeFilter value={list.range} onChange={list.setRange} />
          <UsageDetailBody
            usage={detail.data.usage}
            breakdown={detail.data.breakdown}
            rows={rows.data}
            onPage={list.setPage}
          />
        </>
      )}
    </section>
  );
}
```

Anonymous pages mirror these: `AnonymousPage` (table caption `Anonymous sessions`, columns `Session` (link with `shortId`), `Created`, `Last seen`, `Chats`, `Requests`, `Input`, `Output`, `Last activity`; sort select reusing `SORT_OPTIONS` exported from users-page — move `SORT_OPTIONS` to `src/lib/sort-options.ts` and import in both; no search), `AnonymousDetailPage` (heading `Session {shortId(id)}`, a `<dl>` with `Created`, `Last seen`, `Expires`, `Chats`, then `RangeFilter` + `UsageDetailBody`).

`app.tsx`: replace the `/users` and `/anonymous` placeholders with `UsersPage`, `/users/:userId` → `UserDetailPage`, `AnonymousPage`, `/anonymous/:sessionId` → `AnonymousDetailPage`.

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/admin test && pnpm --filter @js-rag-stack/admin typecheck && pnpm --filter @js-rag-stack/admin lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/admin/src
git commit -m "feat(admin): users and anonymous usage pages"
```

---

### Task 13: Admin models page

**Files:**
- Create: `apps/admin/src/features/models/models-page.tsx`, `add-model-form.tsx`, `model-row.tsx`, `models.test.tsx`
- Modify: `apps/admin/src/app.tsx`

**Interfaces:**
- Consumes: `api.listModels/createModel/updateModel`, `makeModel` fixture.
- Produces: `/models` route.

- [ ] **Step 1: Failing test** — `src/features/models/models.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeModel } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { ModelsPage } from './models-page';

const api = vi.hoisted(() => ({
  listModels: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
}));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

const qwen = makeModel();
const llama = makeModel({ id: 'm2', name: 'llama3.2:3b', isDefault: false, installed: false });

function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('ModelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listModels.mockResolvedValue({ models: [qwen, llama] });
  });

  it('lists models with status', async () => {
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    expect(within(row('qwen2.5')).getByText('Default')).toBeInTheDocument();
    expect(within(row('llama3.2')).getByText('Not installed')).toBeInTheDocument();
    expect(within(row('qwen2.5')).getByRole('checkbox', { name: 'Available' })).toBeDisabled();
  });

  it('adds a model', async () => {
    api.createModel.mockResolvedValue(makeModel({ id: 'm3', name: 'phi4:14b', isDefault: false }));
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.type(screen.getByLabelText('Model name'), 'phi4:14b');
    await userEvent.clear(screen.getByLabelText('Max context'));
    await userEvent.type(screen.getByLabelText('Max context'), '16384');
    await userEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(api.createModel).toHaveBeenCalledWith({ name: 'phi4:14b', maxContext: 16384 });
    expect(api.listModels).toHaveBeenCalledTimes(2);
  });

  it('toggles availability, sets default, and edits max context', async () => {
    api.updateModel.mockResolvedValue(llama);
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.click(within(row('llama3.2')).getByRole('checkbox', { name: 'Available' }));
    expect(api.updateModel).toHaveBeenCalledWith('m2', { isAvailable: false });
    await userEvent.click(within(row('llama3.2')).getByRole('button', { name: 'Make default' }));
    expect(api.updateModel).toHaveBeenCalledWith('m2', { isDefault: true });
    const context = within(row('llama3.2')).getByRole('spinbutton', { name: 'Max context' });
    await userEvent.clear(context);
    await userEvent.type(context, '4096{Enter}');
    expect(api.updateModel).toHaveBeenCalledWith('m2', { maxContext: 4096 });
  });

  it('shows server conflicts inline', async () => {
    api.updateModel.mockRejectedValue(new ApiClientError(409, 'CONFLICT', 'Make the model available before setting it as default.'));
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.click(within(row('llama3.2')).getByRole('button', { name: 'Make default' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Make the model available before setting it as default.');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @js-rag-stack/admin test` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/features/models/models-page.tsx`:

```tsx
import type { UpdateModelInput } from '@js-rag-stack/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toErrorMessage } from '../../lib/api';
import { AddModelForm } from './add-model-form';
import { ModelRow } from './model-row';

const MODELS_KEY = ['models'] as const;

export function ModelsPage() {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: MODELS_KEY, queryFn: api.listModels });
  const refresh = () => queryClient.invalidateQueries({ queryKey: MODELS_KEY });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateModelInput }) => api.updateModel(id, input),
    onSettled: refresh,
  });
  const error = models.error ?? update.error;

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Models</h1>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {toErrorMessage(error)}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Models</caption>
          <thead className="bg-surface text-xs text-fg-subtle">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Max context</th>
              <th className="px-3 py-2">Ollama</th>
              <th className="px-3 py-2">Available</th>
              <th className="px-3 py-2">Default</th>
            </tr>
          </thead>
          <tbody>
            {models.data?.models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                busy={update.isPending}
                onUpdate={(input) => update.mutate({ id: model.id, input })}
              />
            ))}
          </tbody>
        </table>
      </div>
      <AddModelForm onCreated={refresh} />
    </section>
  );
}
```

`src/features/models/model-row.tsx`:

```tsx
import type { AdminModel, UpdateModelInput } from '@js-rag-stack/contracts';
import { useState, type FormEvent } from 'react';
import { formatNumber } from '../../lib/format';

export function ModelRow({
  model,
  busy,
  onUpdate,
}: {
  model: AdminModel;
  busy: boolean;
  onUpdate: (input: UpdateModelInput) => void;
}) {
  const [context, setContext] = useState(String(model.maxContext));
  const installed =
    model.installed === null ? 'Unknown' : model.installed ? 'Installed' : 'Not installed';

  const saveContext = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(context);
    if (Number.isInteger(value) && value !== model.maxContext) onUpdate({ maxContext: value });
  };

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{model.name}</td>
      <td className="px-3 py-2">
        <form onSubmit={saveContext} className="flex items-center gap-2">
          <input
            type="number"
            aria-label="Max context"
            min={512}
            max={1_048_576}
            step={512}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            onBlur={saveContext}
            className="w-28 rounded-lg border border-border bg-bg px-2 py-1 tabular-nums"
          />
          <span className="sr-only">{formatNumber(model.maxContext)} tokens</span>
        </form>
      </td>
      <td className="px-3 py-2 text-fg-muted">{installed}</td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label="Available"
          checked={model.isAvailable}
          disabled={busy || model.isDefault}
          title={model.isDefault ? 'The default model cannot be made unavailable.' : undefined}
          onChange={(event) => onUpdate({ isAvailable: event.target.checked })}
        />
      </td>
      <td className="px-3 py-2">
        {model.isDefault ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Default</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUpdate({ isDefault: true })}
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-50"
          >
            Make default
          </button>
        )}
      </td>
    </tr>
  );
}
```

(`onBlur={saveContext}` and Enter-submit both call `saveContext`; the equality check prevents a duplicate PATCH. Pressing Enter then blurring sends once because after the PATCH the refetch resets nothing until data returns — if the test sees two calls, keep a `lastSubmitted` ref and skip duplicates.)

`src/features/models/add-model-form.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { api, toErrorMessage } from '../../lib/api';

export function AddModelForm({ onCreated }: { onCreated: () => void }) {
  const nameId = useId();
  const contextId = useId();
  const [name, setName] = useState('');
  const [maxContext, setMaxContext] = useState('8192');
  const create = useMutation({
    mutationFn: api.createModel,
    onSuccess: () => {
      setName('');
      setMaxContext('8192');
      onCreated();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ name: name.trim(), maxContext: Number(maxContext) });
  };

  const input = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm';
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Add model</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-xs text-fg-muted">Model name</label>
          <input id={nameId} required maxLength={200} placeholder="llama3.2:3b" value={name}
            onChange={(event) => setName(event.target.value)} className={input} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={contextId} className="text-xs text-fg-muted">Max context</label>
          <input id={contextId} type="number" required min={512} max={1_048_576} step={512} value={maxContext}
            onChange={(event) => setMaxContext(event.target.value)} className={`${input} w-32`} />
        </div>
        <button type="submit" disabled={create.isPending}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60">
          Add model
        </button>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-danger">{toErrorMessage(create.error)}</p>
      )}
    </form>
  );
}
```

Note: `required` + `min={512}` will block the native submit in a real browser for invalid values, but jsdom does not run constraint validation on `userEvent.click` submit; the server is the source of truth and its 400 message is shown via `role="alert"`.

`app.tsx`: replace the `/models` placeholder with `<ModelsPage />`.

- [ ] **Step 4: Run** `pnpm --filter @js-rag-stack/admin test && pnpm --filter @js-rag-stack/admin typecheck && pnpm --filter @js-rag-stack/admin lint && pnpm --filter @js-rag-stack/admin build` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/admin/src
git commit -m "feat(admin): models management page"
```

---

### Task 14: Docs, env, and full verification

**Files:**
- Modify: `.env.example`, `README.md`, `.github/workflows/ci.yml` (only if it lists apps explicitly)

- [ ] **Step 1: Env & docs.**

`.env.example` — after `WEB_ORIGIN=…` add `ADMIN_ORIGIN=http://localhost:5174`; after `CSRF_SECRET=…` add:

```
ADMIN_JWT_SECRET=replace-with-a-third-32-byte-secret
ADMIN_ACCESS_TTL=15m
ADMIN_REFRESH_TTL=7d
```

Change the `OLLAMA_DEFAULT_MODEL` line comment (add one above it): `# Seeds the default model on first boot; afterwards the default is managed in the admin app.`

`README.md` — add an **Admin dashboard** section: start with `pnpm admin` (http://localhost:5174), create the first admin with `pnpm --filter @js-rag-stack/api admin:create --email you@example.com [--name "You"]` (prompts for a ≥12-char password; re-running resets it), what the pages show (users, anonymous sessions with chats or usage, models with availability/default), and that usage is logged per Ollama call (chat replies and summaries) with Ollama-reported token counts. Mention `ADMIN_ORIGIN` / `ADMIN_JWT_SECRET` in the configuration table if the README has one.

Check `.github/workflows/ci.yml`: if it runs `pnpm lint/typecheck/test/build` at the root, nothing to change (Turbo picks up `apps/admin`). If it filters packages explicitly, add `@js-rag-stack/admin`.

- [ ] **Step 2: Full verification**

Run: `pnpm format:write && pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check`
Expected: all succeed. Fix anything that fails in the task's own files; do not disable lint rules.

- [ ] **Step 3: Manual smoke (if Postgres, Redis and Ollama are running locally)**

1. `pnpm backend` and `pnpm frontend` and `pnpm admin`.
2. Chat once anonymously in the web app (http://localhost:5173).
3. `pnpm --filter @js-rag-stack/api admin:create --email you@example.com`, sign in at http://localhost:5174.
4. **Anonymous** shows the session with 1 request; **Models** → add a second installed model, make it default, disable the old one; back in the web app the old chat shows the "no longer available" prompt and send works after switching.

Report which smoke steps ran; if services are not available, say so explicitly.

- [ ] **Step 4: Commit**

```bash
git add -A .env.example README.md .github
git commit -m "docs: admin dashboard setup and configuration"
```
