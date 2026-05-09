# Larry Codebase Deep Dive

Last reviewed: 2026-04-27

This is a practical explanation of how the Larry repository is put together: what each folder does, what lives in the front end and back end, how Larry's AI/agent runtime works, how coding agents should navigate the repo, and what the database looks like.

For exact source of truth, use the code. This document is an orientation layer over the main source files.

## 1. What Larry Does

Larry is an AI-powered project management platform. The product has two main surfaces:

- Public marketing and auth pages.
- Larry Workspace, where authenticated users manage projects, tasks, meetings, documents, calendars, notifications, members, and Larry's Action Centre.

The core product loop is:

1. Users create or manage projects in Larry Workspace.
2. Signals arrive from chat, meeting transcripts, Slack, email, and calendar.
3. The API normalizes those signals into canonical events.
4. A BullMQ worker processes canonical events.
5. The AI layer builds a project context snapshot, analyzes it, and returns actions.
6. Safe/reversible actions may auto-execute. Higher-risk actions are stored as suggestions in the Action Centre.
7. Users approve, dismiss, modify, or let Larry execute suggested actions.
8. Larry writes memory back to the project so later runs have context.

## 2. Repository Layout

The repo is an npm workspaces monorepo.

```text
larry-site/
  apps/
    web/       Next.js frontend and web API proxy layer
    api/       Fastify backend API
    worker/    BullMQ background worker
  packages/
    shared/    Shared domain types and queue contracts
    db/        Postgres client, schema, migrations, seed, executors
    ai/        Larry intelligence and chat runtime
    config/    Zod-validated environment config
  docs/        Product, architecture, testing, security, connector docs
  scripts/     Operational and smoke-test scripts
  plans/       Implementation plans and migration-window artifacts
  infrastructure/
    terraform/ Infrastructure skeleton
```

## 3. What Each Important Folder Does

### `apps/web`

This is the Next.js 16 App Router application.

It owns:

- Public landing pages, pricing, careers, login, signup, invite, MFA, and auth flows.
- Authenticated `/workspace/*` UI.
- Workspace shell, sidebar, topbar, global Larry chat button, notifications, and search.
- Client-side UI state and React Query setup.
- Web-only session cookie management.
- CSRF middleware for web API routes.
- Proxy routes under `/api/workspace/*` that call the Fastify API.

Key files:

- `src/app/page.tsx`: public landing page.
- `src/app/layout.tsx`: global HTML/body, fonts, global CSS, overlay setup.
- `src/middleware.ts`: page protection, CSRF checks for mutating `/api/**`, session refresh, security headers.
- `src/app/workspace/layout.tsx`: requires a session and wraps workspace pages in `WorkspaceShell`.
- `src/app/workspace/WorkspaceShell.tsx`: sidebar/topbar/layout, global chat, meeting modal, notifications.
- `src/lib/auth.ts`: signed web session cookie helpers.
- `src/lib/workspace-proxy.ts`: forwards authenticated web API requests to Fastify and refreshes API tokens.
- `src/app/api/**/route.ts`: Next route handlers. Most workspace handlers are thin proxy routes.

Important workspace pages:

- `/workspace`: workspace home.
- `/workspace/projects/[projectId]`: project detail.
- `/workspace/projects/new`: project intake.
- `/workspace/actions`: global Action Centre.
- `/workspace/larry`: dedicated Larry chat.
- `/workspace/timeline`: portfolio Gantt/timeline.
- `/workspace/my-work`: current user's work.
- `/workspace/meetings`: meeting transcripts.
- `/workspace/documents`: document/folder UI.
- `/workspace/calendar`: calendar view.
- `/workspace/email-drafts`: email drafts.
- `/workspace/notifications`: notification centre.
- `/workspace/settings/*`: account, connectors, members, Larry policy, MFA, reliability.

### `apps/api`

This is the Fastify backend API.

It owns:

- Product REST API under `/v1/*`.
- Authentication, refresh tokens, MFA, password reset, email verification, Google auth.
- Tenant context and role checks.
- Core project/task/category/member/document/folder routes.
- Larry chat, Action Centre, event accept/dismiss/modify, runtime reliability routes.
- Connector OAuth/webhooks for Slack, Google Calendar, Outlook Calendar, and email/Gmail.
- Ingest normalization and publishing jobs to BullMQ.
- Audit logging, notification recording, LLM budget checks, email quota checks.

Key files:

- `src/server.ts`: loads env and starts Fastify.
- `src/app.ts`: creates Fastify app, registers plugins/routes, DB, queue, CORS, rate limits, error handling.
- `src/routes/v1/index.ts`: central route registration.
- `src/plugins/security.ts`: JWT auth and `requireRole`.
- `src/plugins/request-context.ts`: tenant/user context.
- `src/services/queue.ts`: BullMQ queue publisher.
- `src/services/ingest/pipeline.ts`: inserts `raw_events` and `canonical_events`, publishes jobs.
- `src/routes/v1/larry.ts`: largest Larry runtime route file: chat, transcript ingest, Action Centre, event mutations, reliability, memory.

Main API route files:

- `auth*.ts`: auth, account, Google OAuth, MFA, password reset, email verification.
- `projects.ts`: projects, archive/unarchive/delete, project members, notes.
- `tasks.ts`: tasks, task status, comments, dependencies, attachments.
- `categories.ts`: project/task category routes.
- `timeline.ts`: portfolio/project timeline data.
- `documents.ts`, `folders.ts`: document asset and folder management.
- `meetings.ts`: meeting notes.
- `notifications.ts`: notifications feed/read state.
- `settings.ts`: Larry policy and custom rules.
- `connectors-*.ts`: external connector APIs and webhooks.
- `project-intake.ts`: manual/chat/meeting project intake drafts and finalization.
- `larry-documents.ts`: Larry-generated documents.

