# Backend Rework Notes

This repository now contains two runtime surfaces:

1. `frontend/src/` (existing Next.js app): frontend and legacy lightweight API routes.
2. `backend/` (new Fastify backend): dedicated enterprise backend for project execution + AI agent workflows.

## Migration approach

- Keep Next.js routes for lead capture/auth shell until cutover is complete.
- Move product APIs to `backend/src/routes/v1` and start integrating frontend with dedicated backend.
- Migrate data from Turso tables into Postgres tables in `backend/src/db/schema.sql`.
- Introduce infrastructure through `backend/infra/terraform` and deploy API independently.

## Immediate next implementation milestones

- Add worker process for async queue consumption (`agent_run.ingested` jobs).
- Add connector auth flows for Slack/Google integrations.
- Add contract/integration tests with Postgres test container.
- Add production secrets + IaC state backend + network hardening.
