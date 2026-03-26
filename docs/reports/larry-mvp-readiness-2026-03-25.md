# Larry PM MVP Readiness Report

Date: 2026-03-25

## Scope Reviewed

- `larry-site` application code and all tracked Markdown docs
- Local git history and remote repository metadata
- Public GitHub repository pages because `gh` is not installed locally
- `C:\Users\oreil\Downloads\Larry\Larry` archive, including product docs, backlog spreadsheets, and interview notes
- Local verification commands:
  - `npm run api:test`
  - `npm run worker:build`
  - `npm run web:build`

## Executive Summary

Larry is no longer just an idea. The backend foundation is real, the data model is serious, the Action Center is credible, Slack is genuinely integrated, and the monorepo structure is sound. This is a strong demo foundation.

Larry is not yet ready for a high-impact MVP launch under its current product promise.

The biggest gap is not that the repo is empty. The biggest gap is truth alignment:

- The backend is ahead of the frontend.
- The product narrative is ahead of the shipped workflow.
- The launch promise in the docs/archive is broader than what is truly wired end-to-end.

My assessment:

- Demo-ready in parts: yes
- Pilotable with a narrowed and honest scope: close
- Launch-ready as the currently described standalone AI PM with Slack + Email + Calendar + rich project intake: no

If we define MVP narrowly and honestly, I think Larry is about 2 to 4 focused weeks away.

If we hold Larry to the broader promise found across the product docs, archive, and website feedback, I think it is more like 6 to 8 focused weeks away.

Relative to the repo's own execution plan, the codebase feels roughly around the end of Sprint 2 / early Sprint 3, not at the "pilot-ready" exit criteria yet.

## Readiness By Area

| Area | Status | Assessment |
| --- | --- | --- |
| Core backend and data model | Strong | Real schema, real worker, approvals, auditability, and tenant-aware APIs exist. |
| Action Center and approval loop | Strong | One of the most MVP-credible parts of the product. |
| Slack workflow | Medium-strong | Real OAuth, signature verification, ingestion, and action flow exist. |
| Project workspace frontend | Weak | Active project detail views still lean heavily on mock/legacy UI data. |
| New project creation | Weak | Product promise and actual implementation are materially misaligned. |
| Email connector | Weak | Still mock / bridge level, not a real inbound production connector. |
| Calendar connector | Medium | Real scaffold exists, but renewal reliability looks broken. |
| Auth and onboarding | Weak | Backend auth hardening is incomplete and real workspace signup is not in place. |
| Deployment / CI / QA | Medium-weak | Builds pass locally, but launch protection is thin and mostly backend-only. |
| Product / messaging alignment | Weak | Several promised capabilities should not be claimed yet. |

## What Already Exists And Is Valuable

- The monorepo structure is coherent: `apps/web`, `apps/api`, `apps/worker`, `packages/*`.
- The database schema is ambitious and product-shaped, not toy-shaped:
  - tenants, users, memberships, projects, tasks, dependencies
  - approvals, interventions, audit logs, report snapshots, risk snapshots
  - Slack, Google Calendar, email installation tables
  - meeting notes and Larry conversation/message persistence
- Tenant isolation and RLS are present in the schema.
- The worker lifecycle is real:
  - `INGESTED -> NORMALIZED -> EXTRACTED -> PROPOSED -> APPROVAL_PENDING|EXECUTED -> VERIFIED`
- Slack is a real connector, not just mocked UI.
- Larry command ingress exists and can produce pending actions.
- The Action Center is one of the strongest shipped surfaces:
  - approval / reject / correct flows
  - confidence display
  - reasoning display
  - source panel from agent run details
- Workspace snapshot aggregation is real and already pulls together projects, tasks, actions, health, outcomes, connectors, activity, and email drafts.
- Local technical verification is better than expected:
  - `npm run api:test` passed
  - `npm run worker:build` passed
  - `npm run web:build` passed

## What The Market Evidence Says Users Actually Care About

The archive and interview set point to a very consistent value story:

- Turn messy conversations and meetings into structured work
- Reduce follow-up chasing
- Keep status and ownership current without manual admin
- Draft reminders, nudges, and updates
- Produce trustworthy weekly / executive summaries
- Preserve explainability and human approval on meaningful changes

That means a high-impact MVP does not need every shiny feature.

It does need to feel trustworthy, truthful, and operationally useful on a daily basis.

## The Biggest Launch Blockers