### `apps/worker`

This is the background job processor. It consumes the BullMQ queue named `larry-events`.

It owns:

- `canonical_event.created`: process normalized Slack/email/calendar/transcript signals.
- `larry.scan`: scheduled intelligence scans across active projects.
- `escalation.scan`: escalation notification sweep.
- `calendar.webhook.renew`: Google Calendar watch renewal.
- `runtime.reap`: marks stale canonical-event attempts as dead-lettered.

Key files:

- `src/worker.ts`: starts BullMQ worker, registers repeatable jobs, handles shutdown.
- `src/handlers.ts`: dispatches jobs by name and records canonical-event attempt status.
- `src/canonical-event.ts`: source-specific canonical event processing.
- `src/larry-scan.ts`: scheduled Larry project scan.
- `src/escalation.ts`: escalation scan.
- `src/calendar-renewal.ts`: Google Calendar watch renewal.
- `src/context.ts`: shared DB/env setup for worker.
- `src/intelligence-config.ts`: maps env to AI provider config.

Note: there are `.js` files next to `.ts` files in `apps/worker/src`. The TypeScript sources are the files to treat as canonical unless a deploy/runtime path explicitly says otherwise.

### `packages/shared`

Shared TypeScript contracts used by web, API, worker, DB, and AI.

It owns:

- Auth/session user shapes.
- Canonical event types.
- Queue message types and queue name.
- Larry action/event/conversation types.
- Project snapshot types.
- Timeline/Gantt and notification registry types.

Key file:

- `src/index.ts`: broad domain contract exports.

Important invariant:

- Queue contracts live here. If the API publishes a job and worker consumes it, the shape should be defined here.

### `packages/db`

Database layer for Postgres.

It owns:

- Postgres schema.
- Migration runner.
- Seed data.
- Thin DB client with tenant-scoped query helper.
- Project snapshot assembly for AI.
- Larry action executor and Action Centre persistence helpers.
- Canonical event runtime reliability helpers.
- Migration safety scripts/tests.

Key files:

- `src/schema.sql`: main schema source.
- `src/migrations/*.sql`: additive migrations.
- `src/migrate.ts`: migration runner.
- `src/seed.ts`, `src/seed-demo-nordvik.ts`: seed/demo data.
- `src/client.ts`: `Db` wrapper around `pg.Pool`.
- `src/larry-snapshot.ts`: builds `ProjectSnapshot` for AI.
- `src/larry-executor.ts`: executes/stores Larry actions, memory entries, suggestions.
- `src/canonical-event-runtime.ts`: runtime attempt ledger helpers.

### `packages/ai`

Larry's AI layer.

It owns:

- LLM provider abstraction.
- Intelligence prompt and structured output schema.
- Chat streaming prompt and tool definitions.
- Modify-chat logic for editing suggested actions.
- Timeline AI tools.
- Prompt injection and destructive-sweep guards.
- Mock intelligence fallback when no model key is configured.

Key files:

- `src/provider.ts`: maps provider config to Vercel AI SDK model.
- `src/intelligence.ts`: scheduled/login/signal intelligence, system prompt, context builder, output schema.
- `src/chat.ts`: streaming Larry chat prompt and action tools.
- `src/modify-chat.ts`: modifying existing suggestions.
- `src/structured.ts`: provider-specific structured output options.
- `src/budget.ts`: token/budget support.

Supported providers in config:

- OpenAI.
- Anthropic.
- Gemini.
- Groq.
- Mock fallback.

### `packages/config`

Shared environment variable validation.

It owns:

- API env schema.
- Worker env schema.
- Shared DB/Redis/model provider env fields.
- Feature flags like `RBAC_V2_ENABLED`, `RATE_LIMIT_REDIS_ENABLED`, `LLM_BUDGET_ENABLED`.

Key file:

- `src/index.ts`.

### `docs`

Human-facing architecture and operating docs.

Especially useful:

- `docs/OVERVIEW.md`: product overview.
- `docs/ARCHITECTURE.md`: monorepo/runtime summary.
- `docs/FRONTEND.md`: workspace UI and web proxy map.
- `docs/BACKEND-API.md`: API route contracts.
- `docs/BACKEND-WORKER.md`: worker lifecycle.
- `docs/DATABASE.md`: DB concepts.
- `docs/AI-AGENT.md`: AI policy/extraction details.
- `docs/CONNECTORS.md`: Slack/calendar/email connector details.
- `docs/TESTING.md`: testing routes, production testing guidance, Playwright notes.
- `docs/AUTH-SECURITY.md`: auth/security notes, though some items appear stale.

### `scripts`

Operational scripts.

Notable examples:

- `demo-smoke-test.sh`: API smoke flow.
- `phase-2.7-*`: migration retirement window helpers.
- `phase-12-runtime-recovery*`: runtime recovery scripts.
- `test-slack-webhook.mjs`: connector testing helper.

### `.github/workflows`

CI lives here.

Current workflow:

- `backend-ci.yml`: installs deps, builds shared packages/API, type-checks worker, runs API tests.

### `.claude`, `AGENTS.md`, `CLAUDE.md`

Instructions for coding agents.

- `AGENTS.md`: repo guidelines for project structure, commands, style, testing, PRs.
- `CLAUDE.md`: more detailed Claude Code guidance and invariants.
- `.claude/agents/frontend-developer.md`: custom frontend agent instructions.

The repo instructions say frontend work should involve the frontend agent before touching `.tsx`, `.css`, or layout files. In this environment, use the available tooling/rules from the active assistant system, but still respect the intent: inspect established frontend patterns first and keep UI changes consistent.

## 4. What Is Frontend vs Backend?

### Frontend responsibilities

The frontend manages:

