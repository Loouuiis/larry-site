# Larry Deployment Context

## Overview
Larry is deployed across two platforms:
- **Frontend (`apps/web`)** — Vercel, domain `larry-pm.com`
- **API (`apps/api`) + Worker (`apps/worker`)** — Railway
- **Postgres + Redis** — Railway managed databases

---

## Vercel (Frontend)

### Fixed Issues
- Added `"vercel-build": "npm run build -w @larry/web"` to root `package.json`
- Created `vercel.json` at repo root specifying `outputDirectory: "apps/web/.next"`
- Removed `output: "standalone"` from `apps/web/next.config.ts` (incompatible with Vercel)

### Environment Variables Required
| Variable | Value |
|---|---|
| `LARRY_API_BASE_URL` | Railway API public URL |
| `LARRY_API_TENANT_ID` | `11111111-1111-4111-8111-111111111111` |
| `LARRY_API_EMAIL` | `sarah@larry.local` |
| `LARRY_API_PASSWORD` | `DevPass123!` |
| `SESSION_SECRET` | Random 32+ char string |
| `NEXT_PUBLIC_BASE_URL` | `https://larry-pm.com` |
| `ADMIN_SECRET` | Already set (Mar 7) |

### DNS
- Domain registered/managed via Cloudflare
- `larry-pm.com` A record → `216.198.79.1` (Vercel IP), proxy **disabled**
- `www.larry-pm.com` — Valid Configuration

---

## Railway (API + Worker)

### Project: soothing-contentment / production
Services:
- `larry-site` — API (Fastify, port 8080)
- `diplomatic-vitality` — Worker (BullMQ consumer)
- `Postgres` — managed database
- `Redis` — managed cache/queue

### API Service Settings
- **Dockerfile:** `apps/api/Dockerfile`
- **Build context:** `/` (repo root)
- **Start command:** `sh -c 'cd /app/packages/db && npx tsx src/migrate.ts && cd /app && node apps/api/dist/src/server.js'`

### API Environment Variables
| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference from Postgres service |
| `REDIS_URL` | Reference from Redis service |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `JWT_ACCESS_SECRET` | Generated 32+ char secret |
| `JWT_REFRESH_SECRET` | Generated 32+ char secret (different) |
| `CORS_ORIGINS` | `https://larry-pm.com` |
| `OPENAI_API_KEY` | OpenAI key |
| `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` | Leave unset or `false` for normal deploys; only set `true` for controlled Phase 2.7 retirement work |

### Worker Service Settings
- **Dockerfile:** `apps/worker/Dockerfile`
- **Build context:** `/` (repo root)

### Worker Environment Variables
| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference from Postgres service |
| `REDIS_URL` | Reference from Redis service |
| `NODE_ENV` | `production` |
| `OPENAI_API_KEY` | OpenAI key |

---

## Deployment Fixes Applied (Mar 25 2026)

1. **Vercel build** — Added `vercel-build` script, `vercel.json`, removed `standalone` output
2. **Migration path** — `migrate.ts` uses `process.cwd()` so must run from `packages/db/`. Fixed start command to `cd /app/packages/db` first
3. **API dist path** — TypeScript compiles to `dist/src/server.js` (not `dist/server.js`) due to `rootDir: "."` in tsconfig. Fixed start command accordingly
4. **node_modules resolution** — Simplified both Dockerfiles from multi-stage to single-stage to avoid npm workspace hoisting issues
5. **@fastify/rate-limit version** — Upgraded from `^9.1.0` (Fastify 4.x only) to `^10.0.0` (Fastify 5.x compatible). Root cause of final crash loop

---

## Phase 2.7 Ops Notes

- API deploys should keep `LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT` unset or `false` so startup migrations do not perform Phase 2.7 D/E destructive drops.
- The approved migration-window flow is repo-native and should run in-service:
  - `npm run phase27:rehearsal -- ...`
  - `npm run phase27:retirement-window -- ...`
- The retirement-window runner is read-only by default and only executes A/B/C/D/E when both `--execute` and `--confirm phase-2.7-retirement` are provided.
- The runner requires a target `DATABASE_URL`; it does not auto-load local app `.env` files for live-window execution.
- `railway run` from local workstations is not valid for this workflow when `DATABASE_URL` resolves to `postgres.railway.internal`; use `railway ssh --service larry-site --environment production` and execute the runner inside `/app`.
- API image includes repo `scripts/` so operators can run Phase 2.7 commands in-service via `railway ssh`.
- Set a fresh `BASELINE_TIMESTAMP` immediately after deploy-parity verification, then run precheck and execute against that timestamp.

---

## Seeded Test Credentials
- **Tenant ID:** `11111111-1111-4111-8111-111111111111`
- **Email:** `sarah@larry.local`
- **Password:** `DevPass123!`
