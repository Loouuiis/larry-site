# V1 Execution Plan (Standalone-First)

## Objective

Ship a demo-ready Larry v1 where Larry Workspace is the PM source of truth, with Slack/Email/Calendar feeding and consuming workflow signals.

## Workstreams

1. Workspace Core
   - Multi-tenant project execution backend and auditability.
2. Agent and Automation
   - Event normalization, extraction, policy gating, approvals, and verification.
3. Channel Connectors
   - Slack, Email, Calendar ingestion and controlled action outputs.
4. Reliability and Pilot Ops
   - E2E tests, runbooks, KPI instrumentation, and production hardening.

## Sprint Plan (8 Sprints, 2 Weeks Each)

### Sprint 1-2

Build:
- Lock workspace domain contracts (projects/tasks/dependencies/comments/activity).
- Add missing mutation audit coverage in API routes.
- Complete Google Calendar live OAuth/watch/webhook validation.

Founder/Product:
- Finalize canonical terminology (status/risk/escalation windows).
- Confirm KPI definitions and acceptance thresholds.

Exit:
- Workspace API contracts frozen for pilot.
- Calendar connector working live in dev.

### Sprint 3-4

Build:
- Implement email connector ingestion path into canonical events.
- Add worker replay tooling and richer failure classification.
- Tighten policy engine outputs with explicit reasons and impact tags.

Founder/Product:
- Provide pilot mailboxes and usage examples.
- Review extracted action quality on real artifacts.

Exit:
- Slack + Calendar + Email all produce canonical events and agent runs.

### Sprint 5-6

Build:
- Harden action lifecycle: pending -> approve/reject/override -> executed/verified.
- Add reporting endpoints for weekly summary and health/risk snapshots.
- Add integration test suite covering full channel-to-action workflow.

Founder/Product:
- Validate summary outputs for PM and executive readability.
- Define escalation copy and operational governance.

Exit:
- End-to-end tests green for core user journeys.

### Sprint 7-8

Build:
- Security/compliance minimums: retention/delete flows, access review evidence, incident logging shape.
- Perf baseline and queue backpressure checks at pilot load.
- Production rollout checklist and rollback plan.

Founder/Product:
- Operate pilot cadence and collect measurable ROI metrics weekly.
- Produce customer-facing trust narrative from audit/control capabilities.

Exit:
- Pilot-ready backend with measurable KPIs and operational controls.

## Definition of Done for V1

1. Workspace-first project execution works without external PM tools.
2. Slack/Email/Calendar are integrated as channels.
3. Agent actions are confidence-gated and approval-audited.
4. Weekly summaries and risk views are generated from workspace data.
5. Critical E2E and reliability checks pass consistently.

## Immediate Next 5 Tasks (Do First)

1. Finish Google Calendar live validation in dev (OAuth callback, watch registration, webhook receipt).
2. Implement email connector auth + webhook ingestion skeleton in `apps/api`.
3. Add email canonical normalization and worker handling path.
4. Add one E2E test that proves channel event -> pending action -> approval -> verified run.
5. Add a pilot metrics table/model for hours saved and follow-up reduction.

## Deferred by Design

- Jira/Asana/ClickUp bi-directional sync.
- Full Stage 2 AWS managed infrastructure rollout.
- Multi-region active-active and dedicated tenant deployment models.

