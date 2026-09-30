# Context Window & Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-model context limits in PostgreSQL, keep every prompt inside the model's context by folding old turns into a persisted running summary, and show `used / max` tokens plus a summary divider in the chat UI.

**Architecture:** A `model` table replaces the env allowlist and `chat.selected_model` becomes an FK. A pure helper module (`context-window.helpers.ts`) does token estimation and fold selection; `ContextWindowService` orchestrates summary loading, inline summarization via Ollama, and the final prompt; `ChatStreamService` calls it after `stream.started`. The web app receives `context` on the chat detail and a `context.updated` stream event, rendering a meter by the composer and a divider in the message list.

**Tech Stack:** NestJS 11, Prisma 7 (`prisma-client` generator, PostgreSQL), Redis, Ollama HTTP API, zod 4, Jest + @swc/jest (API), React 19 + TanStack Query + Tailwind v4 + Vitest + Testing Library (web), pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-30-context-window-summarization-design.md`

## Global Constraints

- Branch: `feat/context-window-summarization`. Commit after every task. **Never `git push`** without asking the user.
- Persistence naming: PascalCase Prisma model names with `@@map("singular_snake_case")`; snake_case fields; **no field-level `@map`**; do not convert DB records to camelCase.
- IDs: UUIDv7 via `@default(dbgenerated("uuidv7()"))`; application code never pre-generates persisted IDs.
- Every Ollama call sends `options.num_ctx = model.max_context`.
- Default thresholds: summarize at `0.75`, fold down to `0.4`, keep last `4` messages verbatim, `3` chars per token, summary cap `0.1` of `max_context`.
- Seeded model row: `('qwen2.5:1.5b', 8192)`; unknown backfilled models also get `8192`.
- `Message.model` stays a plain string. Public API field `selectedModel` stays the model **name**.
- `OLLAMA_DEFAULT_MODEL` stays in env and must match a `model` row (checked at bootstrap).
- UI copy, verbatim: `Earlier messages summarized`, `Summarizing earlier messages…`, `The message is too long for this model's context.`
- Web: Tailwind only, existing color tokens (`bg-warning`, `text-warning`, `bg-accent`, `bg-border`, `text-fg-subtle`, …), no UI library.
- Done means: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check` all pass (same as CI). If `pnpm` is not on `PATH`, use `npx pnpm@10.24.0`.
- API tests need local PostgreSQL (`js_rag_stack` on 5432) and Redis (6379) running; `pnpm --filter @js-rag-stack/api test` runs `prisma migrate deploy` first.

## Review Focus

1. **Existing long chats with no summary** — the first over-budget turn must fold a large backlog in several chunks without any single Ollama call exceeding `max_context`. Pinned in Task 6 (`summarizes a large backlog in chunks`).
2. **A single huge assistant reply (up to 100k chars) inside the folded range** — must be truncated in the summary request, not sent whole. Pinned in Task 5 (`buildSummaryRequest truncates oversized entries`).
3. **Recent messages alone exceed the budget** (keep-4 rule prevents folding) — the prompt must still fit by dropping oldest kept turns, never splitting a user/assistant pair. Pinned in Task 5 (`dropOldestTurns`) and Task 6 (`drops oldest turns when nothing can be folded`).
4. **User switches to a model with a smaller `max_context`** — the next turn re-evaluates against the new model and summarizes. Pinned in Task 6 (`uses the requested model's max_context`).
5. **User presses Stop during summarization** — no summary row written, message ends `cancelled`. Pinned in Task 6 (`does not save a summary when cancelled`).

---

## File Map

API (`apps/api`):

- Modify `prisma/schema.prisma` — add `Model`, `ConversationSummary`; `Chat.selected_model_id` FK.
- Create `prisma/migrations/20260930120000_model_registry_and_conversation_summary/migration.sql`.
- Create `src/ollama/models.repository.ts` — `model` table reads.
- Modify `src/ollama/ollama.service.ts`, `ollama.module.ts`, `ollama.types.ts`, `ollama-client.service.ts`, `models/models-response.dto.ts`.
- Modify `src/config/environment.schema.ts`, `/.env.example`, `/README.md`.
- Modify `src/chats/chats.repository.ts`, `chats.service.ts`, `chat-ownership.service.ts`, `chats.helpers.ts`, `chats.types.ts`, `chats.module.ts`, `chat-history.service.ts`, `chat-stream.service.ts`, `models/chat-response.dto.ts`.
- Create `src/chats/conversation-summary.repository.ts` — summary row read/upsert.
- Create `src/chats/context-window.helpers.ts` — pure token/fold logic.
- Create `src/chats/context-window.service.ts` — prompt building + summarization.
- Tests: modify `test/phase4.spec.ts`, `test/persistence.integration.spec.ts`, `test/auth.integration.spec.ts`, `test/environment.schema.spec.ts`, `test/app.module.spec.ts`; create `test/context-window.helpers.spec.ts`, `test/context-window.service.spec.ts`.

Shared:

- Modify `packages/contracts/src/index.ts`, `packages/api-client/src/index.ts`, regenerate `packages/api-client/openapi.json`.

Web (`apps/web/src`):

- Modify `features/chat/chat.types.ts`, `chat.helpers.ts`, `use-chat-stream.ts`, `message-list.tsx`, `composer.tsx`, `chat-page.tsx`, `test/fixtures.ts`.
- Create `features/chat/context-meter.tsx` + `context-meter.test.tsx`.
- Tests: modify `chat.helpers.test.ts`, `message-list.test.tsx`, `chat-page.test.tsx`.

---

### Task 1: Model registry table and `Chat.selected_model_id`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260930120000_model_registry_and_conversation_summary/migration.sql`
- Create: `apps/api/src/ollama/models.repository.ts`
- Modify: `apps/api/src/ollama/ollama.service.ts`, `ollama.module.ts`, `ollama.types.ts`
- Modify: `apps/api/src/config/environment.schema.ts`, `.env.example`, `README.md`
- Modify: `apps/api/src/chats/chats.types.ts`, `chats.repository.ts`, `chats.service.ts`, `chat-ownership.service.ts`, `chats.helpers.ts`, `chat-stream.service.ts`
- Test: `apps/api/test/phase4.spec.ts`, `persistence.integration.spec.ts`, `auth.integration.spec.ts`, `environment.schema.spec.ts`, `app.module.spec.ts`

**Interfaces:**

- Produces:
  - Prisma `Model` (`id`, `name`, `max_context`, `created_at`, `updated_at`), accessor `prisma.model`; Prisma `ConversationSummary` (`id`, `chat_id`, `content`, `summarized_through_message_id`, `token_count`, `created_at`, `updated_at`), accessor `prisma.conversationSummary`.
  - `ModelsRepository.findAll(): Promise<Model[]>`, `findByName(name: string): Promise<Model | null>`.
  - `OllamaService.assertAllowed(name: string): Promise<Model>` (async now), `assertAvailable(name: string): Promise<Model>`, `listModels(): Promise<OllamaModel[]>` where `OllamaModel = { name; default; maxContext: number }`, `onApplicationBootstrap(): Promise<void>`.
  - `type ChatWithModel = Prisma.ChatGetPayload<{ include: { selected_model: true } }>` in `chats.types.ts`; `ChatOwnershipService.findOwnedChat` returns `ChatWithModel`.
  - Repository params `CreateChatRecordParams { principal; title; selectedModelId; firstPrompt? }`, `UpdateChatRecordParams { chatId; title?; selectedModelId?; archived? }`.

- [ ] **Step 1: Update the Prisma schema**

In `apps/api/prisma/schema.prisma` add after the `TokenCountSource` enum:

```prisma
model Model {
  id          String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  name        String   @unique @db.VarChar(200)
  max_context Int
  created_at  DateTime @default(now()) @db.Timestamptz(3)
  updated_at  DateTime @updatedAt @db.Timestamptz(3)
  chats       Chat[]   @relation("model_chats")

  @@map("model")
}
```

Replace the `Chat` model with:

```prisma
model Chat {
  id                   String               @id @default(dbgenerated("uuidv7()")) @db.Uuid
  user_id              String?              @db.Uuid
  anonymous_session_id String?              @db.Uuid
  title                String               @db.VarChar(200)
  selected_model_id    String               @db.Uuid
  created_at           DateTime             @default(now()) @db.Timestamptz(3)
  updated_at           DateTime             @updatedAt @db.Timestamptz(3)
  last_message_at      DateTime             @default(now()) @db.Timestamptz(3)
  archived_at          DateTime?            @db.Timestamptz(3)
  user                 User?                @relation("user_chats", fields: [user_id], references: [id], onDelete: Cascade)
  anonymous_session    AnonymousSession?    @relation("anonymous_session_chats", fields: [anonymous_session_id], references: [id], onDelete: Cascade)
  selected_model       Model                @relation("model_chats", fields: [selected_model_id], references: [id], onDelete: Restrict)
  messages             Message[]            @relation("chat_messages")
  conversation_summary ConversationSummary? @relation("chat_conversation_summary")

  @@index([user_id, last_message_at])
  @@index([anonymous_session_id, last_message_at])
  @@index([selected_model_id])
  @@map("chat")
}
```

Add to `Message` (after the `chat` relation line):

```prisma
  conversation_summaries ConversationSummary[] @relation("conversation_summary_through_message")
```

Add at the end of the file:

```prisma
model ConversationSummary {
  id                            String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  chat_id                       String   @unique @db.Uuid
  content                       String   @db.Text
  summarized_through_message_id String   @db.Uuid
  token_count                   Int
  created_at                    DateTime @default(now()) @db.Timestamptz(3)
  updated_at                    DateTime @updatedAt @db.Timestamptz(3)
  chat                          Chat     @relation("chat_conversation_summary", fields: [chat_id], references: [id], onDelete: Cascade)
  summarized_through_message    Message  @relation("conversation_summary_through_message", fields: [summarized_through_message_id], references: [id], onDelete: Cascade)

  @@map("conversation_summary")
}
```

(The spec's `ChatSummary` name is replaced by `ConversationSummary` because `ChatSummary` is already the contracts type for chat list items.)

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260930120000_model_registry_and_conversation_summary/migration.sql`:

```sql
-- Model registry: the single allowlist and per-model settings.
CREATE TABLE "model" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(200) NOT NULL,
    "max_context" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "model_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "model_max_context_check" CHECK ("max_context" > 0)
);

CREATE UNIQUE INDEX "model_name_key" ON "model"("name");

INSERT INTO "model" ("name", "max_context", "updated_at")
VALUES ('qwen2.5:1.5b', 8192, CURRENT_TIMESTAMP);

-- Keep every existing chat valid, even if it used a model no longer configured.
INSERT INTO "model" ("name", "max_context", "updated_at")
SELECT DISTINCT "chat"."selected_model", 8192, CURRENT_TIMESTAMP
FROM "chat"
WHERE NOT EXISTS (
    SELECT 1 FROM "model" WHERE "model"."name" = "chat"."selected_model"
);

ALTER TABLE "chat" ADD COLUMN "selected_model_id" UUID;

UPDATE "chat"
SET "selected_model_id" = "model"."id"
FROM "model"
WHERE "model"."name" = "chat"."selected_model";

ALTER TABLE "chat" ALTER COLUMN "selected_model_id" SET NOT NULL;
ALTER TABLE "chat" DROP COLUMN "selected_model";

CREATE INDEX "chat_selected_model_id_idx" ON "chat"("selected_model_id");

ALTER TABLE "chat" ADD CONSTRAINT "chat_selected_model_id_fkey"
    FOREIGN KEY ("selected_model_id") REFERENCES "model"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Running summary of the turns folded out of a chat's context window.
CREATE TABLE "conversation_summary" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "chat_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "summarized_through_message_id" UUID NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_summary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_summary_chat_id_key" ON "conversation_summary"("chat_id");

ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_chat_id_fkey"
    FOREIGN KEY ("chat_id") REFERENCES "chat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_summary" ADD CONSTRAINT "conversation_summary_summarized_through_message_id_fkey"
    FOREIGN KEY ("summarized_through_message_id") REFERENCES "message"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify the backfill against the local dev database, then apply**

Seed a chat that uses an unknown model name _before_ applying, so the backfill path is exercised:

