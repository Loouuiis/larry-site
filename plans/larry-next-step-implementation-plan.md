# Plan: Larry Next-Step Workspace Expansion

> Source PRD: user report in thread on 2026-03-28

## Current Repo Reality

- The repo is not starting from zero. It already has real project/task CRUD, per-project Larry chat, transcript ingest, calendar watch and webhook ingestion, email draft storage, and project analytics.
- The repo is also carrying structural overlap that should be treated as foundation work, not tolerated as background debt:
  - The active product lives under `/workspace`, but a legacy `/dashboard` route tree and older dashboard shell still exist in-repo.
  - The active workspace intake now supports manual, chat, and meeting modes on `/workspace/projects/new`, but a legacy `StartProjectFlow` still exists in dashboard-era code.
  - Legacy dashboard surfaces still rely on one broad `/api/workspace/snapshot` aggregator, even though the active `/workspace` route tree has already been moved onto scoped read models.
  - Legacy parent extraction tables (`agent_runs`, `extracted_actions`) are now retired in repo via Migration E, while target-environment execution evidence is still pending rollout windows.
  - The worker now processes `canonical_event.created` for transcript-led meeting flows plus login briefing, scheduled scan, email, Slack, and calendar connector flows; connector-heavy behavior still leans on scheduled scans as fallback and hygiene.
  - The canonical Larry Action Centre contract already supports both project-scoped and tenant-wide reads, and the active global `/workspace/actions` page now renders cross-project ledger entries with project display labels.
  - Policy and ambiguity logic exist in `packages/ai`, but the active Larry chat path mostly bypasses them in favor of direct intelligence plus immediate auto-execution.
- Because of that, the correct strategy is **restructure first, then expand**. Adding features directly on top of the current overlap would make the product harder to reason about, harder to delegate, and harder to stabilize.

## Architectural Decisions

Durable decisions that apply across all phases:

- **Single workspace surface**: `/workspace` is the only active product route tree. Legacy `/dashboard` flows are retired or fenced off from production behavior. No new feature lands on the legacy shell.
- **Single workspace data plane**: Replace the current catch-all snapshot dependency with scoped read models and server-first loaders. Pages may still aggregate multiple sources, but they should not depend on one kitchen-sink snapshot for unrelated concerns.
- **Single Larry runtime**: Unify project chat, transcript intake, connector-triggered actions, scheduled scans, approvals, and execution around one canonical Larry runtime. Extend the current `larry_events`, `larry_conversations`, and `larry_messages` path and migrate away from the older extraction-led path for new behavior.
- **Single execution state machine**: All Larry requests move through a consistent lifecycle:
  - request or signal received
  - clarify if ambiguous
  - plan actions
  - enrich actions with project context
  - decide auto-execute vs approval
  - execute or await confirmation
  - audit and write project memory
- **Frontend architecture**: Follow a server-first Next.js approach for workspace reads. Parallelize data fetching where possible, minimize repeated client waterfalls, and keep client state focused on interaction, not primary data orchestration.
- **Event-driven processing first**: Connector and transcript events should drive updates directly. Scheduled scans remain as fallback hygiene and recovery, not the primary mutation path.
- **Schema boundaries**:
  - `project_members` (or equivalent) becomes the project-scoped collaboration model.
  - `project_memory_entries` (or equivalent) becomes Larry's durable project memory.
  - `documents` becomes a storage-backed asset model with task and project linkage, versions, and artifact metadata.
  - `project_notes` stores shared and personal notes.
  - `larry_events` becomes the canonical action ledger with provenance, authority, linked outputs, and conversation linkage.
- **Source taxonomy**: Normalize task, action, document, note, and memory provenance to `meeting`, `direct_chat`, `slack`, `recommendation_review`, and `manual`, with linked source record IDs where possible.
- **Authorization**: Tenant membership controls workspace access. Project membership controls project collaboration. Auto-execution additionally requires action policy eligibility and authority to perform the underlying mutation.
- **Migration rule**: Every foundational phase must retire, gate, or deprecate the path it supersedes. No phase is allowed to merely add a second way of doing the same thing.
- **Testing rule**: Every phase must ship one demoable end-to-end path across schema, API, UI, background processing, and tests.

## Product Rules To Lock In

These rules resolve ambiguity in the report and must be implemented consistently:

- **Project dashboard contract**: Every project dashboard must expose three first-class, database-backed surfaces: project context, a dedicated Action Centre, and a project-specific Larry chat with expandable history.
- **Chat attribution contract**: Every conversation turn and every resulting action must persist requester, actor, approver, execution mode, and linked action IDs so the UI can show what Larry created and by whom.
- **Clarification-before-action contract**: Larry never executes on vague intent, conflicting instructions, missing required fields, or unclear project scope. In those cases, follow-up questions are mandatory.
- **Low-risk auto-execution contract**: Auto-execution is allowed only when intent is unambiguous, required context is present, the action class is marked low risk, the acting user has authority, and the change is reversible or strongly audit-safe. Everything else requires user confirmation.
- **Action enrichment contract**: Before creating or updating a task, document, calendar event, note, or communication draft, Larry enriches the plan with available project memory, linked meetings or chats, owners, dates, and related records. If required fields cannot be inferred safely, Larry asks for them.
- **Source-tagging contract**: Tasks, actions, documents, notes, calendar-derived memory, and project memory entries all carry normalized source taxonomy and linked source record IDs where available.
- **Capability envelope**: The canonical Larry runtime must support task management, email and letter drafting, document skeleton generation, calendar reads and writes, collaborator management, and note drafting as first-class action types rather than ad hoc one-off flows.
- **Project mutation contract**: Larry must be able to create or update project-scoped tasks, collaborators, documents, notes, and calendar entries through one governed action system rather than separate bespoke paths.

## Cross-Cutting Quality Gates

- **Security**:
  - Tenant and project authorization must be enforced on every read, mutation, draft, approval, and deletion path.
  - Auto-execution must verify both policy eligibility and user authority for the underlying mutation.
  - Connector and calendar integrations must use least-privilege scopes, verified webhooks, and auditable token handling.
  - Documents and notes must respect project membership and personal-note visibility rules.
  - Project deletion must support confirmation, audit, and a recoverable archive window before destructive cleanup where product policy allows it.
