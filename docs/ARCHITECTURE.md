# Larry - Architecture

## Monorepo Layout

```text
larry-site/
|-- apps/
|   |-- api/       Fastify REST API
|   |-- web/       Next.js app
|   `-- worker/    BullMQ consumer
|-- packages/
|   |-- ai/        Intelligence runtime
|   |-- db/        Postgres schema/client/migrations
|   |-- shared/    Shared queue and domain contracts
|   `-- config/    Env parsing and validation
|-- docs/
|-- infrastructure/
`-- scripts/
```

## Runtime Stack

| Layer | Technology |
|-------|------------|
| Database | Postgres |
| Queue | BullMQ + Redis |
| AI | Provider abstraction in `packages/ai` |
| API | Fastify |
| Worker | BullMQ worker |
| Web | Next.js App Router |

## Canonical Runtime Model

- API and worker operate on canonical `larry_events`, `larry_conversations`, and `larry_messages` for active Larry behavior.
- Source ingest flows through `canonical_events` and emits `canonical_event.created` jobs.
- Action-centre reads use `GET /v1/larry/action-centre`.
- Chat/transcript runtime writes use `POST /v1/larry/chat` and `POST /v1/larry/transcript`.

## Key Entry Points

| Service | File |
|---------|------|
| API server | `apps/api/src/server.ts` |
| API route registration | `apps/api/src/routes/v1/index.ts` |
| Worker entry | `apps/worker/src/worker.ts` |
| Canonical event handler | `apps/worker/src/canonical-event.ts` |
| DB schema | `packages/db/src/schema.sql` |
| Queue publish | `apps/api/src/services/queue.ts` |

## Environment Files

| Service | File |
|---------|------|
| Web | `apps/web/.env` |
| API | `apps/api/.env` |
| Worker | `apps/worker/.env` |

## Scheduled Jobs

| Job Name | Interval | Description |
|----------|----------|-------------|
| `larry.scan` | Every 30 minutes | Intelligence scan across all active projects |
| `escalation.scan` | Every 60 minutes | Escalation notification sweep |
| `calendar.webhook.renew` | Every 5 days | Renew Google Calendar watch channels before expiry |

All repeatable jobs use stable `jobId` values to prevent duplicate schedule entries on worker restart.

Critical invariant: API and Worker must share the same `DATABASE_URL` or action-centre data will drift.
