# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspaces monorepo.
- `apps/web`: Next.js frontend (UI, middleware, Playwright specs in `apps/web/tests`).
- `apps/api`: Fastify API (`src/` for runtime code, `tests/` for route/integration tests).
- `apps/worker`: BullMQ background worker.
- `packages/shared`, `packages/db`, `packages/config`, `packages/ai`: shared types, DB layer/migrations, env config, and AI logic.
- `docs/` and `infrastructure/terraform/`: architecture/security docs and infra definitions.

## Build, Test, and Development Commands
Run from repo root (`larry-site/`).
- `docker compose up -d`: start local Postgres + Redis.
- `npm install`: install all workspace dependencies.
- `npm run web:dev`: start frontend on `localhost:3000`.
- `npm run api:dev`: build internal packages, migrate/seed DB, start API on `localhost:8080`.
- `npm run worker:dev`: run background jobs processor.
- `npm run api:build` / `npm run worker:build` / `npm run web:build`: production builds.
- `npm run api:test` / `npm run worker:test` and `npm run test -w @larry/web`: run Vitest suites.
- `npm run test:e2e -w @larry/web`: run Playwright end-to-end tests.

## Coding Style & Naming Conventions
- Language: TypeScript ESM with `strict: true` across apps/packages.
- Formatting style in codebase: 2-space indentation, semicolons, double quotes.
- Use clear, feature-oriented names (for example `project-archive-routes.test.ts`).
- Keep shared contracts in `packages/shared`; avoid duplicating API/domain types in apps.
- Lint frontend with `npm run web:lint` (ESLint + Next.js config).

## Testing Guidelines
- Frameworks: Vitest for unit/integration, Playwright for web E2E.
- Test file patterns: `*.test.ts`, `*.test.tsx`, and `*.spec.ts`.
- API tests belong in `apps/api/tests`; web unit tests in `apps/web/src`; shared package tests in each package `src/`.
- No global coverage gate is enforced; add tests for new endpoints, worker flows, and regressions before opening a PR.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`.
- Keep commits focused; avoid mixing refactors with behavior changes.
- PRs should include: concise summary, affected workspaces (`apps/api`, `apps/web`, etc.), test evidence (commands run), and screenshots/GIFs for UI changes.
- Link related issues/plans/docs when applicable (for example files under `docs/` or `plans/`).