- **Performance**:
  - Workspace and project dashboards must load from scoped server-side reads, not repeated full snapshots.
  - Action Centre, chat history, notes, and documents must be paginated or cursor-based rather than unbounded lists.
  - Canonical Larry tables must be indexed for project, conversation, state, source, actor, and recency access patterns.
  - Long-running side effects such as document generation, email drafting, and connector writes must execute asynchronously with visible progress states.
  - UI refresh must use targeted invalidation or event updates, not whole-workspace polling after each mutation.
- **Reliability**:
  - Larry events and execution jobs must be idempotent and replay-safe.
  - Event publication and mutation writes must stay consistent so the action ledger cannot drift from the underlying project state.
  - Background jobs need retries, dead-letter handling, and operator-visible failure states.
  - Destructive flows such as deletion, membership changes, and connector writes require explicit audit trails and compensating recovery paths where feasible.
- **Testing And Release**:
  - Every report requirement must map to an automated test path before launch.
  - Policy, permissions, source-tagging, and attribution rules need unit and contract coverage.
  - Project chat, action execution, collaboration, documents, calendar, global chat, and deletion need end-to-end coverage.
  - Backfills and migrations must be rehearsed on production-like data before canonical cutover.

## Restructuring Mandates

These are not optional cleanups; they are part of the implementation strategy:

- Retire the legacy dashboard shell before broadening workspace behavior.
- Break the web app's dependence on the broad snapshot endpoint for core product flows.
- Unify Larry's runtime model before adding shared chat, project memory, or richer approvals.
- Move from scan-led mutation to event-driven mutation before trusting connector-heavy behavior.
- Remove dead or half-cut routes and proxies as the canonical flows replace them.

## Requirement Coverage Matrix

| Report requirement | Planned phases | Non-negotiable implementation notes |
| --- | --- | --- |
| Larry retains context for each project | Phases 2, 4, 9 | Project memory must be durable, queryable, and fed by meetings, chat, actions, and calendar signals. |
| Each project has its own dashboard, dedicated Action Centre, and unique Larry chat with history | Phases 1, 3, 7 | Project dashboard must have stable database-backed panels for context, actions, and chat history. |
| Each chat shows what actions were created and by whom | Phases 2, 3, 7 | Conversation turns and actions must share attribution and linkage fields. |
| Larry auto-creates low-risk actions without approval when authority allows | Phases 2, 6 | Auto-execution is allowed only for unambiguous, low-risk, authority-checked, audit-safe actions. |
| Larry enriches tasks and actions with extra context and prompts for missing context | Phases 4, 6 | Enrichment is required before mutation; missing required fields trigger follow-up questions. |
| All tasks and actions are tagged by source | Phases 2, 3 | Source taxonomy must be normalized and persisted at creation time, not inferred in the UI. |
| Larry requests clarification before acting on vague actions | Phase 6 | Clarification is mandatory for ambiguity, missing fields, unclear scope, or conflicting instructions. |
| Larry chat is conversational, expandable, and not one-shot | Phases 2, 6, 7 | Project chat must persist turn-by-turn planning, revisions, approvals, and history expansion. |
| Larry asks follow-up questions before executing actions | Phase 6 | Medium-risk, high-risk, externally visible, or under-specified actions always require interaction before execution. |
| Larry drafts emails and letters | Phase 8 | Drafts must be first-class action outputs tied to project context and review state. |
| Larry creates `.docx` and `.xlsx` skeletons attached to tasks and stored in project docs | Phase 8 | Generated files must be storage-backed assets with task and project linkage plus version metadata. |
| Larry syncs with Google Calendar for read and write use cases | Phase 9 | Calendar reads feed project context; calendar writes go through the same governed action system. |
| Larry creates and updates tasks and project-related users or documents | Phases 6, 7, 8, 9 | Task, collaborator, document, note, and calendar mutations all need project scope, audit, and policy checks. |
| Project creation supports manual, chat, and meeting modes | Phases 1, 5 | All three intake modes must land on one canonical route and draft model. |
| Global chat works across all projects | Phase 9 | Retrieval, grouping, and permissions must be cross-project aware from the start. |
| Projects can be deleted | Phase 10 | Deletion must be explicit, auditable, and safe for related artifacts. |
| Multiple real users can collaborate and receive personal notes drafted by Larry | Phase 7 | Project membership, shared visibility, personal-note targeting, and Larry drafting all ship together. |

## Implementation Progress

### Done In Repo

- **Phase 1 workspace cutover, slice 1**:
  - Added scoped workspace home reads and moved the active workspace home off the broad snapshot path.
  - Added scoped project overview reads and moved the active `/workspace/projects/[projectId]` page off the legacy `ProjectWorkspace` component path.
  - Moved the active workspace shell project list off the broad snapshot path.
  - Added a workspace-native project surface with stable slots for project context, Action Centre, and project Larry chat.
- **Phase 1 workspace cutover, slice 2**:
  - Added a scoped `my-work` read model and moved `/workspace/my-work` off the broad snapshot path.
  - Added a scoped meetings overview read model and moved `/workspace/meetings` off the broad snapshot path.
  - Confirmed the active `/workspace` route tree no longer depends on `/api/workspace/snapshot`; remaining snapshot usage is now confined to legacy dashboard code.
- **Phase 1 project intake cutover**:
  - Added canonical `/workspace/projects/new` entry wiring from the active top bar and sidebar.
  - Replaced the reused legacy `StartProjectFlow` on the active workspace route with a workspace-native intake page.
  - The new intake page now supports:
    - manual project creation
    - guided chat-led project creation
    - meeting-led creation that creates the project first and then processes the transcript into that project
- **Phase 1 dead-seam cleanup**:
  - Added an explicit placeholder `/workspace/actions` page so the active route tree no longer dead-ends while the real global Action Centre is still pending.
  - Retired the legacy `/api/workspace/actions` handlers on the active app tree with explicit 410 behavior instead of leaving empty route folders behind.
- **Phase 2 starter slice**:
  - Added a project-scoped action-centre read model that aggregates Larry suggested actions, Larry activity, and project conversation previews behind one workspace contract.
  - Moved the active project Action Centre and project chat preview area to this action-centre contract so the active project page no longer assembles that state from separate ad hoc Larry fetches.
