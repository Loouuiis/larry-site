# Larry — Product Overview

## What Larry Is

**"The autonomous execution layer for project management."**

Larry makes projects run themselves by aligning stakeholders, timelines, and work through autonomous execution — so teams can focus on outcomes instead of manual coordination.

Larry v1 is a **standalone PM platform**. Larry Workspace is the system of record. Slack, Email, and Calendar are channel connectors that feed signals into Larry — not the core data model. External PM tools (Jira/Asana/ClickUp) are explicitly post-v1.

## The Problem Being Solved

Critical project information is fragmented across tools and people. PMs spend significant time chasing updates, aligning stakeholders, and manually coordinating — rather than delivering outcomes.

Key stats: 70% of projects fail to deliver on their promise. Organisations waste $101M per $1B spent. 70% of employees lose 20h/week to inefficient processes.

## V1 Product Surface

1. **Larry Workspace** — Tenancy, RBAC, projects, tasks, dependencies, status/risk, approvals, audit, Action Centre.
2. **Channel Connectors** — Slack (live), Google Calendar (live), Email (post-v1 inbound OAuth).
3. **AI Agent Layer** — Canonical event normalisation, action extraction, policy-gated proposals, approval/correction loop, traceability.

## The Demo North Star

1. Paste a meeting transcript into Larry
2. Larry extracts tasks and proposes a project structure
3. Action Centre shows extracted actions with source context and reasoning
4. Approve → project appears in workspace with tasks, Gantt, health view
5. Every technical decision must serve this execution loop

## Core Philosophy

- **Approval-gated autonomy first.** High-impact or low-confidence actions always require human approval before execution.
- **Explainability.** Every AI action must show: what happened, why, what signals were used, and how to override.
- **Reversible and editable.** Every AI action must be correctable in one click.
- **Execution, not just tracking.** Larry owns the full coordination loop end-to-end — not just surfacing information.

## AI Decision Framework

**Auto-approved (no approval needed):** reminder nudges, standup/weekly summaries, risk flags, reversible status updates (confidence ≥ 0.75).

**Human approval required (Action Centre):** deadline changes, ownership changes, scope changes, escalation drafts, external commitments, any action with confidence < 0.75.

See `docs/AI-AGENT.md` for the full policy matrix.

## Ideal Customer Profile

- Project-based, cross-functional teams in fast-moving companies
- 50–2,000 employees, mid-market
- Industries: Tech/SaaS, Financial Services, Manufacturing, Consulting, Telecoms
- Personas: PMs, Director of Projects, Operations Lead, Head of IT

## Team

| Person | Role |
|--------|------|
| Anna Wigren | Co-founder, vision/strategy, product/design |
| Louis Desbonnet | Co-founder, technical bridge, sales |
| Fergus OReilly | Backend/fullstack lead |
| Joel | Backend engineer |
| Anton | Frontend engineer |

## Where to Go Next

| Topic | File |
|-------|------|
| Monorepo structure & stack | `docs/ARCHITECTURE.md` |
| API routes & backend conventions | `docs/BACKEND-API.md` |
| Worker & agent lifecycle | `docs/BACKEND-WORKER.md` |
| AI extraction & policy engine | `docs/AI-AGENT.md` |
| Slack / Calendar / Email connectors | `docs/CONNECTORS.md` |
| Frontend & workspace UI | `docs/FRONTEND.md` |
| Auth, sessions & security | `docs/AUTH-SECURITY.md` |
| Database schema & migrations | `docs/DATABASE.md` |
| V1 scope decisions | `docs/V1-SCOPE.md` |
| Active sprint plan | `docs/SPRINT-4DAY.md` |
| Deployment (Vercel + Railway) | `DEPLOYMENT.md` |
| Running locally | `running_locally.md` |