```bash
cd apps/api
psql postgresql://postgres:postgres@localhost:5432/js_rag_stack -c \
  "INSERT INTO anonymous_session (token_hash, expires_at) VALUES (repeat('a', 64), now() + interval '1 day') RETURNING id;"
# use the returned id below
psql postgresql://postgres:postgres@localhost:5432/js_rag_stack -c \
  "INSERT INTO chat (anonymous_session_id, title, selected_model, updated_at) VALUES ('<id>', 'backfill check', 'legacy:1b', now());"
pnpm exec prisma migrate deploy
psql postgresql://postgres:postgres@localhost:5432/js_rag_stack -c \
  "SELECT c.title, m.name, m.max_context FROM chat c JOIN model m ON m.id = c.selected_model_id WHERE c.title = 'backfill check';"
```

Expected: one row `backfill check | legacy:1b | 8192`. Then clean up:

```bash
psql postgresql://postgres:postgres@localhost:5432/js_rag_stack -c \
  "DELETE FROM anonymous_session WHERE token_hash = repeat('a', 64); DELETE FROM model WHERE name = 'legacy:1b';"
```

Check the schema and migrations agree:

```bash
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: `No difference detected.`, exit code 0. Then `pnpm exec prisma generate`.

- [ ] **Step 4: Write failing tests for the model registry**

In `apps/api/test/phase4.spec.ts`, replace the test `returns only installed models that are allowed` with:

```ts
it('lists installed models that have a model row, with their context size', async () => {
  const client = {
    listInstalledModels: jest
      .fn()
      .mockResolvedValue(['qwen2.5:1.5b', 'unapproved:latest']),
  };
  const models = {
    findAll: jest
      .fn()
      .mockResolvedValue([
        createModelRecord(),
        createModelRecord('not-installed:1b', 4096),
      ]),
    findByName: jest.fn((name: string) =>
      Promise.resolve(name === 'qwen2.5:1.5b' ? createModelRecord() : null),
    ),
  };
  const service = new OllamaService(client as never, models as never, config);

  await expect(service.listModels()).resolves.toEqual([
    { name: 'qwen2.5:1.5b', default: true, maxContext: 8192 },
  ]);
  await expect(service.assertAllowed('qwen2.5:1.5b')).resolves.toEqual(
    createModelRecord(),
  );
  await expect(service.assertAllowed('unapproved:latest')).rejects.toThrow(
    OllamaError,
  );
});

it('fails bootstrap when the default model has no model row', async () => {
  const models = { findByName: jest.fn().mockResolvedValue(null) };
  const service = new OllamaService({} as never, models as never, config);

  await expect(service.onApplicationBootstrap()).rejects.toThrow(
    'OLLAMA_DEFAULT_MODEL',
  );
  models.findByName.mockResolvedValue(createModelRecord());
  await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
});
```

Add at the bottom of the file:

```ts
function createModelRecord(name = 'qwen2.5:1.5b', maxContext = 8192) {
  const now = new Date('2026-06-14T12:00:00.000Z');
  return {
    id: `model-${name}`,
    name,
    max_context: maxContext,
    created_at: now,
    updated_at: now,
  };
}
```

In `apps/api/test/persistence.integration.spec.ts` add a `let model_id: string;` next to the other `let`s, and at the end of `beforeAll`:

```ts
model_id = (
  await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
).id;
```

Add this test after `isolates anonymous chat ownership`:

```ts
it('links chats to a model row and blocks deleting a model in use', async () => {
  const session = await createAnonymousSession();
  const chat = await prisma.chat.create({
    data: {
      anonymous_session_id: session.id,
      title: 'Model link',
      selected_model_id: model_id,
    },
    include: { selected_model: true },
  });

  expect(chat.selected_model.name).toBe('qwen2.5:1.5b');
  expect(chat.selected_model.max_context).toBeGreaterThan(0);
  await expect(
    prisma.model.delete({ where: { id: model_id } }),
  ).rejects.toThrow();
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/api exec jest test/phase4.spec.ts -t "model"`
Expected: FAIL. `OllamaService` constructor/`onApplicationBootstrap`/`maxContext` don't exist yet, and TypeScript errors about `selected_model` are expected.

- [ ] **Step 6: Implement `ModelsRepository`**

Create `apps/api/src/ollama/models.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Model } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Model[]> {
    return this.prisma.model.findMany({ orderBy: { name: 'asc' } });
  }

  findByName(name: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { name } });
  }
}
```

In `ollama.module.ts` add `ModelsRepository` to `providers` (import it from `./models.repository`).

In `ollama.types.ts` change `OllamaModel`:

```ts
export interface OllamaModel {
  name: string;
  default: boolean;
  maxContext: number;
}
```

- [ ] **Step 7: Rewrite `OllamaService` on top of the table**

Replace `apps/api/src/ollama/ollama.service.ts` with:

```ts
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import type { Model } from '../generated/prisma/client';
import { ModelsRepository } from './models.repository';
import { OllamaClientService } from './ollama-client.service';
import { OllamaError } from './ollama.errors';
import type { OllamaModel, StreamOllamaChatParams } from './ollama.types';

@Injectable()
export class OllamaService implements OnApplicationBootstrap {
  readonly defaultModel: string;

  constructor(
    private readonly client: OllamaClientService,
    private readonly models: ModelsRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.defaultModel = config.get('OLLAMA_DEFAULT_MODEL', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.models.findByName(this.defaultModel))) {
      throw new Error(
        `OLLAMA_DEFAULT_MODEL "${this.defaultModel}" has no row in the model table.`,
      );
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.client.listInstalledModels(),
    ]);
    const installedNames = new Set(installed);
    return models
      .filter((model) => installedNames.has(model.name))
      .map((model) => ({
        name: model.name,
        default: model.name === this.defaultModel,
        maxContext: model.max_context,
      }));
  }

  async assertAllowed(name: string): Promise<Model> {
    const model = await this.models.findByName(name);

    if (!model) {
      throw new OllamaError(
        'MODEL_NOT_ALLOWED',
        'The selected model is not allowed.',
        400,
      );
    }

    return model;
  }

  async assertAvailable(name: string): Promise<Model> {
    const model = await this.assertAllowed(name);
    const installed = await this.client.listInstalledModels();

    if (!installed.includes(name)) {
      throw new OllamaError(
        'MODEL_NOT_AVAILABLE',
        'The selected model is not installed.',
      );
    }

    return model;
  }

  // Callers resolve the model row with assertAllowed() before streaming.
  streamChat(params: StreamOllamaChatParams) {
    return this.client.streamChat(params);
  }

  async ping(): Promise<void> {
    await this.client.listInstalledModels();
  }
}
```

- [ ] **Step 8: Remove the env allowlist**

In `apps/api/src/config/environment.schema.ts` delete the `OLLAMA_ALLOWED_MODELS` property and the `if (!environment.OLLAMA_ALLOWED_MODELS.includes(...)) { ... }` block at the top of `superRefine`.

In `apps/api/test/environment.schema.spec.ts`: remove the `OLLAMA_ALLOWED_MODELS: ['qwen2.5:1.5b'],` line from the first expectation, and delete the whole test `requires the default Ollama model to be allowed`.

In `.env.example` delete the line `OLLAMA_ALLOWED_MODELS=qwen2.5:1.5b`.

In `README.md` replace

```
The default development configuration uses a PostgreSQL database named
`js_rag_stack` and only exposes Ollama models listed in
`OLLAMA_ALLOWED_MODELS`.
```

with

```
The default development configuration uses a PostgreSQL database named
`js_rag_stack` and only exposes Ollama models that have a row in the `model`
table (seeded with `qwen2.5:1.5b`, 8192-token context). Add a model with:

    INSERT INTO model (name, max_context, updated_at) VALUES ('llama3.2:3b', 8192, now());

`OLLAMA_DEFAULT_MODEL` must name one of those rows.
```

- [ ] **Step 9: Switch the chats layer to `selected_model_id`**

In `apps/api/src/chats/chats.types.ts`:

- change the prisma import to `import type { Chat, Message, Prisma } from '../generated/prisma/client';`
- add:

```ts
export type ChatWithModel = Prisma.ChatGetPayload<{
  include: { selected_model: true };
}>;

export interface CreateChatRecordParams {
  principal: RequestPrincipal;
  title: string;
  selectedModelId: string;
  firstPrompt?: string;
}

export interface UpdateChatRecordParams {
  chatId: string;
  title?: string;
  selectedModelId?: string;
  archived?: boolean;
}
```

- change `MapChatDetailParams.chat` to `chat: ChatWithModel;` (drop `Chat` from the import if unused).

In `apps/api/src/chats/chats.repository.ts`:

- import `ChatWithModel`, `CreateChatRecordParams`, `UpdateChatRecordParams` instead of `CreateChatParams`, `UpdateChatParams`; drop the `Chat` type import.
- add `const withModel = { selected_model: true } as const;` below the imports.
- `findOwnedChat` → return type `Promise<ChatWithModel | null>`, add `include: withModel`.
- `createChat({ principal, title, selectedModelId, firstPrompt }: CreateChatRecordParams): Promise<ChatWithModel>`; in `transaction.chat.create` use `selected_model_id: selectedModelId` and add `include: withModel`.
- `listChats` → `Promise<ChatWithModel[]>`, add `include: withModel`.
- `updateChat({ chatId, title, selectedModelId, archived }: UpdateChatRecordParams): Promise<ChatWithModel>`; data uses `...(selectedModelId === undefined ? {} : { selected_model_id: selectedModelId })`; add `include: withModel`.

In `apps/api/src/chats/chat-ownership.service.ts` replace the `Chat` import with `import type { ChatWithModel, FindOwnedChatParams } from './chats.types';` and return `Promise<ChatWithModel>`.

In `apps/api/src/chats/chats.helpers.ts` change `toChatSummary(chat: Chat)` to `toChatSummary(chat: ChatWithModel)` (import `ChatWithModel` from `./chats.types`, keep `Message` from prisma) and set `selectedModel: chat.selected_model.name,`.

In `apps/api/src/chats/chats.service.ts`:

```ts
  async create(params: CreateChatParams) {
    if (
      params.firstPrompt &&
      params.firstPrompt.length > this.maxMessageChars
    ) {
      throw new PayloadTooLargeException('The first prompt is too long.');
    }
    const model = await this.ollama.assertAllowed(params.selectedModel);
    const chat = await this.repository.createChat({
      principal: params.principal,
      firstPrompt: params.firstPrompt,
      selectedModelId: model.id,
      title:
        params.title ||
        (params.firstPrompt ? deriveChatTitle(params.firstPrompt) : 'New chat'),
    });

    return toChatSummary(chat);
  }
```

and in `update`:

```ts
await this.ownership.findOwnedChat(params);
const model = params.selectedModel
  ? await this.ollama.assertAllowed(params.selectedModel)
  : undefined;
return toChatSummary(
  await this.repository.updateChat({
    chatId: params.chatId,
    title: params.title,
    archived: params.archived,
    selectedModelId: model?.id,
  }),
);
```

In `apps/api/src/chats/chat-stream.service.ts` replace lines 67-69:

```ts
const chat = await this.ownership.findOwnedChat({ chatId, principal });
const selectedModel = (
  await this.ollama.assertAllowed(model ?? chat.selected_model.name)
).name;
```

- [ ] **Step 10: Update the existing tests for the new shapes**

In `apps/api/test/phase4.spec.ts`:

- every `findOwnedChat: jest.fn().mockResolvedValue({ selected_model: 'qwen2.5:1.5b' })` (3 places) → `mockResolvedValue({ selected_model: createModelRecord() })`.
- every `assertAllowed: jest.fn(),` inside the ChatStreamService tests → `assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),`.
- in `creates chats without contacting Ollama`: `const ollama = { assertAllowed: jest.fn().mockResolvedValue(createModelRecord()), assertAvailable: jest.fn() };` and after the existing assertions add `expect(createChat).toHaveBeenCalledWith(expect.objectContaining({ selectedModelId: 'model-qwen2.5:1.5b' }));`.
- in `createChatRecord()` replace `selected_model: 'qwen2.5:1.5b',` with `selected_model_id: 'model-qwen2.5:1.5b', selected_model: createModelRecord(),`.

In `apps/api/test/persistence.integration.spec.ts` replace every `selected_model: 'qwen2.5:1.5b',` inside `prisma.chat.create` data (4 places) with `selected_model_id: model_id,`.

In `apps/api/test/auth.integration.spec.ts` add after the existing `beforeAll` setup (inside it, at the end):

```ts
model_id = (
  await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
).id;
```

declare `let model_id: string;` with the other `let`s, and replace `selected_model: 'qwen2.5:1.5b',` with `selected_model_id: model_id,`.

In `apps/api/test/app.module.spec.ts` add `import { ModelsRepository } from '../src/ollama/models.repository';` and chain onto the testing module before `.compile()`:

```ts
      .overrideProvider(ModelsRepository)
      .useValue({
        findByName: jest.fn().mockResolvedValue({ name: 'qwen2.5:1.5b' }),
        findAll: jest.fn().mockResolvedValue([]),
      })