- **Phase 2.1 chat-linked action ledger slice**:
  - Extended `larry_events` and `larry_messages` with conversation, message, requester, approver, executor, and source-linkage fields plus backfills and recency or linkage indexes.
  - Updated the canonical Larry chat write path so `/v1/larry/chat` now persists the user turn, assistant turn, and linked action records together and returns that persisted contract to the web app.
  - Added a canonical `/v1/larry/action-centre` backend contract and moved the project Action Centre proxy off stitched fan-out reads onto that single ledger-backed endpoint.
  - Added the matching web-facing Larry contract updates so project chat, `/workspace/chats`, and project Action Centre cards can all render requester, approval, execution, and source provenance from one payload shape.
  - Updated the active project chat panel and `/workspace/chats` to use the persisted chat response, render linked action chips beneath assistant replies, and remove the old fire-and-forget message persistence path for action-generating chats.
  - Added API coverage for the upgraded chat and Action Centre routes, schema assertions for the ledger migration, a Playwright smoke test for project chat -> linked action -> accept flow, and a reusable `@larry/web` `test:e2e` script for the new smoke path.
- **Phase 2.2 transcript and signal ledger cutover**:
  - Consolidated transcript ingest onto canonical `/v1/larry/transcript` + `canonical_event.created` publishing, with transcript payload normalization (`projectId`, meeting metadata, submitter attribution) aligned to canonical worker handling.
  - Added active worker handling for `canonical_event.created` so transcript jobs load the canonical event, resolve project scope, run intelligence once, write the meeting summary, create source-linked `larry_events`, and reconcile `meeting_notes.action_count`.
  - Added replay safety for transcript-driven event creation by querying existing meeting-linked `larry_events` before generating actions and by indexing `(tenant_id, source_kind, source_record_id)` on the canonical ledger.
  - Extended non-chat `LarryEventContext` usage so login briefings stamp `requestedByUserId`, `sourceKind='briefing'`, and `sourceRecordId=briefingId`, while scheduled scans stamp `sourceKind='schedule'`.
  - Updated active transcript entry points to return queued-style UX while preserving transitional inline intelligence writes in `/v1/larry/transcript`; full queue-only transcript execution remains a deferred seam.
  - Added API, worker, and Playwright coverage for transcript ingest, briefing attribution, transcript replay safety, scheduled scan stability, and meeting-led Action Centre provenance.
- **Phase 2.3 intake chat-write migration boundary closure**:
  - Retired `saveLarryMessage` and ad hoc conversation writes in active `/workspace/projects/new` chat intake and legacy `StartProjectFlow` chat intake.
  - Kept guided intake Q&A local during questionnaire steps, then seeded one canonical project chat write via `/api/workspace/larry/chat` after project creation.
  - Added non-blocking fallback behavior so project creation still succeeds when canonical seeding fails, with explicit UI copy guiding the user to continue in project chat.
  - Added focused Playwright coverage for workspace chat intake project creation + canonical seed payload assertions, plus regression checks that legacy conversation/message write endpoints are not used by active intake flow.
- **Phase 2.4 conversation write endpoint retirement/fencing**:
  - Retired legacy manual write endpoints by fencing `POST /v1/larry/conversations` and `POST /v1/larry/conversations/:id/messages` with explicit `410 Gone` migration guidance to canonical `POST /v1/larry/chat`.
  - Applied the same fencing at the workspace API boundary by returning `410` from `POST /api/workspace/larry/conversations` and `POST /api/workspace/larry/conversations/:id/messages` instead of proxying side-path writes.
  - Removed now-dead web write helpers (`createLarryConversation`, `saveLarryMessage`) so new web code cannot accidentally reintroduce side-path chat persistence.
  - Added API regression coverage for retired write endpoints and Playwright regression coverage proving active project chat persists through canonical `/api/workspace/larry/chat` without posting to legacy conversation/message write paths.
- **Phase 2.5 legacy event-list read endpoint retirement/fencing**:
  - Retired legacy event-list reads by fencing `GET /v1/larry/events` with explicit `410 Gone` migration guidance to canonical `GET /v1/larry/action-centre` project/global read contracts.
  - Applied the same read fence at the workspace API boundary by returning `410` from `GET /api/workspace/larry/events` with migration guidance to `/api/workspace/projects/:id/action-centre` and `/api/workspace/larry/action-centre`.
  - Added API regression coverage for retired `GET /larry/events` behavior, including assertion that legacy `listLarryEventSummaries` fan-out is not invoked by the fenced route.
  - Added Playwright regression coverage proving active `/workspace/actions`, project workspace Action Centre, and linked chat launch flows do not call retired `/api/workspace/larry/events` reads.
- **Phase 2.6 meetings read-path extraction runtime cutover (transitional)**:
  - Removed `agent_runs` query and join dependencies from active `GET /v1/meetings` and `GET /v1/meetings/:id` handlers so meetings reads now run only from `meeting_notes`.
  - Kept `agentRunId` and `agentRunState` in the meetings response contract as transitional nullable compatibility placeholders (`null`) while migration cleanup continues.
  - Updated active workspace meetings status rendering and expanded rows to rely on canonical meeting outputs (`summary` and `actionCount`) instead of legacy run-state metadata.
  - Added API regression coverage proving meetings handlers do not query `agent_runs`, and updated transcript-led Playwright fixtures to stop depending on agent-run fields.
- **Phase 2.7a extraction boundary hardening (conservative)**:
  - Removed transcript ingest write-time extraction coupling by updating `POST /v1/ingest/transcript` meeting-note inserts to stop referencing `agent_run_id`.
  - Added an API regression guard in transcript ingest coverage so tests fail if `agent_run_id` is reintroduced in active ingest SQL.
  - Deleted the unused legacy workspace proxy route `/api/workspace/agent/runs/[runId]` so active web code no longer exposes a run-state passthrough seam.
  - Added `plans/phase-2.7-extraction-boundary-checklist.md` with a keep/migrate/fence matrix for `agent_runs`, `extracted_actions`, `approval_decisions`, and `interventions`, plus rehearsal SQL checks and artifact template fields.
