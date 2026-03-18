# Stage 1 Architecture

## Scope baseline

- Larry Workspace is the source of truth for projects/tasks/dependencies/risk.
- Slack, Email, and Calendar are connector inputs/outputs around that workspace.
- External PM tools are intentionally out of v1 scope.

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

## Domain model direction

- Core entities live in Larry-managed tables: tenants, users, memberships, projects, tasks, dependencies, comments, approvals, audit entries.
- Connector data is normalized into canonical events with provenance and linked back to agent runs.
- Agent actions are gated by confidence and policy before mutating workspace records.

## Local dev

- `docker-compose.yml` starts Postgres + Redis
- API publishes jobs into `larry-events` queue
- Worker consumes queue jobs and processes async tasks

## Stage 2 migration path

- Replace Postgres host with RDS endpoint
- Replace Redis host with ElastiCache endpoint
- Optionally bridge or swap queue patterns for SQS where needed

This keeps code changes minimal while scaling infrastructure.