```

- [ ] **Step 11: Run the API checks**

Run: `pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint && pnpm --filter @js-rag-stack/api test`
Expected: all PASS, including the two new registry tests and `links chats to a model row and blocks deleting a model in use`.

- [ ] **Step 12: Commit**

```bash
git add apps/api .env.example README.md
git commit -m "feat(api): store allowed models and context size in a model table"
```

---

### Task 2: Expose chat context and model context size in the API

**Files:**

- Modify: `packages/contracts/src/index.ts`, `packages/api-client/src/index.ts`
- Create: `apps/api/src/chats/conversation-summary.repository.ts`
- Modify: `apps/api/src/chats/chats.repository.ts`, `chats.helpers.ts`, `chats.types.ts`, `chats.service.ts`, `chats.module.ts`, `models/chat-response.dto.ts`
- Modify: `apps/api/src/ollama/models/models-response.dto.ts`
- Regenerate: `packages/api-client/openapi.json`
- Test: `apps/api/test/phase4.spec.ts`, `apps/api/test/persistence.integration.spec.ts`

**Interfaces:**

- Consumes: `ChatWithModel`, `Model`, `ConversationSummary` Prisma types (Task 1).
- Produces:
  - contracts: `ModelInfo.maxContext: number`; `ChatContext { usedTokens: number | null; maxTokens: number; summary: string | null; summarizedThroughMessageId: string | null }`.
  - api-client: `ChatDetail.context: ChatContext`.
  - `ConversationSummaryRepository.findByChatId(chatId: string): Promise<ConversationSummary | null>`; `upsert(params: UpsertConversationSummaryParams): Promise<ConversationSummary>` with `UpsertConversationSummaryParams { chatId: string; content: string; summarizedThroughMessageId: string; tokenCount: number }`.
  - `ChatsRepository.findLastCompletedAssistantMessage(chatId: string): Promise<Message | null>`.
  - `toChatContext({ maxTokens, summary, lastAssistantMessage }: ToChatContextParams): ChatContext` in `chats.helpers.ts`, where `ToChatContextParams { maxTokens: number; summary: ConversationSummary | null; lastAssistantMessage: Message | null }`.
  - `ChatsService` constructor: `(repository, ownership, history, ollama, summaries, config)`.

- [ ] **Step 1: Add the contract types**

In `packages/contracts/src/index.ts` change `ModelInfo` and add `ChatContext` after `ChatSummary`:

```ts
export interface ModelInfo {
  name: string;
  default: boolean;
  maxContext: number;
}
```

```ts
export interface ChatContext {
  usedTokens: number | null;
  maxTokens: number;
  summary: string | null;
  summarizedThroughMessageId: string | null;
}
```

In `packages/api-client/src/index.ts` import `ChatContext` from contracts and add `context: ChatContext;` to `ChatDetail`.

- [ ] **Step 2: Write the failing tests**

Add to `apps/api/test/phase4.spec.ts`:

```ts
it('reports context usage from the last completed reply and the summary', () => {
  const now = new Date('2026-06-14T12:00:00.000Z');
  expect(
    toChatContext({
      maxTokens: 8192,
      summary: {
        id: 'summary-id',
        chat_id: 'chat-id',
        content: 'Earlier: the user likes Rust.',
        summarized_through_message_id: 'message-4',
        token_count: 12,
        created_at: now,
        updated_at: now,
      },
      lastAssistantMessage: createAssistantMessage('Hi'),
    }),
  ).toEqual({
    usedTokens: 14,
    maxTokens: 8192,
    summary: 'Earlier: the user likes Rust.',
    summarizedThroughMessageId: 'message-4',
  });
  expect(
    toChatContext({
      maxTokens: 8192,
      summary: null,
      lastAssistantMessage: null,
    }),
  ).toEqual({
    usedTokens: null,
    maxTokens: 8192,
    summary: null,
    summarizedThroughMessageId: null,
  });
});