- **Phase 2.7b task-triage canonical cutover (workspace boundary)**:
  - Migrated active workspace task-triage writes off legacy `/v1/agent/runs` onto canonical `POST /v1/larry/chat` in both `/api/workspace/tasks` auto-triage and `/api/workspace/tasks/triage`.
  - Preserved existing workspace route contracts while moving triage payloads onto canonical `{ projectId, message }` chat input.
  - Added API regression coverage (`tests/task-triage-runtime-boundary.test.ts`) that fails if active workspace task-triage routes reintroduce `/v1/agent/runs` or stop targeting `/v1/larry/chat`.
- **Phase 2.7c rehearsal automation + schema deprecation sequencing prep (repo-prep)**:
  - Added a runnable rehearsal tool (`scripts/phase-2.7-extraction-rehearsal.mjs`) with required CLI metadata (`--tenant`, `--environment`, `--dataset`) and optional `--out-dir`.
  - Added canonical preflight checks in the rehearsal tool for required `larry_events`/`larry_messages` columns and blocked-artifact behavior when schema is not yet aligned.
  - Standardized commit-safe artifact output under `plans/phase-2.7-artifacts` with JSON + Markdown output and sign-off placeholders.
  - Updated `plans/phase-2.7-extraction-boundary-checklist.md` to reference scripted workflow, preflight expectations, and sanitized replay output.
  - Added `plans/phase-2.7-schema-deprecation-prep.md` with ordered fence/sign-off/FK-detach/table-retirement sequencing and rollback notes for `agent_runs`, `extracted_actions`, `approval_decisions`, and `interventions`.
- **Phase 2.7d Migration A FK detach (repo-level, compatibility-safe)**:
  - Updated `packages/db/src/schema.sql` so `meeting_notes.agent_run_id` remains nullable but no longer declares an inline FK to `agent_runs`.
  - Added an idempotent schema migration block that discovers and drops any existing `meeting_notes.agent_run_id -> agent_runs.id` FK constraint for already-provisioned environments.
  - Added schema regression coverage (`tests/larry-schema.test.ts`) that fails if `meeting_notes` reintroduces inline `agent_runs` FK coupling or if the detach migration block is removed.
  - Updated Phase 2.7 deprecation runbook/planning notes with Migration A forward intent, rollback intent, and FK pre/post validation query guidance.
- **Phase 2.7g Migration B+C FK detach (repo-level, compatibility-safe)**:
  - Updated `packages/db/src/schema.sql` so `email_outbound_drafts.action_id` and `correction_feedback.action_id` remain nullable compatibility columns but no longer declare inline FKs to `extracted_actions`.
  - Added idempotent schema migration blocks that discover and drop any existing FK constraints for:
    - `email_outbound_drafts.action_id -> extracted_actions.id`
    - `correction_feedback.action_id -> extracted_actions.id`
  - Extended schema regression coverage (`tests/larry-schema.test.ts`) to fail if either inline FK coupling is reintroduced or if either detach migration block is removed.
  - Updated Phase 2.7 deprecation runbook/checklist notes to mark Migration B/C repo-complete (environment execution pending), include forward/rollback plus pre/post validation SQL, and advance next repo migration target to Migration D.
- **Phase 2.7h Migration D child-table retirement + compatibility hardening (repo-level)**:
  - Retired extraction child tables in `packages/db/src/schema.sql` with explicit idempotent drops:
    - `approval_decisions`
    - `interventions`
    - `agent_run_transitions`
  - Removed child-table RLS/policy declarations and added schema regression coverage so those tables cannot be reintroduced silently.
  - Updated `packages/db/src/seed.ts` to stop inserting retired child-table rows while preserving legacy parent compatibility seeding (`agent_runs`, `extracted_actions`) for Migration E sequencing.
  - Updated `scripts/phase-2.7-extraction-rehearsal.mjs` row inventory behavior to be existence-aware, emitting per-table `tableStatus` (`present`/`retired`) with nullable counts for retired tables.
  - Updated Phase 2.7 deprecation runbook/checklist notes to mark Migration D repo-complete (environment execution pending) and advance the next repo migration target to Migration E parent retirement.
- **Phase 2.7i Migration E parent-table retirement + compatibility hardening (repo-level)**:
  - Retired extraction parent tables in `packages/db/src/schema.sql` with explicit idempotent drops:
    - `extracted_actions`
    - `agent_runs`
  - Removed retired parent-table baseline definitions and related RLS/policy declarations, while keeping Migration A/B/C detach blocks and compatibility columns in place.
  - Updated `packages/db/src/seed.ts` to stop inserting parent-table rows while preserving compatibility placeholder IDs for nullable `action_id` / `agent_run_id` metadata fields.
  - Extended schema regression coverage (`tests/larry-schema.test.ts`) to fail if parent-table definitions or Migration E drop intent regress.
  - Updated Phase 2.7 deprecation runbook/checklist notes to mark Migration E repo-complete (environment execution pending) and advance next follow-up to rollout evidence closeout + Cleanup F.
- **Phase 2.7j-1 Cleanup F operational contract closure (repo-level, operational core)**:
  - Canonicalized active operational contract artifacts away from retired extraction-era endpoints:
    - Updated `apps/api/openapi.yaml` to remove `/v1/agent/*` and legacy `/v1/actions/{id}/approve|reject|override` entries and represent canonical Larry endpoints.
    - Updated `scripts/demo-smoke-test.sh` to validate canonical transcript -> action-centre -> event-accept flow and removed legacy run/action polling seams.
    - Updated `apps/web/src/lib/pm-api.ts` to source pending actions from canonical `/v1/larry/action-centre` suggestions while preserving `WorkspaceSnapshot.pendingActions`.
  - Added focused boundary regression coverage (`tests/cleanup-f-operational-boundary.test.ts`) that fails if operational contract files reintroduce `/v1/agent/*` or legacy approve/reject/override references.
  - Re-synced tracker/runbook guidance and deferred broad historical docs sweep to follow-up work.
