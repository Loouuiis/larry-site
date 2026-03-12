# Larry API (Dedicated Backend)

This service is the new backend foundation for enterprise-grade AI-driven project execution.

## What this implements now

- Fastify TypeScript API with `/v1` domain routes
- Multi-tenant data model on Postgres (`tenant_id` + RLS-enabled tables)
- RBAC scaffold (`admin`, `pm`, `member`, `executive`)
- Auth (`/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/me`)
- Project/task/dependency/status APIs
- Ingestion APIs (`slack`, `email`, `calendar`, `transcript`)
- Agent run state machine (`INGESTED -> ... -> VERIFIED`)
- Action Center decisions (approve/reject/override)
- Reporting endpoints (`project health`, `weekly summary`)
- Audit logging with hash-chain style fields (`previous_hash`, `entry_hash`)
- Queue abstraction with SQS-ready publisher and local in-memory fallback
- OpenAI-first provider abstraction with local mock fallback

## Quick start

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

Health checks:

- `GET http://localhost:8080/health`
- `GET http://localhost:8080/ready`

## Database

- Schema file: `src/db/schema.sql`
- Migration runner: `npm run migrate`

## Testing

```bash
cd backend
npm test
```

Current tests cover policy gating, risk scoring, workflow transitions, and event normalization.

## OpenAPI

- Contract starter: `openapi.yaml`

## Infrastructure

Terraform scaffolding is under `infra/terraform` with a `core` module and `dev` environment.

## Notes

- This is an execution-ready foundation, not full production completion.
- SQS publishing uses FIFO semantics when queue URL is configured.
- Refresh tokens are opaque and stored hashed for rotation and revocation support.
- For enterprise readiness, add CI secret scanning, full integration/e2e suites, and staging rollout policies.
