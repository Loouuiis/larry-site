# Backend Rework Notes

This repository now contains clear runtime surfaces:

1. `apps/web/` (existing Next.js app): frontend and legacy lightweight API routes.
2. `apps/api/` (Fastify backend): dedicated product backend for project execution + AI agent workflows.
3. `apps/worker/` (BullMQ worker): async queue processing.

## Re-baseline (2026-03-16)

- Larry v1 is a standalone PM platform.
- Larry Workspace is the system of record.
- Slack, Email, and Calendar are connector channels around the core workspace.
- External PM platform integrations (Jira/Asana/ClickUp) are post-v1 optional.
- Detailed execution sequencing: `docs/backend/v1-execution-plan.md`.

## Stage 1 migration approach

- Keep Next.js routes for lead capture/auth shell until cutover is complete.
- Move product APIs to `apps/api/src/routes/v1` with workspace domain first.
- Use Postgres via `packages/db` and migrate schema with `npm run db:migrate`.
- Use Redis queue with BullMQ for async orchestration.
- Keep infrastructure minimal in `infrastructure/terraform`.

## Immediate next milestones

1. Complete connector reliability for v1 channels:
   - Slack event ingestion hardening
   - Google Calendar OAuth/watch/webhook end-to-end
   - Email ingestion auth + event mapping
2. Finish workspace-core backend surface:
   - Project/task/dependency lifecycle parity
   - Approval and audit guarantees on all meaningful mutations
3. Tighten end-to-end pipeline tests:
   - channel event -> canonical event -> agent run -> action -> approval/execute -> audit trail
4. Keep Terraform minimal in Stage 1; defer full AWS expansion to Stage 2.