- **Phase 2.7j-2a Cleanup F docs boundary closure (repo-level, core runtime docs)**:
  - Canonicalized core runtime docs to reflect shipped Larry contracts and extraction-era runtime retirement:
    - Updated `docs/AI-AGENT.md`
    - Updated `docs/BACKEND-API.md`
    - Updated `docs/BACKEND-WORKER.md`
    - Updated `docs/DATABASE.md`
    - Updated `docs/ARCHITECTURE.md`
  - Removed active-path legacy `/v1/agent/*` and `/v1/actions/.../approve|reject|override` runtime narratives from the core runtime docs set.
  - Applied targeted stale-state correction in `docs/LARRY-INTELLIGENCE-PLAN.md` to reflect repo-retired extraction runtime tables with target-environment evidence still pending.
  - Added docs-boundary regression coverage (`tests/cleanup-f-docs-boundary.test.ts`) so core runtime docs fail CI if canonical endpoint references regress or legacy runtime seams are reintroduced.
  - Advanced next follow-up to Phase 2.7j-2b environment evidence closeout.
- **Phase 3 starter: Global Action Centre cutover**:
  - Extended the canonical Larry event summary contract with `projectName` so tenant-wide action-centre reads carry a project display label without stitched web-only joins.
  - Replaced the placeholder `/workspace/actions` page with a real workspace-native global Action Centre powered by `/api/workspace/larry/action-centre`, including cross-project labels, project links, and accept or dismiss controls on the canonical ledger path.
  - Added a shared project-or-global Larry action-centre hook so the project workspace and global Action Centre now reuse the same fetch, accept, dismiss, and targeted refresh behavior.
  - Confirmed dismiss is already implemented on both project and global Action Centre surfaces through the shared canonical ledger mutation path.
  - Wired the new surface into the active workspace shell and breadcrumb path without reviving the retired legacy `/api/workspace/actions` handlers.
  - Fixed the active workspace transcript modal copy and JSX so the web app boots cleanly again and the transcript-led smoke path stays runnable.
  - Added API coverage for tenant-wide action-centre reads plus a Playwright smoke that confirms the same suggestion appears in both `/workspace/actions` and the project Action Centre before and after acceptance.
- **Phase 3 follow-up: Email connector ledger cutover**:
  - Extended `/v1/connectors/email/inbound` to accept optional `projectId` and pass it through canonical ingest payloads.
  - Extended worker `canonical_event.created` handling so canonical email events with valid project scope now run intelligence and write source-linked `larry_events` with `sourceKind='email'` and `sourceRecordId=canonicalEventId`.
  - Added replay safety for email-driven ledger writes by skipping canonical email events that already have source-linked `larry_events`.
  - Added API and worker coverage for email canonical ingest payload shape, canonical event publication, email-to-ledger provenance, and replay skip behavior.
- **Phase 3 follow-up: Action Centre refresh convergence and coverage polish**:
  - Added shared Action Centre background refresh behavior in the active workspace hook with configurable polling plus focus and tab-visibility refresh triggers.
  - Added in-flight request coalescing so global and project Action Centre refreshes do not stack overlapping fetches during polling and mutation-driven refresh bursts.
  - Added Playwright coverage for global dismiss parity (global dismiss reflected in project Action Centre) and multi-project background refresh on `/workspace/actions` without manual refresh clicks or navigation.
  - Added a Playwright-only env override (`NEXT_PUBLIC_LARRY_ACTION_CENTRE_REFRESH_MS=1000`) so automated tests can validate background refresh behavior quickly without changing production defaults.
- **Phase 3 follow-up: Slack connector ledger onboarding**:
  - Added tenant-scoped `slack_channel_project_mappings` persistence with `(tenant_id, slack_team_id, slack_channel_id)` uniqueness, project linkage, recency indexes, and tenant RLS so Slack channel scope can resolve project context on the canonical runtime path.
  - Extended worker `canonical_event.created` handling so canonical Slack events now run intelligence and write source-linked `larry_events` (`sourceKind='slack'`, `sourceRecordId=canonicalEventId`) when project scope resolves from project hints or saved channel mappings.
  - Added Slack auto-learn mapping behavior so Slack events carrying both channel scope and valid project hints upsert the channel-to-project mapping, while events without hints can resolve through the saved mapping.
  - Added replay safety for Slack-driven ledger writes by skipping canonical Slack events that already have source-linked `larry_events`.
  - Added API and worker coverage for signed Slack webhook ingest payload shape, Slack canonical event publication, Slack canonical-event-to-ledger writes, mapped project fallback, and replay skip behavior.
- **Phase 3 follow-up: Calendar connector ledger onboarding**:
  - Extended worker `canonical_event.created` handling so canonical calendar events now resolve project hints from canonical payloads, run intelligence, and write source-linked `larry_events` (`sourceKind='calendar'`, `sourceRecordId=canonicalEventId`) when project scope is valid.
  - Added replay safety for calendar-driven ledger writes by skipping canonical calendar events that already have source-linked `larry_events`.
  - Extended Google Calendar webhook canonical ingest payloads to propagate a normalized `projectId` hint when present, preserving the existing signed webhook contract.
  - Updated project and global Action Centre provenance copy so calendar-origin non-chat events render signal-specific origin/meta text instead of chat fallback copy.
  - Added API and worker coverage for calendar webhook canonical payload shape, calendar canonical-event-to-ledger writes, missing-scope skip behavior, and replay skip behavior.
- **Phase 3 follow-up: Global linked-chat UX expansion**:
  - Preserved the existing global Action Centre quick-jump behavior (`Open linked chat`) that opens the floating Larry panel and loads the linked conversation directly.
  - Added an additive rich launch path (`Open in chats`) on both suggestion and activity cards that deep-links to `/workspace/chats` with project, conversation, launch source, provenance source kind, and event-type context.
  - Updated `/workspace/chats` query bootstrap precedence so `draft` still wins, then explicit `conversationId`, then project-first fallback behavior.
  - Added an Action Centre launch-context banner in `/workspace/chats` with project framing, normalized source label, event status context, and a direct return link to `/workspace/actions`.
  - Added targeted Playwright coverage validating linked-chat launch consistency and deep-link context rendering across both suggestion and activity cards.
