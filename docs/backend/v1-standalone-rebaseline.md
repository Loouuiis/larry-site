# V1 Standalone Rebaseline (Locked 2026-03-16)

## Decision Summary

- Larry v1 is a standalone PM platform.
- Larry Workspace is the system of record for execution data.
- Slack, Email, and Calendar are supported channels/connectors around Larry Workspace.
- External PM tool integrations (Jira/Asana/ClickUp) are not part of v1 and are deferred.

## Why This Business Model

- Defensibility: a standalone system of record is harder to replace than a thin workflow layer.
- Product control: Larry can ship AI-native primitives directly in core workflows.
- Data advantage: end-to-end project graph + human decisions + outcome loops stay in one platform.
- Monetization clarity: value is tied to workspace outcomes, not connector convenience.

## V1 Product Surface

1. Larry Workspace (core)
   - Tenancy, membership, RBAC.
   - Projects, tasks, dependencies, status/risk, approvals, audit.
   - Action Center with human-in-the-loop controls.
2. Channel Presence
   - Slack: inbound event ingestion + action workflows.
   - Email: inbound/outbound operational flow (MVP connector contract).
   - Calendar: meeting/event ingestion and scheduling signals.
3. AI Agent Layer
   - Canonical event normalization.
   - Action extraction/proposal.
   - Policy-based gating (auto-execute vs approval).
   - Traceability: run states, decisions, and audit trail.

## Explicitly Out of Scope for V1

- Full two-way sync with Jira/Asana/ClickUp.
- Dedicated tenant deployments and multi-region active-active.
- Temporal/event streaming platform migration.
- Broad autonomous execution without approvals on high-impact actions.

## Architecture Baseline

- Monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/*`.
- Data: Neon Postgres (Stage 1), tenant-scoped isolation and RLS path.
- Queue: BullMQ on Redis for local/dev/prod Stage 1.
- AI: OpenAI-first abstraction in `packages/ai`.
- Infra: Terraform skeleton only in Stage 1; expand in Stage 2 after product stability.

## 6-Month Delivery Track (Re-Baselined)

1. Track A: Workspace Core Completion
   - Close schema/API gaps for project execution primitives.
   - Enforce authorization + audit on all high-value mutations.
   - Add reporting views for PM and executive personas.
2. Track B: Connector Completion for Core Channels
   - Harden Slack connector and signal mapping.
   - Complete Google Calendar OAuth/watch/webhook reliability.
   - Implement email connector path into canonical event stream.
3. Track C: Agent Reliability and Control
   - Strengthen extraction quality and confidence routing.
   - Ensure approval loop closure and explainability surfaces.
   - Add replay/debug tooling for failed runs.
4. Track D: Pilot Readiness
   - End-to-end tests for channel -> action -> approval -> verification.
   - Operational runbooks, retention/deletion basics, audit evidence.
   - KPI instrumentation: hours saved, follow-up reduction, action latency.

## Current Progress Snapshot (as of 2026-03-16)

- Foundation and scaffolding are in place.
- Slack is connected and ingesting into canonical events.
- Worker processes canonical events into agent runs/actions.
- Action approval loop transitions to verified state.
- Google Calendar connector scaffold is implemented but needs full live validation.
- Email connector is still pending.
- Workspace-core APIs exist at scaffold level and require hardening for pilot depth.

## Exit Criteria for V1 Demo-Ready Platform

1. Larry Workspace can run a real project without external PM tooling.
2. Slack + Calendar + Email signals feed the same canonical event and agent pipeline.
3. High-impact actions are approval-gated and auditable.
4. Weekly summaries and risk signals are generated from workspace data.
5. End-to-end happy path and failure path tests pass in local/dev.

## Post-V1 Expansion Options (Business-Driven)

- Optional PM ecosystem connectors for enterprise procurement needs.
- Dedicated tenant deployments and stricter residency options.
- Advanced orchestration/runtime upgrades if workflow volume demands it.

## Companion Execution Plan

- Detailed sprint sequencing lives in `docs/backend/v1-execution-plan.md`.