### 1. The active project workspace still relies on mock-heavy legacy UI

The home screen is connected to real project data, but the project detail experience is not fully grounded in live workspace state.

Evidence:

- `apps/web/src/app/workspace/WorkspaceHome.tsx` loads real project data from `/api/workspace/snapshot`
- `apps/web/src/app/workspace/projects/[projectId]/ProjectPageClient.tsx` mounts `ProjectWorkspace`
- `apps/web/src/components/dashboard/ProjectWorkspace.tsx` still drives the experience from `WORKSPACE_DATA` and `ORG_DATA`

Impact:

- This makes the most important product surface feel less trustworthy than the backend actually is.
- It undermines the claim that Larry Workspace is already the system of record.

### 2. The "start a project" flow does not match the promised product

Across the archive, Larry is supposed to support four project-start modes:

- manual
- chat with Larry
- meeting-based creation
- external content import

The active UI currently offers only three options, and all three collapse into the same basic `POST /api/workspace/projects` call with only a project name.

Evidence:

- `apps/web/src/components/dashboard/StartProjectFlow.tsx`
  - only defines `manual`, `chat`, and `meeting`
  - does not include external content import
  - sends only `{ name }` to `/api/workspace/projects`
- `apps/web/src/app/api/workspace/projects/route.ts`
  - accepts simple manual project creation payloads

Impact:

- One of the core product promises is currently presentation, not workflow.
- This is a major launch-trust problem.

### 3. Chat-based project creation is only half implemented

Larry can propose a `project_create` action, but approving it does not actually create the project and starter tasks.

Evidence:

- `apps/api/src/routes/v1/larry.ts`
  - creates pending `project_create` actions
- `apps/api/src/routes/v1/actions.ts`
  - approval updates state and audit records
  - outbound execution logic only exists for Slack follow-up / email draft cases
  - no execution path exists for `project_create`

Impact:

- This is a direct break in one of the most important MVP stories:
  - "Tell Larry about a project"
  - "Review in Action Center"
  - "Approve"
  - "Project appears with starter tasks"
- Right now, the approval loop completes without delivering the intended artifact.

### 4. The email connector is not production-real yet

The email connector is still a mock / bridge level implementation.

Evidence:

- `apps/api/src/routes/v1/connectors-email.ts`
  - install URL returns a callback URL with `code=mock-...`
  - callback stores the code as if it were the access token
- repo docs also describe email as pending

Impact:

- If Larry launches while claiming Email as a real channel, users will feel the gap quickly.
- Either this must be finished, or Email must be removed from launch messaging.

### 5. Google Calendar renewal likely breaks webhook auth after renewal

The initial watch registration includes a signed channel token. The renewal job does not send that token. The webhook route rejects missing tokens.

Evidence:

- `apps/api/src/routes/v1/connectors-google-calendar.ts`
  - initial `/watch` request sends `channelToken`
  - webhook rejects missing or invalid `x-goog-channel-token`
- `apps/worker/src/calendar-renewal.ts`
  - renewal watch request sends `id`, `type`, and `address`
  - renewal request does not send any token field

Impact:

- Calendar can appear to work initially and then silently degrade later.
- This is the kind of bug that destroys confidence in pilots.

### 6. Auth and session security are not launch-ready

The auth story has improved, but it still has real launch risks.

Evidence:

- `apps/api/src/routes/v1/auth.ts`
  - `/login` has no route-level rate limit
  - `/logout` only writes an audit log and does not revoke refresh tokens
- `apps/api/src/app.ts`
  - rate limiting is opt-in and configured with in-memory storage
- `apps/web/src/app/api/health/route.ts`
  - returns internal config presence and raw error text
- `apps/web/src/lib/session-secret.ts`
  - contains a hardcoded dev fallback secret

Impact:

- Public auth attack surface is not hard enough for a paying or serious pilot launch.
- Session invalidation behavior is incomplete.
- Operational detail leakage should not be publicly exposed.

### 7. Real workspace onboarding is not there yet

The product can be accessed through seeded credentials and dev bypass paths, but that is not the same as a real onboarding flow.

Evidence:

- `apps/web/src/app/api/auth/signup/route.ts`
  - explicitly says signup is disabled in workspace mode
- `apps/web/src/app/api/auth/dev-login/route.ts`
  - still supports a dev bypass flow
- `DEPLOYMENT.md`
  - documents seeded test credentials in the repo