- **Phase 3 follow-up: Metadata normalization closure**:
  - Hardened Larry event context normalization in `@larry/db` so every new event now enforces `sourceKind`, source-linkage requirements (`sourceRecordId` for chat/meeting/email/slack/calendar/briefing/schedule), chat linkage requirements (`conversationId`, request/response message IDs, requester), and login requester requirements before insert.
  - Updated login briefing generation to pre-generate `briefingId`, pass `sourceRecordId=briefingId` into `runAutoActions` and `storeSuggestions`, and persist the briefing row with the same ID while keeping source-record backfill as idempotent safety.
  - Updated scheduled scan ledger writes to stamp a per-project `sourceRecordId` so schedule-origin actions satisfy provenance linkage requirements without introducing synthetic requesters.
  - Added API and worker contract coverage updates so briefing and scheduled-scan Larry writes fail regression checks if required provenance linkage metadata is omitted.
- **Phase 2.7j-2b-1 deployed canonical preflight unblock**:
  - Ran deployed baseline rehearsal and captured blocked artifact evidence in:
    - `plans/phase-2.7-artifacts/2026-03-29T22-17-41-761Z__railway-prod__deployed-preflight-blocked__11111111.{json,md}`
  - Captured pre-DDL migration baseline evidence for target environment FK/table state and row counts in:
    - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-1-notes.md`
  - Applied non-destructive target-environment M0 alignment on `larry_events` (add missing canonical linkage/provenance columns, backfills, and required indexes) without running A/B/C/D/E table retirement.
  - Re-ran deployed rehearsal and captured post-alignment artifact evidence in:
    - `plans/phase-2.7-artifacts/2026-03-29T22-18-18-863Z__railway-prod__deployed-preflight-aligned__11111111.{json,md}`
  - Unblocked canonical preflight (`status=ok`, `preflight passed`) while surfacing high/medium anomaly follow-ups that must be triaged before destructive retirement execution.
- **Phase 2.7j-2b-2a anomaly waiver packet + operator command pack (repo-prep)**:
  - Re-ran deployed canonical rehearsal read-only on Railway prod (`2026-03-29T22:25:35.771Z`) and confirmed no gate movement:
    - `status=ok`, preflight passed,
    - anomaly counts unchanged (`missing_source_record_links`, `invalid_chat_linkage`, `meeting_action_count_mismatch`),
    - A/B/C FK dependencies and D/E legacy tables still present.
  - Added committed anomaly triage/waiver dossier:
    - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md`
    - Includes baseline counts, rationale, waiver defaults, owner/reviewer placeholders, due date, and explicit "no post-baseline growth" gate rule.
  - Added deterministic J2b-2b operator command pack in Phase 2.7 runbook docs:
    - pre-checks (rehearsal + FK/table validation),
    - staged A/B/C then D/E execution,
    - post-check/rollback command blocks,
    - sign-off metadata template.
  - Corrected tracker language for transcript runtime reality: `/v1/larry/transcript` still performs inline intelligence writes alongside canonical event enqueue (known residual seam).
- **Phase 2.7j-2b-2b anomaly-gated retirement execution (in progress, reviewer-gated)**:
  - Ran a fresh deployed J2b-2b pre-check rehearsal and committed artifacts:
    - `plans/phase-2.7-artifacts/2026-03-29T22-43-10-868Z__railway-prod__deployed-preflight-j2b-2b-gate__11111111.{json,md}`
    - `status=ok`, preflight passed, anomaly counts unchanged from J2b-2a baseline.
  - Ran growth-gate and FK/table baseline queries and captured outputs in:
    - `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2b-precheck-notes.md`
    - Growth-gate deltas all `0`; A/B/C FK dependencies plus D/E tables still present as expected pre-execution.
  - Updated anomaly dossier sign-off fields:
    - Engineer `Fergus`, Rollback owner `Fergus`, Reviewer pending.
    - Decision set to `blocked` until reviewer assignment/sign-off is completed.
  - Did not execute destructive A/B/C/D/E SQL in this slice because reviewer gate is unmet.

### Still To Do For Phase 1

- Remove or fully fence the remaining legacy dashboard shell and dashboard-only create flows from production behavior, not just from active navigation.
- Retire `/api/workspace/snapshot` after all remaining legacy dashboard consumers are migrated or deleted.
- Remove or archive workspace code that is now inactive on the production path:
  - legacy `ProjectWorkspace`
  - legacy `StartProjectFlow`
  - legacy dashboard data hooks and route-driven state composition
- Add targeted tests for the remaining scoped workspace contracts and the new intake flows; the active project Larry chat and Action Centre path now has smoke coverage, but the workspace cutover is not fully covered yet.

### Still To Do For Phase 2

- Continue consolidating connector-triggered Larry actions onto the same canonical Larry ledger contract as legacy paths are retired; chat, transcript, login briefing, scheduled scan, email, Slack, and calendar are now onboarded on the canonical path.
- Assign reviewer and complete approval status in `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md` (engineer + rollback owner are now set).
- Re-run deployed rehearsal and growth-gate/FK/table baselines at migration window start and confirm no post-baseline anomaly growth.
- Execute Migration A/B/C in target environments after anomaly/sign-off gates clear and capture FK-detach validation outputs.
- Execute Migration D/E table retirements in target environments after anomaly/sign-off gates clear and capture table-retirement validation outputs.
- Record rollout sign-off metadata (engineer, reviewer, rollback owner, deploy window, evidence links) in Phase 2.7 runbook notes.
- Complete any residual non-core docs sweep work found during evidence closeout; core runtime docs sweep + guard are complete in J2a.
- Continue retiring or fencing any remaining legacy Larry read/write paths beyond the now-fenced conversation writes and event-list reads as canonical contracts replace them.
- Known residual seam to schedule: `/v1/larry/transcript` still performs inline intelligence writes alongside canonical event enqueue; queue-only transcript execution cutover remains pending.

### Recommended Next Slice

- **Phase 2.7j-2b-2b completion follow-up: reviewer unlock + staged retirement execution (target environments)**:
  - Assign reviewer/sign-off in `plans/phase-2.7-artifacts/2026-03-29__railway-prod__j2b-2a-anomaly-waiver-dossier.md` and move decision from `blocked` to `approved`.
  - Re-run J2b-2b pre-check command pack at migration window start (rehearsal + growth-gate + FK/table baseline) and verify no drift from current baseline.
  - Execute staged A/B/C FK detaches then D/E retirements in target environments and capture documented pre/post validation evidence.
  - Record final sign-off owners, rollback owner, migration window, and evidence links in Phase 2.7 runbook notes.