- Rendering pages and components.
- Workspace navigation, layout, sidebar, topbar, modals, drawers, forms.
- Local UI state: selected project, open panels, draft form values, optimistic UI feedback.
- Client-side data fetching through local Next API routes.
- Browser session cookie and CSRF echoing.
- Human-readable error display.
- File upload/extraction UX where present.
- Landing page visuals and public marketing content.
- Playwright E2E tests for real user flows.

The frontend generally does not directly mutate Postgres. For authenticated product data, it calls its own `/api/workspace/*` routes, which proxy to the Fastify API.

Important frontend data path:

```text
React component
  -> fetch("/api/workspace/...")
  -> Next route handler in apps/web/src/app/api/workspace
  -> proxyApiRequest()
  -> Fastify /v1/... route
  -> Postgres / Redis / worker / external service
```

### Backend responsibilities

The backend manages:

- Authentication and authorization.
- Tenant isolation.
- Data validation.
- Database persistence.
- Business rules.
- Audit logs.
- Notifications.
- Queue publishing.
- Ingest normalization.
- External connector integration.
- AI action governance.
- Action execution.
- Runtime reliability.

Important backend data path:

```text
Fastify route
  -> validates request with Zod
  -> authenticates user and tenant context
  -> uses Db.queryTenant() or explicit tx with app.tenant_id
  -> writes/reads Postgres
  -> optionally publishes BullMQ job
  -> returns JSON to the web proxy
```

### Worker responsibilities

The worker manages asynchronous, long-running, or retryable work:

- Running intelligence on canonical events.
- Scheduled project scans.
- Runtime attempt ledgers.
- Stale attempt reaping.
- Calendar webhook renewal.
- Escalation scans.

It should share the same `DATABASE_URL` and `REDIS_URL` as the API environment. If API and worker point at different databases, Action Centre and memory data will drift.

## 5. Runtime Data Flow

### Authenticated workspace request

```text
Browser
  -> Next page/component
  -> /api/workspace/* route
  -> getSession() reads larry_session cookie
  -> proxyApiRequest() forwards Authorization: Bearer <apiAccessToken>
  -> Fastify authenticates JWT
  -> request context resolves tenant/user
  -> route uses tenant-scoped DB queries
  -> response returns through proxy
```

### Login/session flow

```text
Browser login form
  -> /api/auth/login in Next
  -> /v1/auth/login in Fastify
  -> Fastify validates password, lockout, MFA, device
  -> Fastify returns API access/refresh tokens
  -> Next stores them inside signed httpOnly larry_session
  -> Next also stores readable larry_csrf for mutating /api/** requests
```

### Transcript or connector ingest

```text
Transcript/Slack/email/calendar source
  -> Fastify ingest or connector route
  -> insert raw_events row with idempotency key
  -> normalize into canonical_events row
  -> publish BullMQ job canonical_event.created
  -> worker handles job
  -> worker resolves project scope
  -> worker builds project snapshot
  -> packages/ai analyzes context
  -> packages/db stores auto actions, suggestions, memory
  -> UI reads Action Centre / notifications / project memory
```

### Larry chat

```text
User sends chat
  -> web /api/workspace/larry/chat
  -> Fastify /v1/larry/chat
  -> project/global scope validation
  -> conversation + user message stored
  -> project snapshot(s) loaded
  -> packages/ai chat stream runs with tool definitions
  -> tool calls create suggested or auto-executed larry_events
  -> assistant message stored
  -> response streams/returns to UI
```

## 6. Larry AI and Agent Runtime

Larry has several "agent" modes. They share the same core idea: gather trusted project state, wrap untrusted external/user content carefully, call a model through `packages/ai`, and persist governed results through `packages/db`.

### AI provider setup

Provider config comes from `packages/config`.

`packages/ai/src/provider.ts` maps `IntelligenceConfig` to the Vercel AI SDK:

- `openai` -> `@ai-sdk/openai`.
- `anthropic` -> `@ai-sdk/anthropic`.
- `gemini` -> `@ai-sdk/google`.
- `groq` -> `@ai-sdk/groq`.

If no API key is configured, `runIntelligence()` falls back to mock intelligence.

### Project context construction

The main context builder is `getProjectSnapshot()` in `packages/db/src/larry-snapshot.ts`.

It loads, mostly in parallel:

- Project row.
- Tasks.
- Task dependencies.
- Team/project members.
- Recent activity from the last 7 days.
- Project memory entries.
- Accepted/dismissed Larry event feedback from the last 30 days.
- Optional external signals passed by worker/API.

It returns a `ProjectSnapshot` with:

- `project`.
- `tasks`.
- `team`.
- `recentActivity`.
- `signals`.
- `memoryEntries`.
- `larryContext`.
- `feedbackHistory`.
- `generatedAt`.

### How data becomes AI context

`packages/ai/src/intelligence.ts` builds a prompt from the snapshot:

- Project status, risk, target date, description.
- Larry's accumulated `projects.larry_context`.
- Task list with IDs, title, status, priority, assignee, progress, risk, due date, inactivity, dependencies.
- Team list with IDs, names, emails, roles, active task counts.
- Recent activity.
- External signals wrapped as untrusted data.
- Memory entries, also wrapped as untrusted if they came from external sources.
- Feedback history so Larry can reduce suggestions users tend to dismiss.
- Trigger hint, such as scheduled scan, login briefing, user chat, or source signal.

External/user-supplied text is guarded with tags like `<UNTRUSTED>` or `<USER_MESSAGE>` and there are prompt-injection detectors for patterns like "ignore previous instructions".

### Intelligence output shape

`runIntelligence()` calls `generateObject()` with a strict Zod schema. The model returns:

- `briefing`: plain English summary.
- `autoActions`: actions Larry thinks can happen immediately.
- `suggestedActions`: actions requiring user approval.
- `followUpQuestions`: questions when there is not enough context.
- `contextUpdate`: 1-2 sentence memory update for `projects.larry_context`.