Impact:

- This is fine for development and demos.
- It is not fine as the basis of a clean pilot or customer launch story.

### 8. The web app still carries an old Turso-based architecture beside the new API stack

The current workspace product is Postgres/API based, but several web routes still depend on a legacy Turso path.

Evidence:

- `apps/web/src/lib/db.ts`
  - direct Turso HTTP client
- `apps/web/src/app/api/waitlist/route.ts`
- `apps/web/src/app/api/founder-contact/route.ts`
- `apps/web/src/app/api/referral/route.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/signup/route.ts`

Impact:

- This creates architectural drag, environment confusion, and a higher chance of broken public-facing flows.
- It also makes launch debugging harder because there are effectively two auth/data stories in the web app.

### 9. Reporting routes have write side effects on every read

Read endpoints currently insert snapshots whenever they are called.

Evidence:

- `apps/api/src/routes/v1/reporting.ts`
  - `/projects/:id/health` inserts into `risk_snapshots`
  - `/projects/:id/outcomes` inserts into `report_snapshots`
  - `/projects/:id/weekly-summary` inserts into `report_snapshots`

Impact:

- Reads are not idempotent.
- Frequent page loads can create noisy snapshot data and unnecessary DB growth.

### 10. Escalation notifications likely duplicate over time

The escalation job inserts notifications with `ON CONFLICT DO NOTHING`, but the notifications table does not appear to define the uniqueness needed for that to protect anything meaningful.

Evidence:

- `apps/worker/src/escalation.ts`
- `packages/db/src/schema.sql`

Impact:

- Users could get repeated reminder / escalation spam from a background job that is meant to build trust.

### 11. Test coverage and CI are too thin for launch confidence

The current automated safety net is useful but not sufficient for MVP launch.

Evidence:

- only five API unit-test files exist:
  - normalizer
  - policy engine
  - risk scoring
  - Slack signature
  - workflow transitions
- `.github/workflows/backend-ci.yml`
  - covers backend builds/tests only
  - no frontend lint/build/test job
  - no integration or end-to-end workflow test

Impact:

- The repo can build and unit tests can pass while the key customer journey is still broken.

## Additional Gaps That Matter For A High-Impact MVP

These are important, but not every one of them must block launch if scope is narrowed honestly.

### Product and UX gaps

- The current web README is still largely default Next.js boilerplate:
  - `apps/web/README.md`
- Project dashboard "Generate Report (PDF)" is only browser print:
  - `apps/web/src/app/workspace/projects/[projectId]/dashboard/ProjectDashboard.tsx`
- The welcome / project creation copy still says:
  - "No credit card needed"
  - "Set up in under 2 minutes"
  even though the underlying flow is not actually complete
- The archive requests a lighter, cleaner, less slow-feeling website, and the current feedback loop around that is not yet closed

### Product truth / roadmap hygiene gap

The backlog in `C:\Users\oreil\Downloads\Larry\Larry\General\ToDo.xlsx` is directionally useful, but it is already out of sync with code.

Examples:

- chat history persistence is now at least partially wired
- `create_project` intent exists
- escalation moved to BullMQ
- calendar renewal job exists

This matters because it means the team can easily under- or over-estimate launch readiness unless one source of truth is maintained.

### Customer adoption gap

The archive and interviews repeatedly point to one adoption question:

- "How do I bring my current project into Larry?"

That does not mean Larry needs full Jira / Asana / ClickUp sync for MVP.

It does mean the product should probably offer at least one lightweight import path before serious pilots, such as:

- paste a project brief
- upload a transcript or document
- CSV task import

## Recommended MVP Definition

I do not recommend launching the full promise right away.

I recommend one of these two launch definitions.

### Option A: Honest pilot MVP (recommended)

Ship Larry as:

- a standalone workspace for project execution
- manual project creation
- Slack ingestion
- meeting transcript ingestion
- Action Center with approval-gated actions
- weekly summary / health / risk views
- email draft generation as an output artifact
- persistent Larry chat history

Do not promise yet:

- live email OAuth / inbound email ingestion
- reliable live calendar automation until renewal is fixed and validated
- chat-based project creation as a completed workflow
- external content import
- voice
- PDF / PPT export

Why this is the right launch:

- It matches the strongest real pain from interviews.
- It reduces the surface area that can fail.
- It lets Larry prove the hard part first:
  turning messy coordination into reviewed action.

