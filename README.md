# Local LLM Chat

A local-first chat application built as a pnpm and Turborepo monorepo. Phase 1
provides a NestJS API, a React/Vite frontend, shared configuration packages,
tests, and CI.

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