it('returns the chat context with the chat detail', async () => {
  const repository = {
    listMessages: jest.fn().mockResolvedValue([]),
    findLastCompletedAssistantMessage: jest
      .fn()
      .mockResolvedValue(createAssistantMessage('Hi')),
  };
  const service = new ChatsService(
    repository as never,
    { findOwnedChat: jest.fn().mockResolvedValue(createChatRecord()) } as never,
    {} as never,
    {} as never,
    { findByChatId: jest.fn().mockResolvedValue(null) } as never,
    config,
  );

  const detail = await service.get({
    chatId: 'chat-id',
    principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
    limit: 50,
  });

  expect(detail.context).toEqual({
    usedTokens: 14,
    maxTokens: 8192,
    summary: null,
    summarizedThroughMessageId: null,
  });
});
```

Import `toChatContext` from `../src/chats/chats.helpers`. In `creates chats without contacting Ollama`, insert `{} as never,` before `config` (new `summaries` argument).

Add to `apps/api/test/persistence.integration.spec.ts` (import `ConversationSummaryRepository` from `../src/chats/conversation-summary.repository`):

```ts
it('upserts one conversation summary per chat and finds the last completed reply', async () => {
  const summaries = new ConversationSummaryRepository(prisma);
  const chats_repository = new ChatsRepository(prisma);
  const session = await createAnonymousSession();
  const chat = await prisma.chat.create({
    data: {
      anonymous_session_id: session.id,
      title: 'Summary',
      selected_model_id: model_id,
    },
  });
  const reply = await prisma.message.create({
    data: {
      chat_id: chat.id,
      role: 'ASSISTANT',
      status: 'COMPLETED',
      content: 'done',
      model: 'qwen2.5:1.5b',
      prompt_tokens: 100,
      completion_tokens: 20,
      token_count_source: 'OLLAMA_REPORTED',
    },
  });
  await prisma.message.create({
    data: {
      chat_id: chat.id,
      role: 'ASSISTANT',
      status: 'FAILED',
      content: '',
      model: 'qwen2.5:1.5b',
      token_count_source: 'UNKNOWN',
    },
  });

  await expect(
    chats_repository.findLastCompletedAssistantMessage(chat.id),
  ).resolves.toEqual(expect.objectContaining({ id: reply.id }));
  await expect(summaries.findByChatId(chat.id)).resolves.toBeNull();

  await summaries.upsert({
    chatId: chat.id,
    content: 'first',
    summarizedThroughMessageId: reply.id,
    tokenCount: 3,
  });
  const updated = await summaries.upsert({
    chatId: chat.id,
    content: 'second',
    summarizedThroughMessageId: reply.id,
    tokenCount: 4,
  });

  expect(updated.content).toBe('second');
  await expect(
    prisma.conversationSummary.count({ where: { chat_id: chat.id } }),
  ).resolves.toBe(1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/api exec jest test/phase4.spec.ts -t "context"`
Expected: FAIL. `toChatContext` is not exported.

- [ ] **Step 4: Implement the repository, helper and service change**

Create `apps/api/src/chats/conversation-summary.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { ConversationSummary } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertConversationSummaryParams } from './chats.types';

@Injectable()
export class ConversationSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByChatId(chatId: string): Promise<ConversationSummary | null> {
    return this.prisma.conversationSummary.findUnique({
      where: { chat_id: chatId },
    });
  }

  upsert({
    chatId,
    content,
    summarizedThroughMessageId,
    tokenCount,
  }: UpsertConversationSummaryParams): Promise<ConversationSummary> {
    const data = {
      content,
      summarized_through_message_id: summarizedThroughMessageId,
      token_count: tokenCount,
    };
    return this.prisma.conversationSummary.upsert({
      where: { chat_id: chatId },
      create: { chat_id: chatId, ...data },
      update: data,
    });
  }
}
```

In `chats.types.ts` add (import `ChatContext` from contracts and `ConversationSummary` from prisma):

```ts
export interface UpsertConversationSummaryParams {
  chatId: string;
  content: string;
  summarizedThroughMessageId: string;
  tokenCount: number;
}

export interface ToChatContextParams {
  maxTokens: number;
  summary: ConversationSummary | null;
  lastAssistantMessage: Message | null;
}
```

and change `ChatDetail` to:

```ts
export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
  nextCursor: string | null;
  context: ChatContext;
}
```

In `chats.repository.ts` add:

```ts
  findLastCompletedAssistantMessage(chatId: string): Promise<Message | null> {
    return this.prisma.message.findFirst({
      where: { chat_id: chatId, role: 'ASSISTANT', status: 'COMPLETED' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }
```

In `chats.helpers.ts` add (import `ChatContext` from contracts and `ToChatContextParams` from `./chats.types`):

```ts
export function toChatContext({
  maxTokens,
  summary,
  lastAssistantMessage,
}: ToChatContextParams): ChatContext {
  const promptTokens = lastAssistantMessage?.prompt_tokens ?? null;
  const completionTokens = lastAssistantMessage?.completion_tokens ?? null;
  return {
    usedTokens:
      promptTokens === null || completionTokens === null
        ? null
        : promptTokens + completionTokens,
    maxTokens,
    summary: summary?.content ?? null,
    summarizedThroughMessageId: summary?.summarized_through_message_id ?? null,
  };
}
```

In `chats.service.ts` inject `private readonly summaries: ConversationSummaryRepository,` after `ollama` and before `config`, and replace `get`:

```ts
  async get(params: ListMessagesParams): Promise<ChatDetail> {
    const chat = await this.ownership.findOwnedChat(params);
    const [messages, summary, lastAssistantMessage] = await Promise.all([
      this.repository.listMessages(params),
      this.summaries.findByChatId(chat.id),
      this.repository.findLastCompletedAssistantMessage(chat.id),
    ]);
    const hasMore = messages.length > params.limit;
    const page = messages.slice(0, params.limit);
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;
    return {
      ...toChatSummary(chat),
      messages: page.reverse().map(toChatMessage),
      nextCursor,
      context: toChatContext({
        maxTokens: chat.selected_model.max_context,
        summary,
        lastAssistantMessage,
      }),
    };
  }
```

In `chats.module.ts` add `ConversationSummaryRepository` to `providers` and to `exports`.

- [ ] **Step 5: Update the Swagger DTOs**

In `apps/api/src/ollama/models/models-response.dto.ts` add to `ModelDto`:

```ts
  @ApiProperty({ example: 8192 })
  maxContext!: number;
```

In `apps/api/src/chats/models/chat-response.dto.ts` add before `ChatDetailDto`:

```ts
export class ChatContextDto {
  @ApiPropertyOptional({ nullable: true }) usedTokens!: number | null;
  @ApiProperty() maxTokens!: number;
  @ApiPropertyOptional({ nullable: true }) summary!: string | null;
  @ApiPropertyOptional({ nullable: true })
  summarizedThroughMessageId!: string | null;
}
```

and add to `ChatDetailDto`:

```ts
  @ApiProperty({ type: ChatContextDto }) context!: ChatContextDto;
```

- [ ] **Step 6: Run the tests and regenerate OpenAPI**

Run: `pnpm --filter @js-rag-stack/api test && pnpm openapi:generate && pnpm typecheck`
Expected: PASS; `packages/api-client/openapi.json` now contains `maxContext` and `ChatContextDto`.

- [ ] **Step 7: Update web fixtures**

In `apps/web/src/features/chat/chat-page.test.tsx` and `model-selector.test.tsx` add `maxContext: 8192` to every model object literal (`{ name: ..., default: ... }`).

Run: `pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api apps/web packages
git commit -m "feat(api): return chat context usage and model context size"
```

---

### Task 3: Ollama client: `num_ctx`, system role, and `complete()`

**Files:**

- Modify: `apps/api/src/ollama/ollama.types.ts`, `ollama-client.service.ts`, `ollama.service.ts`
- Modify: `apps/api/src/chats/chat-stream.service.ts`
- Test: `apps/api/test/phase4.spec.ts`

**Interfaces:**

- Produces:
  - `OllamaHistoryMessage.role: 'system' | 'user' | 'assistant'`.
  - `StreamOllamaChatParams { model: string; messages: OllamaHistoryMessage[]; contextTokens: number; signal?: AbortSignal }`.
  - `CompleteOllamaChatParams { model: string; messages: OllamaHistoryMessage[]; contextTokens: number; maxTokens: number; signal?: AbortSignal }`.
  - `OllamaCompletion { content: string; promptTokens?: number; completionTokens?: number }`.
  - `OllamaClientService.complete(params): Promise<OllamaCompletion>` and `OllamaService.complete(params): Promise<OllamaCompletion>`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/test/phase4.spec.ts`, in `parses streamed NDJSON without exposing thinking fields`, capture the fetch spy and pass `contextTokens`:

```ts
const fetchSpy = jest
  .spyOn(globalThis, 'fetch')
  .mockResolvedValue(new Response(body, { status: 200 }));
```

```ts
    for await (const chunk of client.streamChat({
      model: 'qwen2.5:1.5b',
      messages: [{ role: 'user', content: 'Hello' }],
      contextTokens: 8192,
    })) {
```

and after the existing assertions:

```ts
const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
expect(JSON.parse(request.body as string)).toEqual({
  model: 'qwen2.5:1.5b',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
  options: { num_ctx: 8192 },
});
```

Add a new test:

```ts
it('collects a bounded completion for summaries', async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode('{"message":{"content":"Short "},"done":false}\n'),
      );
      controller.enqueue(
        encoder.encode(
          '{"message":{"content":"summary"},"done":true,"prompt_eval_count":40,"eval_count":3}\n',
        ),
      );
      controller.close();
    },
  });
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(body, { status: 200 }));
  const client = new OllamaClientService(config);

  await expect(
    client.complete({
      model: 'qwen2.5:1.5b',
      messages: [
        { role: 'system', content: 'Summarize.' },
        { role: 'user', content: 'Text' },
      ],
      contextTokens: 8192,
      maxTokens: 819,
    }),
  ).resolves.toEqual({
    content: 'Short summary',
    promptTokens: 40,
    completionTokens: 3,
  });
  const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
  expect(JSON.parse(request.body as string)).toEqual(
    expect.objectContaining({
      options: { num_ctx: 8192, num_predict: 819 },
    }),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @js-rag-stack/api exec jest test/phase4.spec.ts -t "NDJSON|bounded completion"`
Expected: FAIL. The body has no `options`, and `complete` is not a function.

- [ ] **Step 3: Implement**

In `ollama.types.ts`:

```ts
export interface OllamaHistoryMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOllamaChatParams {
  model: string;
  messages: OllamaHistoryMessage[];
  contextTokens: number;
  signal?: AbortSignal;
}

export interface CompleteOllamaChatParams extends StreamOllamaChatParams {
  maxTokens: number;
}

export interface OllamaCompletion {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface OllamaRequestParams {
  model: string;
  messages: OllamaHistoryMessage[];
  options: { num_ctx: number; num_predict?: number };
  signal?: AbortSignal;
}
```

In `ollama-client.service.ts`:

- rename the existing `async *streamChat({ model, messages, signal }: StreamOllamaChatParams)` to `private async *streamRequest({ model, messages, options, signal }: OllamaRequestParams): AsyncGenerator<OllamaChatChunk>` and change the fetch body to `JSON.stringify({ model, messages, stream: true, options })`.
- add the public methods (import the new types):

```ts
  streamChat({
    model,
    messages,
    contextTokens,
    signal,
  }: StreamOllamaChatParams): AsyncGenerator<OllamaChatChunk> {
    return this.streamRequest({
      model,
      messages,
      options: { num_ctx: contextTokens },
      signal,
    });
  }

  // Streams internally so the first-token and idle timeouts still apply.
  async complete({
    model,
    messages,
    contextTokens,
    maxTokens,
    signal,
  }: CompleteOllamaChatParams): Promise<OllamaCompletion> {
    let content = '';
    let finalChunk: OllamaChatChunk | undefined;

    for await (const chunk of this.streamRequest({
      model,
      messages,
      options: { num_ctx: contextTokens, num_predict: maxTokens },
      signal,
    })) {
      content += chunk.delta;
      if (chunk.done) finalChunk = chunk;
    }

    return {
      content,
      promptTokens: finalChunk?.promptTokens,
      completionTokens: finalChunk?.completionTokens,
    };
  }
```

In `ollama.service.ts` add (import `CompleteOllamaChatParams`, `OllamaCompletion`):

```ts
  complete(params: CompleteOllamaChatParams): Promise<OllamaCompletion> {
    return this.client.complete(params);
  }
```

In `chat-stream.service.ts` keep the resolved model row (not just the name) and pass its context size:

```ts
const selectedModel = await this.ollama.assertAllowed(
  model ?? chat.selected_model.name,
);
```

Replace each later use of `selectedModel` as a string with `selectedModel.name` (in `beginGeneration`, `stream.started`, `streamChat`), and add `contextTokens: selectedModel.max_context,` to the `streamChat` call.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api exec jest test/phase4.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): send num_ctx to Ollama and add bounded completions"
```

---

### Task 4: History cache entries carry the message id

**Files:**

- Modify: `apps/api/src/chats/chats.types.ts`, `chat-history.service.ts`, `chat-stream.service.ts`
- Test: `apps/api/test/persistence.integration.spec.ts`, `apps/api/test/phase4.spec.ts`

**Interfaces:**

- Produces: `ChatHistoryEntry = { id: string; role: 'user'; content: string } | { id: string; role: 'assistant'; content: string; model: string }`.

- [ ] **Step 1: Update the integration test expectations (failing)**

In `persistence.integration.spec.ts`, test `handles history cache miss, hit, invalidation, and malformed values`:

- capture the created messages: `const hello = await prisma.message.create(...)`, `const hi = await prisma.message.create(...)`, `const followUp = await prisma.message.create(...)`.
- replace each expected entry with the id-bearing form, e.g. `{ id: hello.id, role: 'user', content: 'Hello' }`, `{ id: hi.id, role: 'assistant', content: 'Hi', model: 'qwen2.5:1.5b' }`, `{ id: followUp.id, role: 'user', content: 'Cached follow-up' }` (in the `toEqual` checks, the `JSON.stringify` checks, and the `history.append` entry).

Add at the end of that test:

```ts
await redis.setWithTtl({
  key: chat.id,
  value: JSON.stringify([{ role: 'user', content: 'Hello' }]),
  ttlSeconds: 60,
});
await expect(history.getHistory(chat.id)).resolves.toHaveLength(3);
```

(An old-format cache entry without `id` is treated as malformed and reloaded.)

In test `excludes turns whose assistant reply failed or was cancelled from history`, change each expected entry to include `id: expect.any(String)`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/api exec jest test/persistence.integration.spec.ts -t "history"`
Expected: FAIL. Entries have no `id`.

- [ ] **Step 3: Implement**

In `chats.types.ts`:

```ts
export type ChatHistoryEntry =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; model: string };
```

In `chat-history.service.ts`:

```ts
const history_entry_schema = z.discriminatedUnion('role', [
  z.object({
    id: z.string().min(1),
    role: z.literal('user'),
    content: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    role: z.literal('assistant'),
    content: z.string(),
    model: z.string().min(1),
  }),
]);
```

and in `loadFromDatabase` return `{ id: message.id, role: 'user' as const, content: message.content }` and `{ id: message.id, role: 'assistant' as const, content: message.content, model: message.model }`.

In `chat-stream.service.ts` change the append entry to `{ id: messages.userMessage.id, role: 'user', content }`, and map history to `({ role, content: historyContent }) => ({ role, content: historyContent })` (unchanged; ids must not reach Ollama).

In `phase4.spec.ts`, `getHistory` mock → `mockResolvedValue([{ id: 'earlier', role: 'user', content: 'Earlier' }])`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): keep message ids in the chat history cache"
```

---

### Task 5: Context-window helpers and settings

**Files:**

- Create: `apps/api/src/chats/context-window.helpers.ts`
- Modify: `apps/api/src/chats/chats.types.ts`, `apps/api/src/config/environment.schema.ts`, `.env.example`
- Test: create `apps/api/test/context-window.helpers.spec.ts`; modify `apps/api/test/environment.schema.spec.ts`

**Interfaces:**

- Consumes: `ChatHistoryEntry` (Task 4), `OllamaHistoryMessage` (Task 3).
- Produces (all exported from `context-window.helpers.ts`; param types in `chats.types.ts`):
  - `MESSAGE_OVERHEAD_TOKENS = 4`, `SUMMARY_PROMPT_OVERHEAD_TOKENS = 256`
  - `ContextSettings { summarizeAtRatio: number; targetRatio: number; keepRecentMessages: number; charsPerToken: number; summaryMaxRatio: number }`
  - `ContextBudget { trigger: number; target: number; summaryMaxTokens: number; chunkTokens: number }`
  - `getContextBudget(maxContext: number, settings: ContextSettings): ContextBudget`
  - `estimateMessageTokens(text: string, charsPerToken: number): number`
  - `estimatePromptTokens(params: PromptEstimateParams): number` with `PromptEstimateParams { summary: string | null; turns: ChatHistoryEntry[]; content: string; charsPerToken: number }`
  - `needsSummarization(params: NeedsSummarizationParams): boolean` with `{ estimate: number; lastReportedTokens: number | null; contentTokens: number; trigger: number }`
  - `entriesAfter(history: ChatHistoryEntry[], messageId: string | null): ChatHistoryEntry[]`
  - `selectTurnsToFold(params: SelectTurnsToFoldParams): number` with `{ turns; content; keepRecent; target; summaryTokens; charsPerToken }`; returns how many leading entries to fold
  - `dropOldestTurns(params: PromptEstimateParams & { limit: number }): ChatHistoryEntry[]`
  - `chunkEntries(params: ChunkEntriesParams): ChatHistoryEntry[][]` with `{ entries; budget; charsPerToken }`
  - `buildSummaryRequest(params: SummaryRequestParams): OllamaHistoryMessage[]` with `{ previousSummary: string | null; entries: ChatHistoryEntry[]; maxEntryChars: number }`
  - `toPromptMessages(params: PromptMessagesParams): OllamaHistoryMessage[]` with `{ summary: string | null; turns: ChatHistoryEntry[]; content: string }`
  - `formatSummaryMessage(summary: string): string`
- Env: `CHAT_CONTEXT_SUMMARIZE_AT_RATIO`, `CHAT_CONTEXT_TARGET_RATIO`, `CHAT_CONTEXT_KEEP_RECENT_MESSAGES`, `CHAT_CONTEXT_CHARS_PER_TOKEN`, `CHAT_CONTEXT_SUMMARY_MAX_RATIO`.

- [ ] **Step 1: Write the failing helper tests**

Create `apps/api/test/context-window.helpers.spec.ts`:

```ts
import {
  buildSummaryRequest,
  chunkEntries,
  dropOldestTurns,
  entriesAfter,
  estimateMessageTokens,
  estimatePromptTokens,
  getContextBudget,
  needsSummarization,
  selectTurnsToFold,
  toPromptMessages,
} from '../src/chats/context-window.helpers';
import type { ChatHistoryEntry } from '../src/chats/chats.types';

const settings = {
  summarizeAtRatio: 0.75,
  targetRatio: 0.4,
  keepRecentMessages: 4,
  charsPerToken: 3,
  summaryMaxRatio: 0.1,
};

function turn(index: number, size = 30): ChatHistoryEntry[] {
  return [
    { id: `u${index}`, role: 'user', content: 'u'.repeat(size) },
    {
      id: `a${index}`,
      role: 'assistant',
      content: 'a'.repeat(size),
      model: 'm',
    },
  ];
}

describe('context window helpers', () => {
  it('derives the budget from max_context', () => {
    expect(getContextBudget(8192, settings)).toEqual({
      trigger: 6144,
      target: 3276,
      summaryMaxTokens: 819,
      chunkTokens: 8192 - 2 * 819 - 256,
    });
  });

  it('estimates tokens conservatively with per-message overhead', () => {
    expect(estimateMessageTokens('abcdef', 3)).toBe(2 + 4);
    expect(
      estimatePromptTokens({
        summary: 'x'.repeat(30),
        turns: turn(1),
        content: 'hi',
        charsPerToken: 3,
      }),
    ).toBe(
      estimateMessageTokens(
        'Summary of the earlier conversation:\n' + 'x'.repeat(30),
        3,
      ) +
        2 * (10 + 4) +
        (1 + 4),
    );
  });

  it('corrects a low estimate with the last reported token usage', () => {
    expect(
      needsSummarization({
        estimate: 100,
        lastReportedTokens: null,
        contentTokens: 10,
        trigger: 200,
      }),
    ).toBe(false);
    expect(
      needsSummarization({
        estimate: 100,
        lastReportedTokens: 195,
        contentTokens: 10,
        trigger: 200,
      }),
    ).toBe(true);
  });

  it('returns entries after the summarized message, or all when unknown', () => {
    const history = [...turn(1), ...turn(2)];
    expect(entriesAfter(history, 'a1').map((entry) => entry.id)).toEqual([
      'u2',
      'a2',
    ]);
    expect(entriesAfter(history, null)).toHaveLength(4);
    expect(entriesAfter(history, 'missing')).toHaveLength(4);
  });

  it('folds whole turns from the start until the rest fits the target', () => {
    const turns = [
      ...turn(1, 300),
      ...turn(2, 300),
      ...turn(3, 300),
      ...turn(4, 300),
    ];
    // each message ≈ 104 tokens; 8 messages ≈ 832 + content
    const fold = selectTurnsToFold({
      turns,
      content: 'next',
      keepRecent: 4,
      target: 500,
      summaryTokens: 50,
      charsPerToken: 3,
    });
    expect(fold).toBe(4);
    expect(turns[fold]?.role).toBe('user');
  });

  it('never folds the most recent messages', () => {
    const turns = [...turn(1, 3000), ...turn(2, 3000)];
    expect(
      selectTurnsToFold({
        turns,
        content: 'next',
        keepRecent: 4,
        target: 10,
        summaryTokens: 0,
        charsPerToken: 3,
      }),
    ).toBe(0);
  });

  it('dropOldestTurns drops whole turns until the prompt fits', () => {
    const turns = [...turn(1, 300), ...turn(2, 300), ...turn(3, 300)];
    const kept = dropOldestTurns({
      summary: null,
      turns,
      content: 'next',
      charsPerToken: 3,
      limit: 250,
    });
    expect(kept.map((entry) => entry.id)).toEqual(['u3', 'a3']);
    expect(
      dropOldestTurns({
        summary: null,
        turns,
        content: 'next',
        charsPerToken: 3,
        limit: 5,
      }),
    ).toEqual([]);
  });

  it('splits folded entries into chunks under the budget', () => {
    const entries = [...turn(1, 300), ...turn(2, 300)];
    const chunks = chunkEntries({ entries, budget: 220, charsPerToken: 3 });
    expect(chunks.map((chunk) => chunk.map((entry) => entry.id))).toEqual([
      ['u1', 'a1'],
      ['u2', 'a2'],
    ]);
  });

  it('buildSummaryRequest carries the previous summary and truncates oversized entries', () => {
    const [system, user] = buildSummaryRequest({
      previousSummary: 'Known: likes Rust.',
      entries: [
        { id: 'a1', role: 'assistant', content: 'z'.repeat(50), model: 'm' },
      ],
      maxEntryChars: 10,
    });
    expect(system?.role).toBe('system');
    expect(user?.content).toContain('Known: likes Rust.');
    expect(user?.content).toContain(`Assistant: ${'z'.repeat(10)}…`);
    expect(user?.content).not.toContain('z'.repeat(11));
  });

  it('builds the prompt with the summary as a system message', () => {
    expect(
      toPromptMessages({ summary: 'S', turns: turn(1, 1), content: 'now' }),
    ).toEqual([
      { role: 'system', content: 'Summary of the earlier conversation:\nS' },
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a' },
      { role: 'user', content: 'now' },
    ]);
  });
});
```

Add to `apps/api/test/environment.schema.spec.ts`:

```ts
it('provides context window defaults and rejects an inverted target', () => {
  expect(validateEnvironment({})).toEqual(
    expect.objectContaining({
      CHAT_CONTEXT_SUMMARIZE_AT_RATIO: 0.75,
      CHAT_CONTEXT_TARGET_RATIO: 0.4,
      CHAT_CONTEXT_KEEP_RECENT_MESSAGES: 4,
      CHAT_CONTEXT_CHARS_PER_TOKEN: 3,
      CHAT_CONTEXT_SUMMARY_MAX_RATIO: 0.1,
    }),
  );
  expect(() =>
    validateEnvironment({
      CHAT_CONTEXT_SUMMARIZE_AT_RATIO: '0.5',
      CHAT_CONTEXT_TARGET_RATIO: '0.6',
    }),
  ).toThrow('CHAT_CONTEXT_TARGET_RATIO must be lower');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/api exec jest test/context-window.helpers.spec.ts test/environment.schema.spec.ts`
Expected: FAIL. The module is not found and the env keys are missing.

- [ ] **Step 3: Add the env settings**

In `environment.schema.ts` add after `CHAT_MAX_RESPONSE_CHARS`:

```ts
    CHAT_CONTEXT_SUMMARIZE_AT_RATIO: z.coerce.number().gt(0).lt(1).default(0.75),
    CHAT_CONTEXT_TARGET_RATIO: z.coerce.number().gt(0).lt(1).default(0.4),
    CHAT_CONTEXT_KEEP_RECENT_MESSAGES: z.coerce.number().int().min(0).default(4),
    CHAT_CONTEXT_CHARS_PER_TOKEN: z.coerce.number().positive().default(3),
    CHAT_CONTEXT_SUMMARY_MAX_RATIO: z.coerce.number().gt(0).lt(0.5).default(0.1),
```

and at the top of `superRefine`:

```ts
if (
  environment.CHAT_CONTEXT_TARGET_RATIO >=
  environment.CHAT_CONTEXT_SUMMARIZE_AT_RATIO
) {
  context.addIssue({
    code: 'custom',
    path: ['CHAT_CONTEXT_TARGET_RATIO'],
    message:
      'CHAT_CONTEXT_TARGET_RATIO must be lower than CHAT_CONTEXT_SUMMARIZE_AT_RATIO',
  });
}
```

In `.env.example`, after `CHAT_MAX_RESPONSE_CHARS=100000`, add:

```
CHAT_CONTEXT_SUMMARIZE_AT_RATIO=0.75
CHAT_CONTEXT_TARGET_RATIO=0.4
CHAT_CONTEXT_KEEP_RECENT_MESSAGES=4
CHAT_CONTEXT_CHARS_PER_TOKEN=3
CHAT_CONTEXT_SUMMARY_MAX_RATIO=0.1
```

- [ ] **Step 4: Implement the helpers**

Add to `chats.types.ts` (import `OllamaHistoryMessage` isn't needed here):

```ts
export interface ContextSettings {
  summarizeAtRatio: number;
  targetRatio: number;
  keepRecentMessages: number;
  charsPerToken: number;
  summaryMaxRatio: number;
}

export interface ContextBudget {
  trigger: number;
  target: number;
  summaryMaxTokens: number;
  chunkTokens: number;
}

export interface PromptEstimateParams {
  summary: string | null;
  turns: ChatHistoryEntry[];
  content: string;
  charsPerToken: number;
}

export interface NeedsSummarizationParams {
  estimate: number;
  lastReportedTokens: number | null;
  contentTokens: number;
  trigger: number;
}

export interface SelectTurnsToFoldParams {
  turns: ChatHistoryEntry[];
  content: string;
  keepRecent: number;
  target: number;
  summaryTokens: number;
  charsPerToken: number;
}

export interface ChunkEntriesParams {
  entries: ChatHistoryEntry[];
  budget: number;
  charsPerToken: number;
}

export interface SummaryRequestParams {
  previousSummary: string | null;
  entries: ChatHistoryEntry[];
  maxEntryChars: number;
}

export interface PromptMessagesParams {
  summary: string | null;
  turns: ChatHistoryEntry[];
  content: string;
}
```

Create `apps/api/src/chats/context-window.helpers.ts`:

```ts
import type { OllamaHistoryMessage } from '../ollama/ollama.types';
import type {
  ChatHistoryEntry,
  ChunkEntriesParams,
  ContextBudget,
  ContextSettings,
  NeedsSummarizationParams,
  PromptEstimateParams,
  PromptMessagesParams,
  SelectTurnsToFoldParams,
  SummaryRequestParams,
} from './chats.types';

// Chat templates wrap every message in role markers; count them too.
export const MESSAGE_OVERHEAD_TOKENS = 4;
export const SUMMARY_PROMPT_OVERHEAD_TOKENS = 256;

const SUMMARY_INSTRUCTIONS = [
  'You maintain a running summary of a conversation between a user and an assistant.',
  'Update the summary with the new messages. Preserve facts, decisions, names, numbers,',
  'code identifiers, user preferences, and open questions. Drop pleasantries and repetition.',
  'Write concise prose in the same language as the conversation.',
  'Reply with the updated summary only.',
].join('\n');

export function getContextBudget(
  maxContext: number,
  settings: ContextSettings,
): ContextBudget {
  const summaryMaxTokens = Math.floor(maxContext * settings.summaryMaxRatio);
  return {
    trigger: Math.floor(maxContext * settings.summarizeAtRatio),
    target: Math.floor(maxContext * settings.targetRatio),
    summaryMaxTokens,
    chunkTokens: Math.max(
      1,
      maxContext - 2 * summaryMaxTokens - SUMMARY_PROMPT_OVERHEAD_TOKENS,
    ),
  };
}

export function estimateMessageTokens(
  text: string,
  charsPerToken: number,
): number {
  return Math.ceil(text.length / charsPerToken) + MESSAGE_OVERHEAD_TOKENS;
}

export function formatSummaryMessage(summary: string): string {
  return `Summary of the earlier conversation:\n${summary}`;
}

export function estimatePromptTokens({
  summary,
  turns,
  content,
  charsPerToken,
}: PromptEstimateParams): number {
  const texts = [
    ...(summary ? [formatSummaryMessage(summary)] : []),
    ...turns.map((entry) => entry.content),
    content,
  ];
  return texts.reduce(
    (total, text) => total + estimateMessageTokens(text, charsPerToken),
    0,
  );
}

// Ollama's reported usage is exact; if the estimate undershoots, the next
// turn still sees the real size and summarizes.
export function needsSummarization({
  estimate,
  lastReportedTokens,
  contentTokens,
  trigger,
}: NeedsSummarizationParams): boolean {
  const reported =
    lastReportedTokens === null ? 0 : lastReportedTokens + contentTokens;
  return Math.max(estimate, reported) > trigger;
}

export function entriesAfter(
  history: ChatHistoryEntry[],
  messageId: string | null,
): ChatHistoryEntry[] {
  if (messageId === null) return history;
  const index = history.findIndex((entry) => entry.id === messageId);
  return index === -1 ? history : history.slice(index + 1);
}

function isTurnBoundary(turns: ChatHistoryEntry[], index: number): boolean {
  return index === turns.length || turns[index]?.role === 'user';
}

export function selectTurnsToFold({
  turns,
  content,
  keepRecent,
  target,
  summaryTokens,
  charsPerToken,
}: SelectTurnsToFoldParams): number {
  const maxFoldable = Math.max(0, turns.length - keepRecent);
  let fold = 0;

  for (let index = 1; index <= maxFoldable; index += 1) {
    if (!isTurnBoundary(turns, index)) continue;
    fold = index;
    const remaining =
      summaryTokens +
      estimatePromptTokens({
        summary: null,
        turns: turns.slice(index),
        content,
        charsPerToken,
      });
    if (remaining <= target) break;
  }

  return fold;
}

export function dropOldestTurns({
  limit,
  ...params
}: PromptEstimateParams & { limit: number }): ChatHistoryEntry[] {
  let start = 0;

  while (
    start < params.turns.length &&
    estimatePromptTokens({ ...params, turns: params.turns.slice(start) }) >
      limit
  ) {
    start += 1;
    while (!isTurnBoundary(params.turns, start)) start += 1;
  }

  return params.turns.slice(start);
}

export function chunkEntries({
  entries,
  budget,
  charsPerToken,
}: ChunkEntriesParams): ChatHistoryEntry[][] {
  const chunks: ChatHistoryEntry[][] = [];
  let current: ChatHistoryEntry[] = [];
  let size = 0;

  for (const entry of entries) {
    const cost = estimateMessageTokens(entry.content, charsPerToken);
    if (current.length > 0 && size + cost > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += cost;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function buildSummaryRequest({
  previousSummary,
  entries,
  maxEntryChars,
}: SummaryRequestParams): OllamaHistoryMessage[] {
  const transcript = entries
    .map(
      (entry) =>
        `${entry.role === 'user' ? 'User' : 'Assistant'}: ${truncate(entry.content, maxEntryChars)}`,
    )
    .join('\n\n');
  return [
    { role: 'system', content: SUMMARY_INSTRUCTIONS },
    {
      role: 'user',
      content: `Current summary:\n${previousSummary ?? '(none)'}\n\nNew messages:\n${transcript}`,
    },
  ];
}

export function toPromptMessages({
  summary,
  turns,
  content,
}: PromptMessagesParams): OllamaHistoryMessage[] {
  return [
    ...(summary
      ? [{ role: 'system' as const, content: formatSummaryMessage(summary) }]
      : []),
    ...turns.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content },
  ];
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @js-rag-stack/api exec jest test/context-window.helpers.spec.ts test/environment.schema.spec.ts && pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint`
Expected: PASS. If a numeric expectation in the fold/drop tests is off, recompute it by hand from `estimateMessageTokens` (`ceil(len/3)+4`) and fix the **test data**, not the algorithm, unless the algorithm violates the rule under test (whole turns only; keep recent; fits limit).

- [ ] **Step 6: Commit**

```bash
git add apps/api .env.example
git commit -m "feat(api): add token budget and fold-selection helpers"
```

---

### Task 6: `ContextWindowService`

**Files:**

- Create: `apps/api/src/chats/context-window.service.ts`
- Modify: `apps/api/src/chats/chats.types.ts`, `chats.module.ts`
- Test: create `apps/api/test/context-window.service.spec.ts`

**Interfaces:**

- Consumes: helpers (Task 5), `ConversationSummaryRepository` (Task 2), `ChatsRepository.findLastCompletedAssistantMessage` (Task 2), `OllamaService.complete` (Task 3), `Model` (Task 1).
- Produces:
  - `ContextWindowService.assertContentFits({ model, content }: { model: Model; content: string }): void`: throws `PayloadTooLargeException("The message is too long for this model's context.")`.
  - `ContextWindowService.buildPrompt(params: BuildPromptParams): Promise<BuiltPrompt>`.
  - `BuildPromptParams { chatId: string; model: Model; history: ChatHistoryEntry[]; content: string; signal: AbortSignal; onSummarizing: () => void }` (`history` excludes the new message).
  - `BuiltPrompt { messages: OllamaHistoryMessage[]; summary: ConversationSummary | null }`.
  - Constructor: `(summaries: ConversationSummaryRepository, repository: ChatsRepository, ollama: OllamaService, config: ConfigService<AppEnvironment, true>)`.

- [ ] **Step 1: Write the failing service tests**

Create `apps/api/test/context-window.service.spec.ts`:

```ts
import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { ContextWindowService } from '../src/chats/context-window.service';
import type { ChatHistoryEntry } from '../src/chats/chats.types';

const config = new ConfigService<AppEnvironment, true>(
  validateEnvironment({ NODE_ENV: 'test' }),
);
const now = new Date('2026-09-30T12:00:00.000Z');

function model(maxContext = 1000) {
  return {
    id: 'model-id',
    name: 'qwen2.5:1.5b',
    max_context: maxContext,
    created_at: now,
    updated_at: now,
  };
}

function history(turns: number, size: number): ChatHistoryEntry[] {
  return Array.from({ length: turns }, (_, index) => [
    {
      id: `u${index}`,
      role: 'user' as const,
      content: `${index}`.padEnd(size, 'u'),
    },
    {
      id: `a${index}`,
      role: 'assistant' as const,
      content: `${index}`.padEnd(size, 'a'),
      model: 'qwen2.5:1.5b',
    },
  ]).flat();
}

function setup({
  existingSummary = null as null | {
    content: string;
    summarized_through_message_id: string;
  },
  lastReported = null as null | {
    prompt_tokens: number;
    completion_tokens: number;
  },
} = {}) {
  const summaries = {
    findByChatId: jest.fn().mockResolvedValue(
      existingSummary
        ? {
            id: 's',
            chat_id: 'chat-id',
            token_count: 10,
            created_at: now,
            updated_at: now,
            ...existingSummary,
          }
        : null,
    ),
    upsert: jest.fn(
      (params: {
        content: string;
        summarizedThroughMessageId: string;
        tokenCount: number;
      }) =>
        Promise.resolve({
          id: 's',
          chat_id: 'chat-id',
          content: params.content,
          summarized_through_message_id: params.summarizedThroughMessageId,
          token_count: params.tokenCount,
          created_at: now,
          updated_at: now,
        }),
    ),
  };
  const repository = {
    findLastCompletedAssistantMessage: jest
      .fn()
      .mockResolvedValue(lastReported),
  };
  const ollama = {
    complete: jest
      .fn()
      .mockResolvedValue({ content: ' New summary ', completionTokens: 5 }),
  };
  const service = new ContextWindowService(
    summaries as never,
    repository as never,
    ollama as never,
    config,
  );
  return { service, summaries, repository, ollama };
}

function build(
  service: ContextWindowService,
  overrides: Partial<Parameters<ContextWindowService['buildPrompt']>[0]> = {},
) {
  return service.buildPrompt({
    chatId: 'chat-id',
    model: model(),
    history: [],
    content: 'next question',
    signal: new AbortController().signal,
    onSummarizing: jest.fn(),
    ...overrides,
  });
}

describe('ContextWindowService', () => {
  it('sends the full history when it fits', async () => {
    const { service, ollama, summaries } = setup();
    const result = await build(service, { history: history(2, 30) });

    expect(result.messages).toHaveLength(5);
    expect(result.summary).toBeNull();
    expect(ollama.complete).not.toHaveBeenCalled();
    expect(summaries.upsert).not.toHaveBeenCalled();
  });

  it('prepends an existing summary and skips already-summarized turns', async () => {
    const { service } = setup({
      existingSummary: {
        content: 'Old facts',
        summarized_through_message_id: 'a0',
      },
    });
    const result = await build(service, { history: history(2, 30) });

    expect(result.messages[0]).toEqual({
      role: 'system',
      content: 'Summary of the earlier conversation:\nOld facts',
    });
    expect(
      result.messages.slice(1).map((message) => message.content[0]),
    ).toEqual(['1', '1', 'n']);
  });

  it('folds old turns into a saved summary when over the trigger', async () => {
    const onSummarizing = jest.fn();
    const { service, ollama, summaries } = setup();
    // 6 turns × 2 × (100 + 4) ≈ 1248 tokens > trigger 750 for max_context 1000
    const result = await build(service, {
      history: history(6, 300),
      onSummarizing,
    });

    expect(onSummarizing).toHaveBeenCalledTimes(1);
    expect(ollama.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'qwen2.5:1.5b',
        contextTokens: 1000,
        maxTokens: 100,
      }),
    );
    const saved = summaries.upsert.mock.calls[0]?.[0];
    expect(saved?.content).toBe('New summary');
    expect(saved?.summarizedThroughMessageId).toMatch(/^a\d$/);
    expect(result.messages[0]?.role).toBe('system');
    // the last 4 history messages are always kept verbatim
    expect(
      result.messages.slice(-5, -1).map((message) => message.content[0]),
    ).toEqual(['4', '4', '5', '5']);
  });

  it('summarizes when the reported usage says the estimate was too low', async () => {
    const { service, ollama } = setup({
      lastReported: { prompt_tokens: 700, completion_tokens: 60 },
    });
    await build(service, { history: history(4, 30) });

    expect(ollama.complete).toHaveBeenCalled();
  });

  it('summarizes a large backlog in chunks', async () => {
    const { service, ollama, summaries } = setup();
    await build(service, { history: history(12, 600) });

    expect(ollama.complete.mock.calls.length).toBeGreaterThan(1);
    // later chunks build on the previous chunk's summary
    const secondRequest = ollama.complete.mock.calls[1]?.[0] as {
      messages: { content: string }[];
    };
    expect(secondRequest.messages[1]?.content).toContain('New summary');
    expect(summaries.upsert).toHaveBeenCalledTimes(1);
  });

  it('uses the requested model max_context', async () => {
    const { service, ollama } = setup();
    await build(service, { model: model(400), history: history(3, 300) });

    expect(ollama.complete).toHaveBeenCalledWith(
      expect.objectContaining({ contextTokens: 400 }),
    );
  });

  it('falls back to dropping old turns when summarization fails', async () => {
    const { service, ollama, summaries } = setup();
    ollama.complete.mockRejectedValue(new Error('offline'));
    const result = await build(service, { history: history(6, 300) });

    expect(summaries.upsert).not.toHaveBeenCalled();
    expect(result.summary).toBeNull();
    expect(result.messages.at(-1)).toEqual({
      role: 'user',
      content: 'next question',
    });
    expect(result.messages.length).toBeLessThan(13);
  });

  it('drops oldest turns when nothing can be folded', async () => {
    const { service, ollama } = setup();
    // 4 messages × 338 tokens > trigger 750, but keep-4 forbids folding;
    // dropping the first turn brings it to ~685.
    const result = await build(service, { history: history(2, 1000) });

    expect(ollama.complete).not.toHaveBeenCalled();
    expect(result.messages.map((message) => message.content[0])).toEqual([
      '1',
      '1',
      'n',
    ]);
  });

  it('does not save a summary when cancelled', async () => {
    const controller = new AbortController();
    const { service, ollama, summaries } = setup();
    ollama.complete.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    });

    await expect(
      build(service, { history: history(6, 300), signal: controller.signal }),
    ).rejects.toThrow('aborted');
    expect(summaries.upsert).not.toHaveBeenCalled();
  });

  it('rejects a message that alone exceeds the trigger', () => {
    const { service } = setup();
    expect(() =>
      service.assertContentFits({
        model: model(100),
        content: 'x'.repeat(600),
      }),
    ).toThrow(
      new PayloadTooLargeException(
        "The message is too long for this model's context.",
      ),
    );
    expect(() =>
      service.assertContentFits({ model: model(), content: 'short' }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/api exec jest test/context-window.service.spec.ts`
Expected: FAIL. `Cannot find module '../src/chats/context-window.service'`.

- [ ] **Step 3: Implement the service**

Add to `chats.types.ts` (import `Model`, `ConversationSummary` from prisma and `OllamaHistoryMessage` from `../ollama/ollama.types`):

```ts
export interface BuildPromptParams {
  chatId: string;
  model: Model;
  history: ChatHistoryEntry[];
  content: string;
  signal: AbortSignal;
  onSummarizing: () => void;
}

export interface BuiltPrompt {
  messages: OllamaHistoryMessage[];
  summary: ConversationSummary | null;
}

export interface SummarizeParams {
  chatId: string;
  model: Model;
  previous: ConversationSummary | null;
  folded: ChatHistoryEntry[];
  budget: ContextBudget;
  signal: AbortSignal;
}
```

Create `apps/api/src/chats/context-window.service.ts`:

```ts
import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../common/utils/error';
import type { AppEnvironment } from '../config/environment.schema';
import type { ConversationSummary, Model } from '../generated/prisma/client';
import { OllamaService } from '../ollama/ollama.service';
import { ChatsRepository } from './chats.repository';
import type {
  BuildPromptParams,
  BuiltPrompt,
  ContextSettings,
  SummarizeParams,
} from './chats.types';
import {
  buildSummaryRequest,
  chunkEntries,
  dropOldestTurns,
  entriesAfter,
  estimateMessageTokens,
  estimatePromptTokens,
  getContextBudget,
  needsSummarization,
  selectTurnsToFold,
  toPromptMessages,
} from './context-window.helpers';
import { ConversationSummaryRepository } from './conversation-summary.repository';

@Injectable()
export class ContextWindowService {
  private readonly logger = new Logger(ContextWindowService.name);
  private readonly settings: ContextSettings;

  constructor(
    private readonly summaries: ConversationSummaryRepository,
    private readonly repository: ChatsRepository,
    private readonly ollama: OllamaService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.settings = {
      summarizeAtRatio: config.get('CHAT_CONTEXT_SUMMARIZE_AT_RATIO', {
        infer: true,
      }),
      targetRatio: config.get('CHAT_CONTEXT_TARGET_RATIO', { infer: true }),
      keepRecentMessages: config.get('CHAT_CONTEXT_KEEP_RECENT_MESSAGES', {
        infer: true,
      }),
      charsPerToken: config.get('CHAT_CONTEXT_CHARS_PER_TOKEN', {
        infer: true,
      }),
      summaryMaxRatio: config.get('CHAT_CONTEXT_SUMMARY_MAX_RATIO', {
        infer: true,
      }),
    };
  }

  assertContentFits({
    model,
    content,
  }: {
    model: Model;
    content: string;
  }): void {
    const { trigger } = getContextBudget(model.max_context, this.settings);
    if (estimateMessageTokens(content, this.settings.charsPerToken) > trigger) {
      throw new PayloadTooLargeException(
        "The message is too long for this model's context.",
      );
    }
  }

  async buildPrompt({
    chatId,
    model,
    history,
    content,
    signal,
    onSummarizing,
  }: BuildPromptParams): Promise<BuiltPrompt> {
    const { charsPerToken } = this.settings;
    const budget = getContextBudget(model.max_context, this.settings);
    const [existing, lastAssistant] = await Promise.all([
      this.summaries.findByChatId(chatId),
      this.repository.findLastCompletedAssistantMessage(chatId),
    ]);
    let summary = existing;
    let turns = entriesAfter(
      history,
      existing?.summarized_through_message_id ?? null,
    );

    const promptTokens = lastAssistant?.prompt_tokens ?? null;
    const completionTokens = lastAssistant?.completion_tokens ?? null;
    const lastReportedTokens =
      promptTokens === null || completionTokens === null
        ? null
        : promptTokens + completionTokens;
    const overBudget = needsSummarization({
      estimate: estimatePromptTokens({
        summary: summary?.content ?? null,
        turns,
        content,
        charsPerToken,
      }),
      lastReportedTokens,
      contentTokens: estimateMessageTokens(content, charsPerToken),
      trigger: budget.trigger,
    });

    if (overBudget) {
      const foldCount = selectTurnsToFold({
        turns,
        content,
        keepRecent: this.settings.keepRecentMessages,
        target: budget.target,
        summaryTokens: budget.summaryMaxTokens,
        charsPerToken,
      });

      if (foldCount > 0) {
        onSummarizing();
        try {
          summary = await this.summarize({
            chatId,
            model,
            previous: existing,
            folded: turns.slice(0, foldCount),
            budget,
            signal,
          });
          turns = turns.slice(foldCount);
        } catch (error) {
          if (signal.aborted) throw error;
          this.logger.warn(
            `Summarization failed for chat ${chatId}; dropping oldest turns: ${getErrorMessage(error)}`,
          );
        }
      }
    }

    // Last line of defence: whatever happened above, the prompt must fit.
    turns = dropOldestTurns({
      summary: summary?.content ?? null,
      turns,
      content,
      charsPerToken,
      limit: budget.trigger,
    });

    return {
      messages: toPromptMessages({
        summary: summary?.content ?? null,
        turns,
        content,
      }),
      summary,
    };
  }

  private async summarize({
    chatId,
    model,
    previous,
    folded,
    budget,
    signal,
  }: SummarizeParams): Promise<ConversationSummary> {
    const { charsPerToken } = this.settings;
    let content = previous?.content ?? null;
    let tokenCount = previous?.token_count ?? 0;

    for (const chunk of chunkEntries({
      entries: folded,
      budget: budget.chunkTokens,
      charsPerToken,
    })) {
      const result = await this.ollama.complete({
        model: model.name,
        messages: buildSummaryRequest({
          previousSummary: content,
          entries: chunk,
          maxEntryChars: budget.chunkTokens * charsPerToken,
        }),
        contextTokens: model.max_context,
        maxTokens: budget.summaryMaxTokens,
        signal,
      });
      content = result.content.trim();
      tokenCount =
        result.completionTokens ??
        estimateMessageTokens(content, charsPerToken);
    }

    const lastFolded = folded.at(-1);
    if (!content || !lastFolded) {
      throw new Error('The model returned an empty summary.');
    }

    return this.summaries.upsert({
      chatId,
      content,
      summarizedThroughMessageId: lastFolded.id,
      tokenCount,
    });
  }
}
```

In `chats.module.ts` add `ContextWindowService` to `providers`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @js-rag-stack/api exec jest test/context-window.service.spec.ts && pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint`
Expected: PASS. If an exact index expectation (for example `['4','4','5','5']`) is off, recompute it by hand from the helpers and fix the **test data sizes** so the test still pins the stated rule (keep last 4 verbatim, whole turns, fits trigger).

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): build prompts within the context window with running summaries"
```

---

### Task 7: Stream event contracts and web stream state

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/web/src/features/chat/chat.types.ts`, `chat.helpers.ts`, `use-chat-stream.ts`, `message-list.tsx`
- Test: `apps/web/src/features/chat/chat.helpers.test.ts`, `message-list.test.tsx`

**Interfaces:**

- Consumes: `ChatContext` (Task 2).
- Produces:
  - `StreamEventName` adds `'context.summarizing' | 'context.updated'`; `ChatStreamEvent` adds `{ event: 'context.summarizing'; data: Record<string, never> }` and `{ event: 'context.updated'; data: ChatContext }`.
  - `PendingStream` adds `summarizing: boolean; context: ChatContext | null`.
  - `AssistantMessageProps` adds `summarizing?: boolean`.

- [ ] **Step 1: Write the failing web tests**

In `apps/web/src/features/chat/chat.helpers.test.ts` add (reuse or add a local `pendingStream()` factory that returns a full `PendingStream` with `summarizing: false, context: null`):

```ts
it('tracks summarization and context updates from the stream', () => {
  const start = pendingStream();
  const summarizing = applyStreamEvent({
    pending: start,
    event: { event: 'context.summarizing', data: {} },
  });
  expect(summarizing.summarizing).toBe(true);

  const streaming = applyStreamEvent({
    pending: summarizing,
    event: {
      event: 'message.delta',
      data: { assistantMessageId: 'a', delta: 'Hi' },
    },
  });
  expect(streaming.summarizing).toBe(false);

  const context = {
    usedTokens: 900,
    maxTokens: 8192,
    summary: 'S',
    summarizedThroughMessageId: 'm4',
  };
  expect(
    applyStreamEvent({
      pending: streaming,
      event: { event: 'context.updated', data: context },
    }).context,
  ).toEqual(context);
});
```

If the file has no factory yet, add:

```ts
function pendingStream(overrides: Partial<PendingStream> = {}): PendingStream {
  return {
    chatId: 'c1',
    status: 'streaming',
    userContent: 'Hi',
    userMessageId: 'u',
    assistantMessageId: 'a',
    model: 'qwen2.5:1.5b',
    assistantText: '',
    errorMessage: null,
    summarizing: false,
    context: null,
    ...overrides,
  };
}
```

In `message-list.test.tsx` add:

```ts
it('shows a summarizing status instead of the thinking dots', () => {
  renderList({
    pending: {
      chatId: 'c1',
      status: 'streaming',
      userContent: 'Hi',
      userMessageId: 'u',
      assistantMessageId: 'a',
      model: 'qwen2.5:1.5b',
      assistantText: '',
      errorMessage: null,
      summarizing: true,
      context: null,
    },
  });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Summarizing earlier messages…',
  );
});
```

(`renderList` = the file's existing render helper; if it takes positional props, adapt the call to it and add every existing `PendingStream` literal in the file the two new fields `summarizing: false, context: null`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/web test -- chat.helpers message-list`
Expected: FAIL (type errors about unknown event names or missing fields, and missing text).

- [ ] **Step 3: Implement**

`packages/contracts/src/index.ts`:

```ts
export type StreamEventName =
  | 'stream.started'
  | 'message.delta'
  | 'message.completed'
  | 'context.summarizing'
  | 'context.updated'
  | 'stream.error'
  | 'stream.cancelled'
  | 'heartbeat';
```

and add to `ChatStreamEvent`:

```ts
  | { event: 'context.summarizing'; data: Record<string, never> }
  | { event: 'context.updated'; data: ChatContext }
```

`apps/web/src/features/chat/chat.types.ts`: import `ChatContext` from contracts; add `summarizing: boolean;` and `context: ChatContext | null;` to `PendingStream`; add `summarizing?: boolean;` to `AssistantMessageProps`.

`chat.helpers.ts` `applyStreamEvent`:

```ts
    case 'message.delta':
      return {
        ...pending,
        summarizing: false,
        assistantText: pending.assistantText + event.data.delta,
      };
    case 'context.summarizing':
      return { ...pending, summarizing: true };
    case 'context.updated':
      return { ...pending, context: event.data };
```

`use-chat-stream.ts`: add `summarizing: false, context: null,` to the initial `setPending({...})`.

`message-list.tsx`:

```tsx
function SummarizingIndicator() {
  return (
    <p role="status" className="py-2 text-sm text-fg-subtle">
      Summarizing earlier messages…
    </p>
  );
}
```

In `AssistantMessage` accept `summarizing` and render:

```tsx
{
  content ? (
    <LazyMarkdown content={content} streaming={streaming} />
  ) : streaming ? (
    summarizing ? (
      <SummarizingIndicator />
    ) : (
      <ThinkingIndicator />
    )
  ) : null;
}
```

and pass `summarizing={pending.summarizing}` to the pending `AssistantMessage`.

Update every other `PendingStream` object literal in `apps/web/src` (find them with `grep -rn "assistantText:" apps/web/src`) to include `summarizing: false, context: null`.

- [ ] **Step 4: Run the checks**

Run: `pnpm typecheck && pnpm --filter @js-rag-stack/web test`
Expected: PASS (the API compiles unchanged because it doesn't emit the new events yet).

- [ ] **Step 5: Commit**

```bash
git add packages apps/web
git commit -m "feat(web): handle summarizing and context stream events"
```

---

### Task 8: Wire the context window into streaming

**Files:**

- Modify: `apps/api/src/chats/chat-stream.service.ts`, `apps/api/src/config/environment.schema.ts`, `.env.example`
- Test: `apps/api/test/phase4.spec.ts`

**Interfaces:**

- Consumes: `ContextWindowService.assertContentFits` / `buildPrompt` (Task 6), `toChatContext` (Task 2), stream events (Task 7).
- Produces: `ChatStreamService` constructor `(repository, ownership, history, locks, ollama, contextWindow, config)`. Event order: `stream.started` → (`context.summarizing`)? → `message.delta`\* → `message.completed` → `context.updated`.

- [ ] **Step 1: Update the stream tests (failing)**

In `phase4.spec.ts`, for each of the 3 `new ChatStreamService(...)` calls, insert before `config`:

```ts
      contextWindow as never,
```

with, near the top of each test:

```ts
const contextWindow = {
  assertContentFits: jest.fn(),
  buildPrompt: jest.fn(({ onSummarizing }: { onSummarizing: () => void }) => {
    onSummarizing();
    return Promise.resolve({
      messages: [{ role: 'user', content: 'Current' }],
      summary: null,
    });
  }),
};
```

In `persists completion metadata and keeps cache history in sync`, change the expected event list to:

```ts
expect(events.map((event) => event.event)).toEqual([
  'stream.started',
  'context.summarizing',
  'message.delta',
  'message.delta',
  'message.completed',
  'context.updated',
]);
expect(events.at(-1)).toEqual({
  event: 'context.updated',
  data: {
    usedTokens: 14,
    maxTokens: 8192,
    summary: null,
    summarizedThroughMessageId: null,
  },
});
expect(contextWindow.buildPrompt).toHaveBeenCalledWith(
  expect.objectContaining({
    chatId: 'chat-id',
    content: 'Current',
    history: [{ id: 'earlier', role: 'user', content: 'Earlier' }],
  }),
);
```

Add a test:

```ts
it('rejects an oversized message before locking or creating message rows', async () => {
  const repository = { beginGeneration: jest.fn() };
  const locks = {
    acquirePrincipalGenerationLock: jest.fn(),
    acquireGenerationLock: jest.fn(),
  };
  const service = new ChatStreamService(
    repository as never,
    {
      findOwnedChat: jest
        .fn()
        .mockResolvedValue({ selected_model: createModelRecord() }),
    } as never,
    {} as never,
    locks as never,
    {
      assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
    } as never,
    {
      assertContentFits: jest.fn(() => {
        throw new PayloadTooLargeException(
          "The message is too long for this model's context.",
        );
      }),
    } as never,
    config,
  );

  await expect(
    service.stream({
      chatId: 'chat-id',
      principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
      content: 'huge',
      signal: new AbortController().signal,
      emit: jest.fn(),
    }),
  ).rejects.toBeInstanceOf(PayloadTooLargeException);
  expect(repository.beginGeneration).not.toHaveBeenCalled();
  expect(locks.acquirePrincipalGenerationLock).not.toHaveBeenCalled();
});
```

(import `PayloadTooLargeException` from `@nestjs/common`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/api exec jest test/phase4.spec.ts`
Expected: FAIL. No `context.*` events, and `beginGeneration` is called.

- [ ] **Step 3: Implement**

In `chat-stream.service.ts`:

- inject `private readonly contextWindow: ContextWindowService,` after `ollama` (before `config`); import it and `toChatContext`.
- delete the `maxHistoryMessages` / `maxHistoryChars` fields, their `config.get` calls, and the `limitHistory` method.
- right after `const selectedModel = await this.ollama.assertAllowed(...)` and **before** `acquirePrincipalGenerationLock`, add:

```ts
this.contextWindow.assertContentFits({ model: selectedModel, content });
```

- replace the body of the `try` block's setup and the `streamChat` call:

```ts
      const history = await this.history.getHistory(chatId);
      const messages = await this.repository.beginGeneration({
        chatId,
        content,
        model: selectedModel.name,
      });
      assistantMessageId = messages.assistantMessage.id;
      await this.history.append({
        chatId,
        entry: { id: messages.userMessage.id, role: 'user', content },
      });
      emit({
        event: 'stream.started',
        data: {
          chatId,
          userMessageId: messages.userMessage.id,
          assistantMessageId,
          model: selectedModel.name,
        },
      });

      const prompt = await this.contextWindow.buildPrompt({
        chatId,
        model: selectedModel,
        history,
        content,
        signal,
        onSummarizing: () => emit({ event: 'context.summarizing', data: {} }),
      });

      let finalChunk: OllamaChatChunk | undefined;
      for await (const chunk of this.ollama.streamChat({
        model: selectedModel.name,
        messages: prompt.messages,
        contextTokens: selectedModel.max_context,
        signal,
      })) {
```

- after the existing `emit({ event: 'message.completed', ... })` add:

```ts
emit({
  event: 'context.updated',
  data: toChatContext({
    maxTokens: selectedModel.max_context,
    summary: prompt.summary,
    lastAssistantMessage: completed,
  }),
});
```

In `environment.schema.ts` delete `CHAT_MAX_HISTORY_MESSAGES` and `CHAT_MAX_HISTORY_CHARS`. In `.env.example` delete those two lines.

- [ ] **Step 4: Run all API checks**

Run: `pnpm --filter @js-rag-stack/api typecheck && pnpm --filter @js-rag-stack/api lint && pnpm --filter @js-rag-stack/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api .env.example
git commit -m "feat(api): summarize old turns inline before streaming a reply"
```

---

### Task 9: Context meter by the composer

**Files:**

- Create: `apps/web/src/features/chat/context-meter.tsx`, `context-meter.test.tsx`
- Modify: `apps/web/src/features/chat/chat.types.ts`, `composer.tsx`, `chat-page.tsx`
- Test: `apps/web/src/features/chat/chat-page.test.tsx`

**Interfaces:**

- Consumes: `ModelInfo.maxContext`, `ChatDetail.context` (Task 2), `PendingStream.context` (Task 7).
- Produces: `ContextMeter({ usedTokens, maxTokens }: ContextMeterProps)`, `formatTokenCount(value: number): string`, `CONTEXT_WARN_RATIO = 0.75`; `ComposerProps.contextMeter?: ReactNode`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/chat/context-meter.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextMeter, formatTokenCount } from './context-meter';

describe('ContextMeter', () => {
  it('formats token counts compactly', () => {
    expect(formatTokenCount(950)).toBe('950');
    expect(formatTokenCount(6100)).toBe('6.1k');
    expect(formatTokenCount(8192)).toBe('8.2k');
    expect(formatTokenCount(32000)).toBe('32k');
  });

  it('shows used / max with an accessible description', () => {
    render(<ContextMeter usedTokens={6100} maxTokens={8192} />);
    expect(screen.getByText('6.1k / 8.2k tokens')).toBeInTheDocument();
    expect(
      screen.getByText('Context: 6100 of 8192 tokens used'),
    ).toBeInTheDocument();
  });

  it('shows a dash before the first reply and nothing without a max', () => {
    const { rerender, container } = render(
      <ContextMeter usedTokens={null} maxTokens={8192} />,
    );
    expect(screen.getByText('— / 8.2k tokens')).toBeInTheDocument();
    rerender(<ContextMeter usedTokens={null} maxTokens={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('turns amber at the summarization threshold', () => {
    const { container, rerender } = render(
      <ContextMeter usedTokens={1000} maxTokens={8192} />,
    );
    expect(container.querySelector('[data-level="ok"]')).not.toBeNull();
    rerender(<ContextMeter usedTokens={6200} maxTokens={8192} />);
    expect(container.querySelector('[data-level="warn"]')).not.toBeNull();
  });
});
```

In `chat-page.test.tsx` add:

```tsx
it('shows context usage for the open chat', async () => {
  api.getModels.mockResolvedValue({
    models: [{ name: 'qwen2.5:1.5b', default: true, maxContext: 8192 }],
  });
  api.getChat.mockResolvedValue({
    ...makeChat({ id: 'c1' }),
    nextCursor: null,
    messages: [makeMessage({ id: 'u', content: 'Hi' })],
    context: {
      usedTokens: 1234,
      maxTokens: 8192,
      summary: null,
      summarizedThroughMessageId: null,
    },
  });
  renderPage('/chats/c1');

  expect(await screen.findByText('1.2k / 8.2k tokens')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/web test -- context-meter chat-page`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement**

Add to `chat.types.ts`:

```ts
export interface ContextMeterProps {
  usedTokens: number | null;
  maxTokens: number | null;
}
```

and `contextMeter?: ReactNode;` in `ComposerProps` (add `import type { ReactNode } from 'react';`).

Create `apps/web/src/features/chat/context-meter.tsx`:

```tsx
import type { ContextMeterProps } from './chat.types';

// Mirrors the API's default CHAT_CONTEXT_SUMMARIZE_AT_RATIO.
export const CONTEXT_WARN_RATIO = 0.75;

export function formatTokenCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function ContextMeter({ usedTokens, maxTokens }: ContextMeterProps) {
  if (maxTokens === null) return null;

  const ratio = usedTokens === null ? 0 : Math.min(1, usedTokens / maxTokens);
  const level = ratio >= CONTEXT_WARN_RATIO ? 'warn' : 'ok';
  const description =
    usedTokens === null
      ? `Context: no replies yet, ${maxTokens} token limit`
      : `Context: ${usedTokens} of ${maxTokens} tokens used`;

  return (
    <div
      title={description}
      data-level={level}
      className={`flex items-center gap-2 tabular-nums ${level === 'warn' ? 'text-warning' : ''}`}
    >
      <span className="sr-only">{description}</span>
      <span
        aria-hidden="true"
        className="h-1 w-12 overflow-hidden rounded-full bg-border"
      >
        <span
          className={`block h-full rounded-full ${level === 'warn' ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
```

and define `label` next to `description`:

```tsx
const label = `${usedTokens === null ? '—' : formatTokenCount(usedTokens)} / ${formatTokenCount(maxTokens)} tokens`;
```

In `composer.tsx` accept `contextMeter = null` and change the hint row to:

```tsx
<div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-xs text-fg-subtle">
  <p id={hintId}>Enter to send · Shift+Enter for a new line</p>
  <div className="flex items-center gap-3">
    {text.length > COUNTER_THRESHOLD ? (
      <p aria-live="polite">
        {text.length} / {MAX_CHARS}
      </p>
    ) : null}
    {contextMeter}
  </div>
</div>
```

In `chat-page.tsx` (import `ContextMeter`):

```tsx
const activeModelInfo =
  modelList.find((model) => model.name === activeModel) ?? null;
const chatContext =
  chatPending?.context ?? chat.data?.pages[0]?.context ?? null;
```

and pass to `Composer`:

```tsx
            contextMeter={
              <ContextMeter
                usedTokens={chatId ? (chatContext?.usedTokens ?? null) : null}
                maxTokens={activeModelInfo?.maxContext ?? null}
              />
            }
```

- [ ] **Step 4: Run the checks**

Run: `pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): show context usage next to the composer"
```

---

### Task 10: "Earlier messages summarized" divider

**Files:**

- Modify: `apps/web/src/features/chat/chat.types.ts`, `message-list.tsx`, `chat-page.tsx`
- Test: `apps/web/src/features/chat/message-list.test.tsx`

**Interfaces:**

- Consumes: `ChatContext.summary`, `ChatContext.summarizedThroughMessageId`.
- Produces: `MessageListProps.summary?: string | null`, `MessageListProps.summarizedThroughMessageId?: string | null`.

- [ ] **Step 1: Write the failing test**

In `message-list.test.tsx`:

```tsx
it('marks where the summarized part of the conversation ends', async () => {
  const user = userEvent.setup();
  renderList({
    messages: [
      makeMessage({ id: 'u1', content: 'Old question' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'Old answer' }),
      makeMessage({ id: 'u2', content: 'New question' }),
    ],
    summary: 'The user asked an old question.',
    summarizedThroughMessageId: 'a1',
  });

  const divider = screen.getByText('Earlier messages summarized');
  const items = screen.getAllByRole('listitem');
  const dividerIndex = items.findIndex((item) => item.contains(divider));
  expect(items[dividerIndex - 1]).toHaveTextContent('Old answer');
  expect(items[dividerIndex + 1]).toHaveTextContent('New question');

  expect(screen.getByText('The user asked an old question.')).not.toBeVisible();
  await user.click(divider);
  expect(screen.getByText('The user asked an old question.')).toBeVisible();
});
```

(Use the file's existing render helper and imports; add `userEvent` and `makeMessage` imports if they are missing. If this jsdom version does not toggle `<details>` on a `summary` click, replace the click + last assertion with `divider.closest('details')!.open = true;` followed by the same `toBeVisible()` assertion. The closed-state assertion must stay.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @js-rag-stack/web test -- message-list`
Expected: FAIL. The divider text is not found.

- [ ] **Step 3: Implement**

In `chat.types.ts` add to `MessageListProps`:

```ts
  summary?: string | null;
  summarizedThroughMessageId?: string | null;
```

In `message-list.tsx` import `Fragment` from react and add:

```tsx
function SummaryDivider({ summary }: { summary: string }) {
  return (
    <li>
      <details className="group/summary text-center text-xs text-fg-subtle">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1 select-none hover:text-fg">
          <span aria-hidden="true" className="h-px w-10 bg-border" />
          Earlier messages summarized
          <span aria-hidden="true" className="h-px w-10 bg-border" />
        </summary>
        <p className="mx-auto mt-2 max-w-2xl rounded-lg bg-surface-2 px-4 py-3 text-left text-sm leading-6 whitespace-pre-wrap text-fg-muted">
          {summary}
        </p>
      </details>
    </li>
  );
}
```

In `MessageList` destructure `summary = null, summarizedThroughMessageId = null` and change the server message map to:

```tsx
{
  serverMessages.map((message) => (
    <Fragment key={message.id}>
      {message.role === 'user' ? (
        <UserMessage id={message.id} content={message.content} />
      ) : (
        <AssistantMessage
          content={message.content}
          streaming={false}
          status={message.status}
          details={describeTokens(message)}
        />
      )}
      {summary && message.id === summarizedThroughMessageId ? (
        <SummaryDivider summary={summary} />
      ) : null}
    </Fragment>
  ));
}
```

In `chat-page.tsx` pass to `MessageList`:

```tsx
              summary={chatContext?.summary ?? null}
              summarizedThroughMessageId={
                chatContext?.summarizedThroughMessageId ?? null
              }
```

- [ ] **Step 4: Run the checks**

Run: `pnpm --filter @js-rag-stack/web typecheck && pnpm --filter @js-rag-stack/web lint && pnpm --filter @js-rag-stack/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): show where earlier messages were summarized"
```

---

### Task 11: Full verification and manual end-to-end check

**Files:** none new (fix only what verification surfaces).

- [ ] **Step 1: Run the CI suite locally**

Run: `pnpm format:write && pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check`
Expected: all PASS. If `openapi:check` reports a stale snapshot, run `pnpm openapi:generate` and commit it.

- [ ] **Step 2: Manual end-to-end with a tiny context**

```bash
psql postgresql://postgres:postgres@localhost:5432/js_rag_stack -c \
  "UPDATE model SET max_context = 1024 WHERE name = 'qwen2.5:1.5b';"
pnpm dev
```

In the browser (http://localhost:5173): start a chat, tell the model a fact ("My cat is called Miso"), then send 5–6 long prompts (paste ~1500 characters each). Expected:

- the meter under the composer reads `… / 1k tokens` and turns amber as it fills;
- on an over-budget turn the reply area first shows `Summarizing earlier messages…`;
- after that reply, an `Earlier messages summarized` divider appears; expanding it shows a summary that mentions Miso;
- asking "What is my cat called?" is answered correctly;
- the API log shows no Ollama errors; `SELECT * FROM conversation_summary;` has one row for the chat.

Restore: `UPDATE model SET max_context = 8192 WHERE name = 'qwen2.5:1.5b';`

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: verification fixes for context window summarization"
```

(Skip if nothing changed. Do **not** push.)