Action payloads are validated by action type. Missing required payload fields are dropped before they reach the database/executor.

### Action governance

The model does not get to freely mutate data.

`packages/db/src/larry-executor.ts` applies policy:

- `runAutoActions()` checks tenant policy and requester role.
- Many action types are approval-only no matter what the model says.
- Disallowed auto actions are rerouted into `storeSuggestions()`.
- `storeSuggestions()` writes `larry_events` with `event_type='suggested'`.
- Accepted actions later execute through `executeAction()`.

Action types include:

- `task_create`.
- `status_update`.
- `risk_flag`.
- `reminder_send`.
- `deadline_change`.
- `owner_change`.
- `scope_change`.
- `email_draft`.
- `project_create`.
- `collaborator_add`.
- `collaborator_role_update`.
- `collaborator_remove`.
- `project_note_send`.
- `calendar_event_create`.
- `calendar_event_update`.
- `slack_message_draft`.
- `other`.

### Project memory

Project memory is stored in two places:

- `projects.larry_context`: short rolling context log capped around 6,000 chars.
- `project_memory_entries`: structured memory entries with source kind, source record ID, content hash, and replay deduplication.

`updateProjectLarryContext()` appends dated entries and trims old lines when the text grows too large.

`insertProjectMemoryEntry()` normalizes source kind aliases, hashes content, and deduplicates entries when `source_record_id` is present.

Common memory source kinds:

- `meeting`.
- `email`.
- `slack`.
- `calendar`.
- `chat`.
- `action`.
- `briefing`.
- `schedule`.

### Chat AI

`packages/ai/src/chat.ts` builds a separate system prompt for conversational Larry. It includes:

- Current date and explicit relative date resolution.
- Larry's voice and behavior rules.
- Tool-use rules.
- Destructive request refusal rules.
- Meeting transcript extraction behavior.
- Rules for verifying team members before assigning owners.
- Free-form email recipient and Slack channel handling.

The chat path can call tools that create suggestions, send reminders, draft emails/Slack messages, update tasks, or read task lists. The API persists conversations and messages in `larry_conversations` and `larry_messages`.

### Worker AI

The worker calls AI for non-interactive background intelligence:

- Scheduled scans.
- Canonical source events from Slack/email/calendar/transcripts.
- Escalation-related flows.

The worker records canonical event attempts in `canonical_event_processing_attempts`, so failures can be retried or shown in the reliability UI.

## 7. Database Overview

Database: Postgres.

Main schema source:

- `packages/db/src/schema.sql`.

Migration source:

- `packages/db/src/migrations/*.sql`.

DB access:

- `packages/db/src/client.ts`.
- `Db.queryTenant()` wraps a transaction and sets `app.tenant_id`, which is used by Row Level Security policies.

Important DB invariants:

- Product tables generally include `tenant_id`.
- RLS is enabled for product tables.
- Identity-only tables like `users` do not have `tenant_id`; membership links users to tenants.
- Connector webhook routing has special system lookup policies for cross-tenant webhook resolution.
- The schema contains legacy compatibility columns and comments from older extraction-era work.

### Enum types

Defined in `schema.sql`:

- `role_type`: `admin`, `pm`, `member`, `executive`; later migration adds `owner`.
- `task_status`: `backlog`, `not_started`, `in_progress`, `waiting`, `completed`, `blocked`.
- `task_priority`: `low`, `medium`, `high`, `critical`.
- `risk_level`: `low`, `medium`, `high`.
- `action_state`: legacy-ish approval state enum.
- `agent_run_state`: legacy-ish extraction runtime state enum.

### Table groups

Identity and tenancy:

- `tenants`.
- `users`.
- `memberships`.
- `refresh_tokens`.
- `password_reset_tokens`.
- `email_verification_tokens`.
- `email_change_requests`.
- `user_oauth_accounts`.
- `login_attempts`.
- `user_mfa_secrets`.
- `user_mfa_scratch_codes`.
- `user_profiles`.

Workspace:

- `projects`.
- `project_memberships`.
- `project_notes`.
- `project_categories`.
- `tasks`.
- `task_dependencies`.
- `task_comments`.
- `documents`.
- `folders`.
- `task_document_attachments`.
- `meeting_notes`.
- `project_intake_drafts`.

Larry runtime:

- `raw_events`.
- `canonical_events`.
- `canonical_event_processing_attempts`.
- `larry_conversations`.
- `larry_messages`.
- `larry_events`.
- `larry_briefings`.
- `larry_documents`.
- `larry_rules`.
- `project_memory_entries`.
- `correction_feedback`.
- `tenant_policy_settings`.
- `larry_org_scan_runs`.

Connectors:

- `slack_installations`.
- `slack_channel_project_mappings`.
- `google_calendar_installations`.
- `outlook_calendar_installations`.
- `email_installations`.
- `email_outbound_drafts`.

Audit/reporting/ops:

- `audit_log`.
- `activity_log`.
- `notifications`.
- `risk_snapshots`.
- `report_snapshots`.
- `kpi_snapshots`.
- `system_job_runs`.
- `org_invites`.
- `invitations`.
- `invite_links`.
- `tenant_domains`.

## 8. Database Table Schemas

This is a readable snapshot of the schema. For exact constraints, indexes, RLS policies, and additive migration details, read `packages/db/src/schema.sql` and `packages/db/src/migrations`.

### `tenants`

Purpose: organization/workspace boundary.

Columns:

- `id uuid primary key`.
- `name text not null`.
- `slug text unique not null`.
- `region text default 'eu-west-1'`.
- `data_retention_days int default 365`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive columns: `seat_cap int`, `mfa_required_for_admins boolean default false`.

### `users`

Purpose: global user account identity.

Columns:

- `id uuid primary key`.
- `email text unique not null`.
- `password_hash text nullable`.
- `display_name text`.
- `avatar_url text`.
- `is_active boolean default true`.
- `email_verified_at timestamptz`.
- `verification_grace_deadline timestamptz`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive columns: `mfa_enrolled_at timestamptz`, `role text`.

### `memberships`

Purpose: user-to-tenant role membership.

Columns:

- `tenant_id uuid references tenants`.
- `user_id uuid references users`.
- `role role_type not null`.
- `created_at timestamptz`.
- Primary key: `(tenant_id, user_id)`.

### `org_invites`

Purpose: organization request/approval flow.

Columns:

- `id uuid primary key`.
- `company_name text`.
- `slug_candidate text`.
- `requester_name text`.
- `requester_email text`.
- `team_size text`.
- `launch_context text`.
- `status text default 'requested'`.
- `tenant_id uuid nullable`.
- `user_id uuid nullable`.
- `tenant_slug text`.
- `approved_at timestamptz`.
- `approved_by text`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `refresh_tokens`

Purpose: refresh token store and session/device tracking.

Columns:

- `id uuid primary key`.
- `tenant_id uuid references tenants`.
- `user_id uuid references users`.
- `token_hash text`.
- `expires_at timestamptz`.
- `revoked_at timestamptz`.
- `created_at timestamptz`.
- Additive columns: `ip_address text`, `user_agent text`, `device_id uuid`.

### `password_reset_tokens`

Purpose: password reset token hashes.

Columns:

- `id uuid primary key`.
- `user_id uuid references users`.
- `token_hash text`.
- `expires_at timestamptz`.
- `used_at timestamptz`.
- `created_at timestamptz`.

### `email_verification_tokens`

Purpose: email verification token hashes.

Columns:

- `id uuid primary key`.
- `user_id uuid references users`.
- `token_hash text`.
- `expires_at timestamptz`.
- `used_at timestamptz`.
- `created_at timestamptz`.

### `email_change_requests`

Purpose: pending email address changes.

Columns:

- `id uuid primary key`.
- `user_id uuid references users`.
- `new_email text`.
- `token_hash text`.
- `expires_at timestamptz`.
- `confirmed_at timestamptz`.
- `created_at timestamptz`.

### `user_oauth_accounts`

Purpose: linked OAuth identities.

Columns:

- `id uuid primary key`.
- `user_id uuid references users`.
- `provider text`.
- `provider_user_id text`.
- `email text`.
- `display_name text`.
- `avatar_url text`.
- `created_at timestamptz`.
- Unique: `(provider, provider_user_id)`.

### `login_attempts`

Purpose: account lockout and brute-force tracking.

Columns:

- `user_id uuid primary key references users`.
- `attempt_count integer default 0`.
- `locked_until timestamptz`.
- `last_attempt_at timestamptz`.

### `user_mfa_secrets`

Purpose: MFA/TOTP secret per user.

Columns:

- `user_id uuid primary key references users`.
- `secret text`.
- `confirmed_at timestamptz`.
- `last_verified_at timestamptz`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `user_mfa_scratch_codes`

Purpose: backup MFA scratch codes.

Columns:

- `id uuid primary key`.
- `user_id uuid references users`.
- `code_hash text`.
- `used_at timestamptz`.
- `created_at timestamptz`.

### `user_profiles`

Purpose: onboarding/profile personalization.

Columns:

- `user_id uuid primary key references users`.
- `work_types text[]`.
- `discovery text[]`.
- `tools text[]`.
- `completed_at timestamptz`.
- `dismissed_at timestamptz`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `projects`

Purpose: core project/workspace records.

Columns:

- `id uuid primary key`.
- `tenant_id uuid references tenants`.
- `name text`.
- `description text`.
- `owner_user_id uuid references users`.
- `status text default 'active'`, constrained to `active` or `archived`.
- `risk_score numeric(5,2)`.
- `risk_level risk_level`.
- `start_date date`.
- `target_date date`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- `larry_context text`.
- Additive columns: `category_id uuid references project_categories`, `sort_order integer default 0`.

### `project_memberships`

Purpose: project-scoped collaborator access.

Columns:

- `tenant_id uuid`.
- `project_id uuid references projects`.
- `user_id uuid references users`.
- `role text`, one of `owner`, `editor`, `viewer`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Primary key: `(tenant_id, project_id, user_id)`.

### `project_notes`

Purpose: shared/personal notes between project collaborators.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid references projects`.
- `author_user_id uuid references users`.
- `visibility text`, `shared` or `personal`.
- `recipient_user_id uuid nullable`.
- `content text`.
- `source_kind text`.
- `source_record_id text`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

Constraint: shared notes have no recipient; personal notes require one.

### `project_categories`

Purpose: portfolio/project/task grouping and Gantt categories.

Columns:

- `id uuid primary key`.
- `tenant_id uuid references tenants`.
- `name text`.
- `colour text`.
- `sort_order int`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive columns: `parent_category_id uuid`, `project_id uuid`.

### `tasks`

Purpose: project tasks.

Columns:

- `id uuid primary key`.
- `tenant_id uuid references tenants`.
- `project_id uuid references projects`.
- `title text`.
- `description text`.
- `status task_status default 'not_started'`.
- `priority task_priority default 'medium'`.
- `assignee_user_id uuid references users`.
- `created_by_user_id uuid references users`.
- `progress_percent int 0-100`.
- `risk_score numeric(5,2)`.
- `risk_level risk_level`.
- `start_date date`.
- `due_date date`.
- `started_at timestamptz`.
- `completed_at timestamptz`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- `assigned_to_larry boolean`.
- `completed_by_larry boolean`.
- `larry_document_id uuid references larry_documents`.
- `labels text[]`.
- Additive columns: `parent_task_id uuid references tasks`, `source_kind text`, `source_record_id text`, `category_id uuid references project_categories`.

### `task_dependencies`

Purpose: task dependency graph.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `task_id uuid references tasks`.
- `depends_on_task_id uuid references tasks`.
- `relation text default 'finish_to_start'`.
- `created_at timestamptz`.
- Unique: `(tenant_id, task_id, depends_on_task_id)`.

### `task_comments`

Purpose: task discussion.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid references projects`.
- `task_id uuid references tasks`.
- `author_user_id uuid references users`.
- `body text`.
- `created_at timestamptz`.

