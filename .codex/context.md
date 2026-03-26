# Larry — Context Index

Read this file first. Load only the docs relevant to your task.

## What Is Larry

"The autonomous execution layer for project management." — Standalone PM workspace with AI-agent execution. See `docs/OVERVIEW.md`.

## Doc Map

| What you're working on | Read |
|------------------------|------|
| Understanding the product | `docs/OVERVIEW.md` |
| Monorepo structure, stack, packages, commands | `docs/ARCHITECTURE.md` |
| API routes, backend conventions, approval execution | `docs/BACKEND-API.md` |
| Worker jobs, BullMQ, agent state machine | `docs/BACKEND-WORKER.md` |
| AI extraction, policy engine, confidence, correction | `docs/AI-AGENT.md` |
| Slack / Google Calendar / Email connectors | `docs/CONNECTORS.md` |
| Frontend, workspace UI, design direction | `docs/FRONTEND.md` |
| Auth, JWT, sessions, RBAC, security gaps | `docs/AUTH-SECURITY.md` |
| Database schema, tables, RLS, migrations | `docs/DATABASE.md` |
| V1 scope decisions, what's in/out | `docs/V1-SCOPE.md` |
| Active sprint (sessions 1–12, Mar 25–28 2026) | `docs/SPRINT-4DAY.md` |
| Deployment (Vercel + Railway) | `DEPLOYMENT.md` |
| Running locally | `running_locally.md` |
| MVP readiness report (2026-03-25) | `docs/reports/larry-mvp-readiness-2026-03-25.md` |

## Non-Negotiables (every session)

1. Multi-tenant isolation — all DB queries must include `tenant_id`
2. Audit trail — all high-value mutations write to `audit_log`
3. Approval-gated — high-impact or low-confidence actions stay `pending` until approved
4. Before touching any `.tsx`/`.css`/layout file — invoke `frontend-developer` subagent
5. Read the target file before editing — never edit blind
6. API and Worker must share the same `DATABASE_URL` or actions will be invisible in Action Centre