Estimated distance:

- 2 to 4 focused weeks

### Option B: Promise-matched MVP

Ship Larry as the broader product described in the archive:

- standalone PM workspace
- four project-start modes
- Slack + Email + Calendar as live channels
- chat-based project creation that executes end-to-end
- richer analytics and reporting outputs
- stronger onboarding and public launch flows

Estimated distance:

- 6 to 8 focused weeks

Why this is riskier:

- too many currently partial systems need to become production-real at once
- more ways to disappoint users on first contact

## Everything That Needs To Be Done Before A High-Impact MVP

### Must Do Before Launch

#### Product and frontend

- Replace mock project workspace data with real live project/task/meeting/doc data in the active project detail experience.
- Rebuild the start-project flow so each option maps to a real backend path.
- Either finish chat-based project creation end-to-end or remove it from the UI and marketing.
- Remove or reword any copy that promises features not actually wired:
  - voice
  - external import
  - PDF export
  - "under 2 minutes" setup
- Make project detail views feel like the real system of record, not a concept UI.

#### Backend and execution logic

- Implement execution for approved `project_create` actions.
- Decide whether reporting snapshot writes should move to background jobs, be deduped, or be removed from read paths.
- Add true idempotency / uniqueness protection for escalation notifications.
- Review audit coverage on all high-value mutations and approvals.

#### Connectors

- Finish a real email connector or remove Email from launch promise.
- Fix Google Calendar renewal to preserve webhook auth token integrity.
- Validate a full live Slack -> canonical event -> action -> approval workflow in dev/staging.
- Validate a full calendar watch registration -> webhook -> renewal cycle over time.

#### Auth, onboarding, and security

- Add route-level rate limiting to backend auth routes.
- Revoke refresh tokens on logout.
- Replace dev-style workspace access with a pilot-safe invite / seeded-account flow.
- Remove health endpoint config leakage.
- Rotate and remove plaintext credentials from repo docs and archive files used operationally.
- Decide whether legacy Turso public routes stay, get migrated, or get separated from the workspace app.

#### QA, CI, and ops

- Add one end-to-end happy-path test:
  - source signal -> agent run -> pending action -> approval -> verified
- Add one failure-path test:
  - connector failure or auth/session refresh failure
- Add frontend checks to CI, not just backend checks.
- Write a minimal launch runbook:
  - deploy
  - rollback
  - seed / invite pilot users
  - rotate secrets
  - inspect failed runs

### Strongly Recommended Soon After Launch

- Add one lightweight import path for existing projects.
- Make the documents surface live from real data sources.
- Improve analytics depth beyond the current dashboard baseline.
- Add better notification center behavior and escalation UX.
- Add replay / debugging tools for failed agent runs.
- Add KPI instrumentation for:
  - hours saved
  - follow-up reduction
  - action latency
  - approval conversion

### Can Wait Until After First Pilots

- Voice-first project setup
- Full PDF / PPT report export
- PM tool integrations such as Jira / Asana / ClickUp
- Advanced behavioral risk models
- Manager hierarchy escalation intelligence
- Dedicated tenant deployment models

## Recommended Sequence

1. Fix truth-critical product gaps.
   - Real project detail views
   - Real project creation path
   - Remove false promises from UI

2. Fix trust-critical technical gaps.
   - calendar renewal bug
   - auth rate limiting
   - logout revocation
   - health endpoint leakage

3. Finish one honest connector set.
   - Slack for sure
   - meeting transcripts for sure
   - email only if truly complete

4. Add launch-grade verification.
   - one happy-path E2E
   - one failure-path E2E
   - frontend CI

5. Then launch a narrow pilot before broadening the promise.

## Final Assessment

Larry has enough real substance that this should be treated as an execution and prioritization problem, not a "start over" problem.

The backend core is ahead of where many teams get stuck. The product is closest to being valuable when it acts like an approval-gated coordination engine that turns conversations into tracked follow-through.

The risk right now is not lack of effort. The risk is launching a product story that is broader than the lived product.

If the team narrows the promise, fixes the trust gaps, and makes the active workspace UI reflect the real backend, Larry can become a strong and credible MVP quickly.

If the team tries to launch the full archive vision immediately, the likely outcome is a flashy demo with too many weak seams.

My recommendation is:

- launch the honest pilot MVP first
- prove daily value in follow-up automation and project visibility
- then expand into the broader standalone AI PM vision from a position of trust