### `documents`

Purpose: project/company document assets.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `title text`.
- `content text`.
- `doc_type text default 'general'`.
- `source_kind text`.
- `source_record_id text`.
- `version int default 1`.
- `metadata jsonb default {}`.
- `created_by_user_id uuid references users`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive column: `folder_id uuid references folders`.

### `folders`

Purpose: document folder hierarchy.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `parent_id uuid nullable references folders`.
- `name text`.
- `folder_type text`, one of `project`, `company`, `general`.
- `depth int 0-4`.
- `sort_order int`.
- `created_by_user_id uuid references users`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `task_document_attachments`

Purpose: many-to-many task/document attachment join.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `task_id uuid references tasks`.
- `document_id uuid references documents`.
- `attached_by_user_id uuid references users`.
- `created_at timestamptz`.
- Unique: `(tenant_id, task_id, document_id)`.

### `meeting_notes`

Purpose: stored meeting transcripts/summaries.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `agent_run_id uuid legacy compatibility`.
- `title text`.
- `transcript text`.
- `summary text`.
- `action_count int`.
- `meeting_date date`.
- `created_by_user_id uuid references users`.
- `created_at timestamptz`.

### `project_intake_drafts`

Purpose: durable project intake drafts across manual/chat/meeting flows.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `mode text`, one of `manual`, `chat`, `meeting`.
- `status text`, one of `draft`, `bootstrapped`, `finalized`.
- `project_name text`.
- `project_description text`.
- `project_start_date date`.
- `project_target_date date`.
- `attach_to_project_id uuid nullable`.
- `chat_answers jsonb`.
- `meeting_title text`.
- `meeting_transcript text`.
- `bootstrap_summary text`.
- `bootstrap_tasks jsonb`.
- `bootstrap_actions jsonb`.
- `bootstrap_seed_message text`.
- `finalized_project_id uuid`.
- `finalized_meeting_note_id uuid`.
- `finalized_canonical_event_id uuid`.
- `finalized_at timestamptz`.
- `created_by_user_id uuid`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `raw_events`

Purpose: deduplicated raw external/source ingest payloads.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `source text`.
- `source_event_id text`.
- `payload jsonb`.
- `idempotency_key text`.
- `created_at timestamptz`.
- Unique: `(tenant_id, idempotency_key)`.

### `canonical_events`

Purpose: normalized ingest events that worker can process consistently.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `raw_event_id uuid references raw_events`.
- `source text`.
- `source_event_id text`.
- `event_type text`.
- `actor text`.
- `confidence numeric(4,3)`.
- `occurred_at timestamptz`.
- `payload jsonb`.
- `created_at timestamptz`.

### `canonical_event_processing_attempts`

Purpose: reliability ledger for worker processing.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `canonical_event_id uuid references canonical_events`.
- `queue_job_id text`.
- `queue_job_name text`.
- `source text`.
- `status text`, one of `running`, `succeeded`, `retryable_failed`, `dead_lettered`.
- `attempt_number int`.
- `max_attempts int`.
- `started_at timestamptz`.
- `finished_at timestamptz`.
- `duration_ms int`.
- `error_message text`.
- `error_stack text`.
- `error_payload jsonb`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Unique: `(tenant_id, canonical_event_id, attempt_number)`.

### `larry_conversations`

Purpose: Larry chat conversations.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `user_id uuid nullable references users`.
- `title text`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `larry_messages`

Purpose: message history for Larry conversations.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `conversation_id uuid references larry_conversations`.
- `role text`, `user` or `larry`.
- `content text`.
- `reasoning jsonb`.
- `actor_user_id uuid references users`.
- `created_at timestamptz`.

### `larry_events`

Purpose: canonical Action Centre and Larry action ledger.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `event_type text`, one of `auto_executed`, `suggested`, `accepted`, `dismissed`.
- `action_type text`.
- `display_text text`.
- `reasoning text`.
- `payload jsonb`.
- `executed_at timestamptz`.
- `triggered_by text`, one of `schedule`, `login`, `chat`, `signal`.
- `chat_message text`.
- `conversation_id uuid`.
- `request_message_id uuid`.
- `response_message_id uuid`.
- `requested_by_user_id uuid`.
- `approved_by_user_id uuid`.
- `approved_at timestamptz`.
- `dismissed_by_user_id uuid`.
- `dismissed_at timestamptz`.
- `executed_by_kind text`, `larry` or `user`.
- `executed_by_user_id uuid`.
- `execution_mode text`, `auto` or `approval`.
- `source_kind text`.
- `source_record_id uuid`.
- `created_at timestamptz`.
- Additive modification columns: `previous_payload jsonb`, `modified_by_user_id uuid`, `modified_at timestamptz`.

### `larry_briefings`

Purpose: login/user briefing payloads.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `user_id uuid`.
- `content jsonb`.
- `event_ids uuid[]`.
- `seen_at timestamptz`.
- `created_at timestamptz`.

### `project_memory_entries`

