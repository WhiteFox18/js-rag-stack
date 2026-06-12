# Local LLM Chat

A local-first chat application built as a pnpm and Turborepo monorepo. The
current backend includes PostgreSQL/Redis persistence, anonymous ownership,
and cookie-based authentication with rotating device sessions.

## Prerequisites

- Node.js 24 or newer
- pnpm 10 or newer
- PostgreSQL available at `localhost:5432`
- Redis available at `localhost:6379`

The default development configuration uses a PostgreSQL database named
`js_rag_stack`. Ollama is introduced in Phase 4.

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
```

## Workspace layout

- `apps/api`: NestJS HTTP API
- `apps/web`: React SPA
- `packages/contracts`: framework-neutral transport types
- `packages/api-client`: generated-client placeholder for Phase 4
- `packages/eslint-config`: shared ESLint flat configuration
- `packages/typescript-config`: shared TypeScript configuration