---

## Phase 1: Workspace Cutover And Data-Plane Reset

**User stories**:
- As a user, I interact with one coherent workspace product surface, not overlapping old and new shells.
- As a team, we can extend the workspace without inheriting duplicated route trees and inconsistent data loading patterns.

### What to build

Deliver a single canonical workspace slice by cutting active product behavior fully onto `/workspace`, retiring legacy dashboard entry points, and replacing the most fragile snapshot-driven reads with explicit scoped workspace read models. The goal is a stable home page and project workspace path that future phases can safely build on.

### Acceptance criteria

- [ ] `/workspace` is the only active product surface for workspace behavior and project creation entry points.
- [ ] Legacy dashboard-only flows are retired, redirected, or clearly fenced off from production behavior.
- [x] The home and project workspace views read from scoped workspace data contracts instead of depending on one broad snapshot for everything.
- [x] The project workspace has stable slots for context, Action Centre, and project Larry chat so later phases deepen one canonical surface instead of creating parallel UIs.
- [x] A single project workspace path is demoable end-to-end on the new data plane.

### Suggested ownership

- Route-tree cutover and deprecation
- Workspace read-model reset
- UI state and data-fetching cleanup

---

## Phase 2: Larry Runtime Consolidation

**User stories**:
- As a PM, I can trust that Larry actions, approvals, and chat history come from one coherent runtime.
- As an engineer, I can extend Larry behavior without choosing between two competing data models.

### What to build

Consolidate Larry onto one canonical runtime by establishing `larry_events`, conversation history, and approval or execution state as the source of truth for new behavior. Migrate or fence legacy extraction-led tables so future features do not branch across two action systems.

### Acceptance criteria

- [ ] New Larry behavior writes only to the canonical Larry runtime model.
- [ ] Project chat, transcript-driven suggestions, and scheduled or signal-driven actions are visible through the same action ledger.
- [ ] Conversation turns and resulting actions share stable linkage and attribution fields so histories can show what actions each chat created and who requested, approved, or executed them.
- [ ] The system exposes a clear migration boundary between canonical Larry data and legacy data.
- [ ] No new UI behavior depends on the legacy extraction-led pipeline.

### Suggested ownership

- Canonical Larry runtime schema and migration
- Unified event and approval contracts
- Legacy-path deprecation and compatibility

---

## Phase 3: Event-Driven Action Centre And Provenance

**User stories**:
- As a PM, I can open a project or the global Action Centre and see the same Larry actions with clear provenance.
- As a collaborator, I can tell what action was created, where it came from, and who requested, approved, or executed it.

### What to build

Create a real Action Centre built on the consolidated Larry runtime and event-driven updates. Every Larry action should carry project scope, source taxonomy, requester and actor attribution, linked source context, and lifecycle state so project and cross-project views are reading one provenance-rich ledger.

### Acceptance criteria

- [x] A dedicated `/workspace/actions` surface exists and reads from the same action ledger as the project workspace.
- [x] Each project dashboard exposes its own Action Centre view backed by the same canonical ledger as the global Action Centre.
- [x] Every new Larry action includes normalized source, requester, actor, and linked context metadata.
- [x] Project-level and global Action Centre views stay consistent without manual refresh choreography.
- [x] Connector and transcript events can create or update visible Larry actions through the canonical event-driven path.

### Suggested ownership

- Provenance-rich action ledger
- Project and global Action Centre UI
- Event-driven action updates

---

## Phase 4: Project Memory And Context Timeline

**User stories**:
- As a user, I want Larry to retain project context over time instead of re-deriving everything from current tasks only.
- As a PM, I want to inspect the memory Larry is using for a project.

### What to build

Add a durable project memory layer fed by direct chat, meetings, accepted Larry actions, and connector signals. Larry uses this memory in reasoning, and the project workspace exposes a source-filterable context timeline so the user can inspect what Larry is carrying forward.

### Acceptance criteria

- [ ] Project memory entries are written from chat, meetings, accepted actions, and connector signals.
- [ ] Larry reasoning reads from project memory in addition to current workspace state.
- [ ] The project workspace exposes a context timeline with source and record linkage.
- [ ] Memory writes are tied to canonical Larry and connector records rather than ad hoc text blobs.

### Suggested ownership

- Project memory model and ingestion
- Memory retrieval in Larry runtime
- Context timeline UI

---

## Phase 5: Unified Project Intake

**User stories**:
- As a user, I can create a project manually, through a structured chat with Larry, or from a meeting transcript.
- As a PM, I can start from a meeting and bootstrap a project without relying on a legacy side flow.

### What to build

Deliver one project intake route with three supported modes: manual, chat, and meeting. All three paths land in the same canonical flow, produce a live project or reviewable project draft, and immediately connect the result to the Action Centre and project memory model.

### Acceptance criteria

- [x] `/workspace/projects/new` is the canonical intake route with manual, chat, and meeting modes.
- [ ] Manual, chat, and meeting intake all feed the same project draft and bootstrap contracts.
- [ ] Chat intake can propose starter tasks and actions without requiring a pre-existing project.
- [ ] Meeting intake can create a new project draft or attach the meeting to an existing project cleanly.

### Suggested ownership

- Unified intake route and draft model
- Chat bootstrap orchestration
- Meeting-to-project bootstrap flow

---

## Phase 6: Clarification-First Chat, Task Management, And Governed Auto-Execution

**User stories**:
- As a user, Larry asks follow-up questions before acting on vague instructions.
- As a PM, Larry only auto-executes actions that are clearly low-risk and within authority.
- As a collaborator, I can see and refine planned actions before they run.
- As a user, Larry can create and update project-scoped tasks through chat.

### What to build

Turn Larry chat into a real planning and confirmation loop. Add ambiguity handling, task and action preview, context enrichment, confirmation, authority checks, and a single policy path for chat, signals, and fallback scans. This is the point where Larry becomes trustworthy rather than merely responsive.

### Acceptance criteria