Purpose: structured project memory from meetings, chat, signals, actions, scans.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid references projects`.
- `source text`.
- `source_kind varchar`.
- `source_record_id text`.
- `content text`.
- `content_hash text`.
- `created_at timestamptz`.

Important index:

- Replay dedup on `(tenant_id, project_id, source_kind, source_record_id, content_hash)`.

### `larry_rules`

Purpose: tenant-level custom Larry behavioral rules.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `title text`.
- `description text`.
- `rule_type text default 'behavioral'`.
- `is_active boolean`.
- `created_by_user_id uuid`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `larry_documents`

Purpose: documents generated by Larry.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `larry_event_id uuid nullable references larry_events`.
- `title text`.
- `doc_type text`, one of `email_draft`, `letter`, `memo`, `report`, `note`, `other`.
- `content text`.
- `email_recipient text`.
- `email_subject text`.
- `email_sent_at timestamptz`.
- `state text`, one of `draft`, `final`, `sent`.
- `created_by_user_id uuid`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive column: `folder_id uuid references folders`.

### `tenant_policy_settings`

Purpose: tenant-level Larry autonomy settings.

Columns:

- `tenant_id uuid primary key references tenants`.
- `low_impact_min_confidence numeric(4,3) default 0.750`.
- `medium_impact_min_confidence numeric(4,3) default 0.800`.
- `auto_execute_low_impact boolean default true`.
- `autonomy_level integer default 3`, between 1 and 5.
- `updated_at timestamptz`.

### `correction_feedback`

Purpose: user corrections to Larry actions.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `action_id uuid`.
- `corrected_by_user_id uuid references users`.
- `correction_type text`.
- `correction_payload jsonb`.
- `created_at timestamptz`.

### `slack_installations`

Purpose: Slack OAuth installation data.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `installed_by_user_id uuid`.
- `slack_team_id text unique`.
- `slack_team_name text`.
- `slack_enterprise_id text`.
- `slack_bot_user_id text`.
- `slack_scope text`.
- `app_id text`.
- `bot_access_token text`.
- `installed_at timestamptz`.
- `updated_at timestamptz`.

### `slack_channel_project_mappings`

Purpose: Slack channel to Larry project mapping.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `slack_team_id text`.
- `slack_channel_id text`.
- `project_id uuid references projects`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Unique: `(tenant_id, slack_team_id, slack_channel_id)`.

### `google_calendar_installations`

Purpose: Google Calendar OAuth/watch metadata.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `installed_by_user_id uuid`.
- `project_id uuid nullable references projects`.
- `google_calendar_id text default 'primary'`.
- `google_access_token text`.
- `google_refresh_token text`.
- `google_scope text`.
- `token_expires_at timestamptz`.
- `webhook_channel_id text unique`.
- `webhook_resource_id text`.
- `webhook_expiration timestamptz`.
- `installed_at timestamptz`.
- `updated_at timestamptz`.
- Unique: `(tenant_id, google_calendar_id)`.

### `outlook_calendar_installations`

Purpose: Outlook Calendar OAuth/subscription metadata.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `installed_by_user_id uuid`.
- `project_id uuid nullable references projects`.
- `outlook_calendar_id text default 'primary'`.
- `outlook_access_token text`.
- `outlook_refresh_token text`.
- `outlook_scope text`.
- `token_expires_at timestamptz`.
- `installed_at timestamptz`.
- `updated_at timestamptz`.
- Additive columns: `outlook_subscription_id text`, `outlook_subscription_client_state text`, `outlook_subscription_expiration timestamptz`.
- Unique: `(tenant_id, outlook_calendar_id)`.

### `email_installations`

Purpose: email/Gmail connector installation metadata.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `installed_by_user_id uuid`.
- `provider text default 'generic'`.
- `account_email text`.
- `provider_account_id text`.
- `oauth_access_token text`.
- `oauth_refresh_token text`.
- `oauth_scope text`.
- `oauth_token_expires_at timestamptz`.
- `webhook_secret text`.
- `connected_at timestamptz`.
- `updated_at timestamptz`.
- Unique: `(tenant_id, account_email)`.

### `email_outbound_drafts`

Purpose: outbound email drafts/sends.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `action_id uuid legacy compatibility`.
- `created_by_user_id uuid`.
- `recipient text`.
- `subject text`.
- `body text`.
- `state text default 'draft'`.
- `sent_at timestamptz`.
- `metadata jsonb`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `notifications`

Purpose: user/workspace notification records.

Base columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `user_id uuid nullable`.
- `channel text`.
- `subject text`.
- `body text`.
- `metadata jsonb`.
- `sent_at timestamptz`.
- `created_at timestamptz`.

Additive columns:

- `dedupe_scope text`.
- `dedupe_user_key text default '__broadcast__'`.
- `dedupe_date date default current_date`.
- `read_at timestamptz`.
- `type text`.
- `severity text`.
- `deep_link text`.
- `batch_id uuid`.
- `dismissed_at timestamptz`.

### `activity_log`

Purpose: project/task activity feed.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `task_id uuid nullable references tasks`.
- `actor_user_id uuid nullable references users`.
- `activity_type text`.
- `payload jsonb`.
- `created_at timestamptz`.

### `audit_log`

Purpose: audit trail, with hash-chain fields.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `actor_user_id uuid nullable references users`.
- `action_type text`.
- `object_type text`.
- `object_id text`.
- `details jsonb`.
- `previous_hash text`.
- `entry_hash text`.
- `created_at timestamptz`.

### `risk_snapshots`

Purpose: risk history.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid references projects`.
- `task_id uuid nullable references tasks`.
- `risk_score numeric(5,2)`.
- `risk_level risk_level`.
- `signals jsonb`.
- `created_at timestamptz`.

### `report_snapshots`

Purpose: saved/generated reporting payloads.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `report_type text`.
- `summary jsonb`.
- `created_by_user_id uuid`.
- `created_at timestamptz`.

### `kpi_snapshots`

Purpose: periodic KPI values.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `project_id uuid nullable references projects`.
- `metric_key text`.
- `metric_value numeric(12,2)`.
- `period_start date`.
- `period_end date`.
- `created_at timestamptz`.

