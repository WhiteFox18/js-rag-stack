# Local LLM Chat

A local-first chat application built as a pnpm and Turborepo monorepo. The
current backend includes PostgreSQL/Redis persistence, anonymous ownership,
and cookie-based authentication with rotating device sessions.

## Prerequisites

- Node.js 24 or newer
- pnpm 10 or newer
- PostgreSQL available at `localhost:5432`
- Redis available at `localhost:6379`
- Ollama available at `127.0.0.1:11434`
- The configured model installed locally, by default:

  ```bash
  ollama pull qwen2.5:1.5b
  ```

The default development configuration uses a PostgreSQL database named
`js_rag_stack` and only exposes Ollama models listed in
`OLLAMA_ALLOWED_MODELS`.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

The frontend runs at <http://localhost:5173>. The API health endpoint is at
<http://localhost:3000/api/v1/health>. In development, Swagger UI is available
at <http://localhost:3000/docs> and OpenAPI JSON at
<http://localhost:3000/docs-json>.

## Authentication

Authentication uses separate HttpOnly access and refresh cookies. Before any
`POST`, `PATCH`, or `DELETE`, request `GET /api/v1/auth/csrf` with credentials
enabled, then send the returned token in the `X-CSRF-Token` header. Browser
mutations must also carry the configured `WEB_ORIGIN` Origin header.

Available auth routes cover sign-up, sign-in, refresh, sign-out, sign-out-all,
the current user, device-session listing, and individual session revocation.

## Chat API

- `GET /api/v1/models` returns the intersection of installed and allowed Ollama models.
- `POST /api/v1/chats` creates an anonymous or authenticated chat.
- `GET /api/v1/chats` and `GET /api/v1/chats/:chatId` return cursor-paginated history.
- `PATCH /api/v1/chats/:chatId` renames, archives, or changes the future model.
- `DELETE /api/v1/chats/:chatId` removes an owned chat and invalidates its cache.
- `POST /api/v1/chats/:chatId/messages/stream` returns named SSE events over a streamed `fetch` response.

The stream emits `stream.started`, `message.delta`, `message.completed`,
`stream.cancelled`, and `stream.error`. Browser cancellation is propagated to
Ollama and partial assistant text is persisted as cancelled. Redis remains a
cache; PostgreSQL is authoritative for every message lifecycle transition.

In development, Swagger UI at <http://localhost:3000/docs> automatically
includes authentication cookies and obtains a CSRF token before mutation
requests. Sign-up, sign-in, refresh, sign-out, and session revocation can be
tested directly with **Try it out** without manually configuring headers.

## Quality commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
```

Run `pnpm openapi:generate` after changing controllers or DTOs. The generated
snapshot is committed at `packages/api-client/openapi.json`; CI fails when it
is stale. `@js-rag-stack/api-client` provides typed REST methods and an SSE
parser for the SPA.

## Workspace layout

- `apps/api`: NestJS HTTP API
- `apps/web`: React SPA
- `packages/contracts`: framework-neutral transport types
- `packages/api-client`: generated-client placeholder for Phase 4
- `packages/eslint-config`: shared ESLint flat configuration
- `packages/typescript-config`: shared TypeScript configuration
