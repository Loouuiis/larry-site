# Larry Monorepo (Stage 1)

## Structure

- `apps/web` - Next.js frontend and current shell routes
- `apps/api` - Fastify backend API
- `apps/worker` - BullMQ worker service
- `packages/db` - Postgres client + schema migration
- `packages/shared` - shared domain/queue types
- `packages/ai` - AI extraction + policy/risk logic
- `packages/config` - shared env validation
- `infrastructure/terraform` - minimal Stage 1 Terraform skeleton
- `docs` - architecture and implementation notes

## Stage 1 stack

- Database: Neon Postgres target (`DATABASE_URL`)
- Queue: BullMQ + Redis (`REDIS_URL`)
- Storage: S3 (to be integrated incrementally)
- Local services: `docker compose` (Postgres + Redis)

## Local quick start

```bash
docker compose up -d
npm install
npm run db:migrate
npm run api:dev
npm run worker:dev
npm run web:dev
```

## Commands (repo root)

- `npm run web:dev`
- `npm run web:build`
- `npm run api:dev`
- `npm run api:build`
- `npm run api:test`
- `npm run worker:dev`
- `npm run worker:build`
- `npm run db:migrate`

## Environment files

- Frontend: `apps/web/.env.local`
- API: `apps/api/.env`
- Worker: `apps/worker/.env`

Templates:
- `apps/web/.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
