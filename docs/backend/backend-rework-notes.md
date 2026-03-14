# Backend Rework Notes

This repository now contains clear runtime surfaces:

1. `apps/web/` (existing Next.js app): frontend and legacy lightweight API routes.
2. `apps/api/` (Fastify backend): dedicated product backend for project execution + AI agent workflows.
3. `apps/worker/` (BullMQ worker): async queue processing.

## Stage 1 migration approach

- Keep Next.js routes for lead capture/auth shell until cutover is complete.
- Move product APIs to `apps/api/src/routes/v1`.
- Use Postgres via `packages/db` and migrate schema with `npm run db:migrate`.
- Use Redis queue with BullMQ for async orchestration.
- Keep infrastructure minimal in `infrastructure/terraform`.

## Immediate next milestones

- Expand worker handlers for transcript processing lifecycle.
- Add connector auth flows (Slack/Google).
- Add integration and end-to-end tests against local Postgres/Redis.
- Expand Terraform and managed AWS components in Stage 2.
