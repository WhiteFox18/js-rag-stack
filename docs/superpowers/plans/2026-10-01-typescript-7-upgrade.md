# TypeScript 7 Upgrade Plan

**Goal:** Move the monorepo from TypeScript 6.0.3 to TypeScript 7.0.2 (latest stable, the native/Go compiler) for all `tsc` type-checking and emit, while keeping every CI step green.

**Out of scope:** Prisma upgrade (Prisma 8 has no released `@prisma/client` / `@prisma/adapter-pg`; deferred). NestJS 12 migration. Unrelated dependency bumps.

## Key facts (verified on npm, 2026-10-01)

- `typescript@7.0.2` ships the `tsc` binary but **no classic JS API**: its `exports` only contain `./lib/version.cjs` and `./unstable/*`. Anything doing `require('typescript')` and calling `ts.createProgram` etc. breaks.
- `@typescript/typescript6@6.0.2` is the official companion: provides `tsc6` and re-exports the TS 6 API.
- Consumers of the TS JS API in this repo:
  - `typescript-eslint@8.x` (typed linting via `projectService` in `packages/eslint-config/index.js`). Latest 8.71.0 peer: `typescript >=4.8.4 <6.1.0`. **Must keep resolving TS 6.**
  - `@nestjs/cli` (`nest build`, `nest start --watch` in `apps/api`). 11.0.23 resolves `typescript` from the project. Note that `@nestjs/cli@12` has its own `typescript ~6.0.2` dependency, but bumping the CLI to 12 is not required.
- Non-consumers: Vite/Vitest (oxc/esbuild), Jest (`@swc/jest`), Prisma generate. These are unaffected.

## Strategy

`typescript` → `7.0.2` everywhere it's declared, so `tsc` / `tsc -b` / `tsc --noEmit` in every package run TS 7.
Tools needing the JS API get TS 6 via pnpm config, without changing their source:

- Preferred: in root `package.json` add `pnpm.packageExtensions` and/or `pnpm.overrides` so that the `typescript` dependency **as seen by** `typescript-eslint`, `@typescript-eslint/*` and `@nestjs/cli` resolves to `npm:typescript@6.0.3`. For example, `"overrides": { "@typescript-eslint/typescript-estree>typescript": "npm:typescript@6.0.3", ... }`. Peer deps may need `packageExtensions` + `peerDependencyRules` rather than overrides. Find the mechanism that actually works and verify with `pnpm why typescript` and a runtime check (see Task 3).
- Do not hand-edit `node_modules`. Do not add `postinstall` hacks.

## Tasks

### Task 0: Setup

- `pnpm` is not on PATH in this shell. Use `npx -y pnpm@10.24.0 <args>` (or the shim the orchestrator provides) for every pnpm command.
- Create branch `chore/typescript-7` from `main`. **Do not push.**

### Task 1: Bump TypeScript declarations

- Change `"typescript": "6.0.3"` → `"7.0.2"` in: root `package.json`, `apps/api`, `apps/web`, `packages/contracts`, `packages/api-client`.
- `pnpm install`. Confirm `npx tsc -v` prints `Version 7.0.2` from root and from each package dir.

### Task 2: Fix tsconfig / type errors under TS 7

- Run `pnpm typecheck` and `pnpm build`. TS 7 turns TS 6 deprecations into hard errors and drops some options. Fix configs in `packages/typescript-config/*.json` and per-package tsconfigs **minimally**. Review `experimentalDecorators` / `emitDecoratorMetadata` (NestJS needs decorator metadata in the emitted output), `esModuleInterop`, `moduleResolution`, `allowImportingTsExtensions`, `composite`/`tsBuildInfoFile` for `tsc -b` in `apps/web`.
- If TS 7 can't do something required (e.g. decorator metadata emit for Nest), keep that **emit** path on TS 6 (e.g. `nest build` using TS 6) and use TS 7 for `--noEmit` type-checking. Document the decision in the final report.
- Fix real type errors in source only if TS 7 flags them. Don't use `any`, `@ts-ignore` or `@ts-expect-error` to silence them.

### Task 3: Keep API consumers on TS 6

- Apply the pnpm resolution strategy above.
- Verify:
  - `pnpm why typescript` shows 7.0.2 for workspace packages and 6.0.3 under typescript-eslint and `@nestjs/cli`.
  - From `packages/eslint-config`: `node -e "console.log(require(require.resolve('typescript',{paths:[require.resolve('@typescript-eslint/typescript-estree')]})).version)"` prints `6.0.3`. Adapt the path for ESM/exports if needed. The point is to prove which TS the linter loads.
  - `pnpm lint` passes with **no new warnings**. The baseline has exactly 1 warning: react-refresh in web.
- `nest build` must still emit `dist/` with working decorator metadata. `pnpm openapi:check` is the proof.

### Task 4: Full CI verification

Run each, all must exit 0:

```
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm typecheck
pnpm test        # baseline: api 59 passed; web 20 files passed (local Postgres + Redis are running)
pnpm build
pnpm openapi:check
```

- If `pnpm format` fails because of edited files, run `pnpm format:write` on those files only.
- `apps/api` `dev` (`nest start --watch`): start it, confirm it boots past compilation (it may fail later on missing services; that's fine), then kill it.

### Task 5: Commit

- Commit on `chore/typescript-7` with a conventional message, e.g. `chore: upgrade TypeScript to 7.0.2`. The lockfile must be included. **Do not push.**

## Final report (from executor)

- Files changed and why.
- Exact mechanism used to pin TS 6 for API consumers, plus `pnpm why typescript` output.
- Any place TS 7 couldn't be used and why.
- Output summary of each Task 4 command.