### `system_job_runs`

Purpose: lightweight scheduler health status.

Columns:

- `job_name text primary key`.
- `last_run_started_at timestamptz`.
- `last_run_finished_at timestamptz`.
- `last_run_duration_ms int`.
- `last_run_processed int`.
- `last_run_failed int`.
- `last_run_error text`.
- `updated_at timestamptz`.

### `invitations`

Purpose: pending tenant invitations.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `email text`.
- `role role_type`.
- `token_hash text`.
- `status text`, one of `pending`, `accepted`, `revoked`, `expired`.
- `invited_by_user_id uuid`.
- `expires_at timestamptz`.
- `accepted_at timestamptz`.
- `accepted_by_user_id uuid`.
- `revoked_at timestamptz`.
- `revoked_by_user_id uuid`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- Additive columns: `project_id uuid`, `project_role text`.

### `invite_links`

Purpose: reusable invite links with optional project scope.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `token_hash text`.
- `created_by_user_id uuid`.
- `default_role role_type default 'member'`.
- `default_project_id uuid nullable`.
- `default_project_role text nullable`.
- `max_uses int`.
- `uses_count int`.
- `expires_at timestamptz`.
- `revoked_at timestamptz`.
- `revoked_by_user_id uuid`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

### `tenant_domains`

Purpose: verified domains and auto-join/invite policies.

Columns:

- `id uuid primary key`.
- `tenant_id uuid`.
- `domain text`.
- `mode text`, one of `auto_join`, `invite_only`, `blocked`.
- `default_role role_type`.
- `verification_token text`.
- `verified_at timestamptz`.
- `created_at timestamptz`.

### `larry_org_scan_runs`

Purpose: tenant-level org scan throttle/status.

Columns:

- `tenant_id uuid primary key references tenants`.
- `last_run_at timestamptz`.

## 9. Important Commands

Run from repo root.

Local services:

```bash
docker compose up -d
npm install
npm run api:dev
npm run worker:dev
npm run web:dev
```

Build:

```bash
npm run api:build
npm run worker:build
npm run web:build
npm run vercel-build
```

Tests:

```bash
npm run api:test
npm run worker:test
npm run test -w @larry/web
npm run test:e2e -w @larry/web
npm run test -w @larry/shared
```

Database:

```bash
npm run db:migrate
npm run db:seed
npm run db:setup
```

Dangerous/destructive:

```bash
npm run db:reset
```

## 10. Risky Areas To Modify

Be extra careful with:

- `packages/db/src/schema.sql` and migrations: production data and RLS depend on these.
- `apps/api/src/routes/v1/larry.ts`: central Larry runtime route with many contracts.
- `packages/db/src/larry-executor.ts`: executes actions and writes Action Centre ledger.
- `packages/db/src/larry-snapshot.ts`: feeds AI context.
- `packages/ai/src/intelligence.ts` and `packages/ai/src/chat.ts`: prompt, schema, and tool behavior.
- `apps/worker/src/handlers.ts` and `apps/worker/src/canonical-event.ts`: async processing and retries.
- `apps/api/src/services/ingest/pipeline.ts`: canonical ingest/idempotency.
- Auth files in `apps/api/src/routes/v1/auth*.ts`, `apps/api/src/plugins/security.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/auth.ts`.
- `apps/web/src/lib/workspace-proxy.ts`: all workspace API calls flow through it.
- Connector webhook files: Slack/Google/Outlook/email routes and services.
- Deployment files: `vercel.json`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`, Railway/Vercel config.

## 11. Notes For Coding Agents

Start with the right context, not the whole repo:

- Frontend/UI: read `docs/FRONTEND.md`, then the page/component.
- API/backend: read `docs/BACKEND-API.md`, then the route and supporting lib/service.
- Worker: read `docs/BACKEND-WORKER.md`, then `apps/worker/src`.
- AI: read `docs/AI-AGENT.md`, `packages/ai/src/intelligence.ts`, `packages/ai/src/chat.ts`, and `packages/db/src/larry-snapshot.ts`.
- Database: read `docs/DATABASE.md`, `packages/db/src/schema.sql`, and relevant migration.
- Connectors: read `docs/CONNECTORS.md`.
- Auth/security: read `docs/AUTH-SECURITY.md`, but verify against code because parts may be stale.

Do not break these invariants:

- API and worker must share `DATABASE_URL`.
- Canonical ingest should flow through `raw_events` and `canonical_events`.
- Transcript processing should happen in the worker path, not as a heavy API request.
- AI provider calls should go through `packages/ai`.
- Product DB queries should be tenant-scoped.
- High-risk Larry actions should be approval-gated through `larry_events`.
- Session cookie contains API tokens; web proxy handles refresh.
- Do not add `namespace` to `@fastify/jwt`.

## 12. Known Documentation Drift And Uncertainties

These are worth re-checking before making related changes:

- `README.md` references `docs/SPRINT-4DAY.md`, but that file was not present during this review.
- `docs/AUTH-SECURITY.md` lists some security gaps that the current code appears to have partially or fully addressed, such as auth rate limiting, logout revocation, and strict session secret handling.
- `docs/BACKEND-WORKER.md` says `escalation.scan` runs hourly, but `apps/worker/src/worker.ts` currently schedules it every 24 hours.
- `runtime.reap` exists in worker code but is not part of the shared `QueueJobType` union in the same way as the main documented jobs.
- `apps/web/src/lib/db.ts` still contains a Turso HTTP client used by a few public/admin/marketing routes. Product workspace data otherwise flows through the Fastify API bridge.
- Outlook webhook subscription renewal is documented as a planned improvement.
- The database schema includes legacy compatibility columns and legacy enum values from older runtime phases.

