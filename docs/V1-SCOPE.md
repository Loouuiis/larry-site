# Larry — V1 Scope

## Decision (Locked 2026-03-16)

Larry v1 is a **standalone PM platform**. Larry Workspace is the system of record. Slack, Email, and Calendar are channel connectors around the core workspace. External PM tool integrations (Jira/Asana/ClickUp) are not part of v1.

**Why:** A standalone system of record is harder to replace than a thin workflow layer. End-to-end project graph + human decisions + outcome loops stay in one platform. Value is tied to workspace outcomes.

## What Is In V1

1. **Larry Workspace** — tenancy, RBAC, projects, tasks, dependencies, status/risk, approvals, audit, Action Centre
2. **Channel Presence** — Slack (inbound + action output), Email outbound drafts only, Google Calendar (watch + webhook)
3. **AI Agent Layer** — canonical event normalisation, action extraction/proposal via canonical Larry runtime, policy-gated routing, traceability
4. **Reporting** — weekly summaries, health/risk views, outcome snapshots

## What Is Out of V1

| Feature | Post-v1 Issue |
|---------|--------------|
| Live inbound email OAuth | #14, #15 |
| Voice input | #26 |
| PDF/PPT export | #23, #29 |
| External content import (4th project-start mode) | #28 |
| Jira/Asana/ClickUp bi-directional sync | — |
| Manager escalation hierarchy | #19 |
| Risk scoring owner behaviour signals | #18 |
| Dependency completion notifications | #16 |
| Task comment thread UI | #25 |
| Mobile/responsive layout | #27 |
| Audit log coverage review | #31 |
| Multi-region / dedicated tenant deployments | — |
| Temporal/event streaming migration | — |

## 4 Delivery Tracks

**Track A — Workspace Core**
- Close schema/API gaps for project execution primitives
- Enforce auth + audit on all high-value mutations
- Add reporting views for PM and executive personas

**Track B — Connector Completion**
- Harden Slack connector and signal mapping
- Complete Google Calendar OAuth/watch/webhook reliability
- Email: outbound drafts only for v1 — inbound is post-v1

**Track C — Agent Reliability**
- Strengthen extraction quality and confidence routing
- Ensure approval loop closure and explainability surfaces
- Add replay/debug tooling for failed runs

**Track D — Pilot Readiness**
- E2E tests: channel → action → approval → verification
- Operational runbooks, retention/deletion basics, audit evidence
- KPI instrumentation: hours saved, follow-up reduction, action latency

## V1 Exit Criteria

1. Larry Workspace can run a real project without external PM tooling
2. Slack + Calendar signals feed the canonical event and agent pipeline
3. High-impact actions are approval-gated and auditable
4. Weekly summaries and risk signals are generated from workspace data
5. End-to-end happy path and failure path tests pass in local/dev

## Current Progress Snapshot (as of 2026-03-30)

- Foundation and scaffolding: complete
- Slack: connected, OAuth + event ingestion working; Slack events onboarded on canonical ledger path
- Google Calendar: OAuth + watch + webhook working; renewal token fix applied; calendar events onboarded on canonical ledger path
- Email: outbound drafts only; inbound OAuth not implemented; email events onboarded on canonical ledger path
- Canonical Larry runtime: active — `larry_events`, `larry_conversations`, `larry_messages` are the live data model
- Legacy extraction pipeline retired: `agent_runs`, `extracted_actions`, `approval_decisions`, `interventions`, `agent_run_transitions` tables dropped in production (Phase 2.7 retirement window executed 2026-03-30)
- Action Centre: canonical accept/dismiss on `larry_events`; project and global surfaces use shared ledger contract
- Project memory starter: `project_memory_entries` schema, canonical `GET /v1/larry/memory`, and active project context timeline slot with source filtering
- Worker lifecycle: `canonical_event.created` drives transcript, email, Slack, and calendar intelligence and ledger writes
- Workspace surface: active product runs entirely under `/workspace/*`; legacy `/dashboard` redirects to workspace
- Auth: functional but rate limiting + token revocation needed before launch
- E2E tests: Playwright smoke coverage for project chat → linked action → accept, transcript → action-centre, global dismiss parity, and background refresh

## Companion Docs

- Architecture: `docs/ARCHITECTURE.md`
- AI agent runtime: `docs/AI-AGENT.md`
- Backend API: `docs/BACKEND-API.md`
- Database schema: `docs/DATABASE.md`
- Frontend structure: `docs/FRONTEND.md`
