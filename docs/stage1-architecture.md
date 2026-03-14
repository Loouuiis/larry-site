# Stage 1 Architecture

## Monorepo layout

- `apps/web`: Next.js application
- `apps/api`: Fastify API service
- `apps/worker`: BullMQ worker service
- `packages/db`: Postgres access + schema migration
- `packages/shared`: domain and queue contracts
- `packages/ai`: model integration and decision helpers
- `packages/config`: environment parsing/validation

## Runtime stack

- Postgres (Neon target)
- Redis + BullMQ
- OpenAI (provider abstraction in `packages/ai`)

## Local dev

- `docker-compose.yml` starts Postgres + Redis
- API publishes jobs into `larry-events` queue
- Worker consumes queue jobs and processes async tasks

## Stage 2 migration path

- Replace Postgres host with RDS endpoint
- Replace Redis host with ElastiCache endpoint
- Optionally bridge or swap queue patterns for SQS where needed

This keeps code changes minimal while scaling infrastructure.