- [ ] Ambiguous requests trigger clarification instead of silent failure or premature execution.
- [ ] Chat shows a reviewable action plan before executing medium- or high-impact actions.
- [ ] Larry enriches planned tasks and actions with available project context and asks for any missing required details before execution.
- [ ] Auto-execution checks policy eligibility, user authority, action risk, and audit-safety before proceeding without approval.
- [ ] Unambiguous low-risk actions can run automatically, while medium-risk, high-risk, externally visible, or destructive actions require explicit user confirmation.
- [ ] Larry can create and update project-scoped tasks through the same governed flow used for other action types.
- [ ] Chat, connector-triggered actions, and fallback scans use the same execution policy path.

### Suggested ownership

- Clarification and planning state machine
- Policy and authority engine
- Chat confirm and refine UX

---

## Phase 7: Project Collaboration, Shared Larry, And Notes

**User stories**:
- As a PM, I can add multiple real users to a project.
- As a collaborator, I can participate in shared project Larry conversations and see who did what.
- As a user, I can send shared or personal notes to collaborators, optionally drafted by Larry.

### What to build

Introduce project-scoped collaboration on top of tenant membership. Add project members, shared project Larry threads, explicit actor attribution in conversations and actions, collaborator updates through the governed action system, and project notes with shared and personal visibility modes.

### Acceptance criteria

- [ ] Projects have project-scoped collaboration membership and role management.
- [ ] Project Larry conversations can be shared across project collaborators.
- [ ] Project chat history is expandable and shows actor attribution, approvals, and resulting actions clearly.
- [ ] Shared notes and personal notes exist inside project collaboration surfaces with correct visibility rules.
- [ ] Users can draft and send collaborator notes, including Larry-drafted personal notes addressed to specific project members.
- [ ] Larry can propose and, where permitted, execute project collaborator updates through the canonical action system.

### Suggested ownership

- Project membership and permissions
- Shared Larry conversation model
- Notes and collaborator UX

---

## Phase 8: Communications, Documents, Templates, And Task Attachments

**User stories**:
- As a user, Larry can draft emails and letters from project context.
- As a user, Larry can create `.docx` and `.xlsx` skeletons from project or task context.
- As a PM, generated documents live in project documentation and can be attached to tasks.

### What to build

Replace the placeholder document experience with a storage-backed project asset and communication draft system. Larry can draft emails and letters, generate project and task templates, store them as reviewable assets, attach them to tasks, and surface them consistently in project documentation and task detail views.

### Acceptance criteria

- [ ] Larry can draft reviewable emails and letters from project context, with actor attribution and approval state.
- [ ] Larry can generate at least one document skeleton and one spreadsheet skeleton.
- [ ] Documents are stored as project assets with source, creator, version, and linkage metadata.
- [ ] Tasks can reference attached documents directly.
- [ ] Larry can create and update document records and task attachments through the canonical action system.
- [ ] The project documents experience is no longer a thin wrapper around meeting summaries.

### Suggested ownership

- Asset-backed document model
- Communication and template generation flow
- Documents and attachment UI

---

## Phase 9: Calendar Context And Global Larry

**User stories**:
- As a PM, calendar activity contributes to project context automatically.
- As a user, I can use Larry globally across all accessible projects.
- As a user, Larry can propose or create calendar events through the same governed action system.

### What to build

Make Google Calendar a first-class project context source and extend Larry into a true cross-project assistant. Calendar signals should write into project memory, calendar actions should go through the canonical action ledger, and global Larry should retrieve across projects while preserving project-level grouping and permissions.

### Acceptance criteria

- [ ] Calendar signals are linked to projects and written into project memory.
- [ ] Larry can propose and, where permitted, create or update calendar events.
- [ ] Calendar reads and writes use the same governed policy, authority, and audit path as other Larry actions.
- [ ] Users can start a global Larry conversation without selecting a project first.
- [ ] Global responses and proposed actions are grouped by project and respect project visibility.

### Suggested ownership

- Calendar-to-project linkage
- Calendar action types and execution
- Global Larry retrieval and grouped response UX

---

## Phase 10: Project Deletion, Migration Cleanup, And Launch Hardening

**User stories**:
- As an admin or PM, I can archive or delete a project safely.
- As a team, we can trust the platform because old paths are retired and core flows are tested end-to-end.

### What to build

Finish the platform by adding archive and delete lifecycle support, removing superseded paths, completing migration cleanup, and hardening the end-to-end system. This phase closes the gap between "new architecture exists" and "the old architecture is no longer a risk."

### Acceptance criteria

- [ ] Projects can be archived or deleted with confirmation, audit, and cleanup behavior.
- [ ] Legacy dashboard and legacy Larry paths are removed or fully isolated from active behavior.
- [ ] Event-driven updates are the canonical runtime path, with scheduled scans relegated to fallback and hygiene roles.
- [ ] Security, performance, and reliability gates are met for core workspace, chat, action, document, calendar, and deletion flows.
- [ ] End-to-end tests cover intake, project chat, approvals, auto-execution, collaboration, documents, calendar, global Larry, and deletion.

### Suggested ownership

- Archive and delete lifecycle
- Legacy-path removal and migration completion
- End-to-end reliability and observability

---

## Recommended Execution Strategy

- Do **not** implement this in one run unless the goal is a throwaway prototype. The repo needs consolidation before it needs breadth.
- Treat **Phases 1-3** as mandatory foundation. They remove route overlap, reset the data plane, unify Larry runtime behavior, and establish event-driven provenance.
- Treat **Phases 4-6** as the second foundation band. They establish project memory, unified intake, and clarification-first governed execution.
- Treat **Phases 7-9** as expansion phases that become much safer once the runtime and workspace foundations are stable.
- Treat **Phase 10** as both final hardening and debt retirement. It is where the plan proves it truly replaced the fragile base instead of hiding it.

## Agent-Ready Decomposition

- Keep ownership disjoint within each phase:
  - route and data-plane cutover plus schema migration
  - Larry runtime and worker behavior
  - workspace UI and interaction flow
  - tests, observability, and migration cleanup
- Require every agent-owned slice to remove or deprecate the old path it replaces.
- Avoid parallel work across the same canonical model in the same phase.
- Prefer one thin end-to-end cutover at a time over broad layer-by-layer rewrites.
- Use the Requirement Coverage Matrix as the delegation contract so no agent-owned slice quietly drops part of the report.

