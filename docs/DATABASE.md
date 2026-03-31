# Larry - Database

## Connection

- Schema: `packages/db/src/schema.sql`
- Migration runner: `packages/db/src/migrate.ts`
- Seed: `packages/db/src/seed.ts`
- Client: `packages/db/src/index.ts`

```bash
cd packages/db
npm run migrate
npm run seed
```

## Key Tables

### Tenancy and Identity
| Table | Purpose |
|-------|---------|
| `tenants` | Tenant boundary |
| `users` | User accounts |
| `memberships` | Tenant membership and role |

### Workspace Core
| Table | Purpose |
|-------|---------|
| `projects` | Project records |
| `project_memberships` | Project-scoped collaborator membership (`owner` / `editor` / `viewer`) |
| `project_notes` | Shared and personal project collaborator notes |
| `project_intake_drafts` | Durable unified intake drafts (manual/chat/meeting, bootstrap preview, finalization metadata) |
| `tasks` | Project tasks |
| `task_dependencies` | Task dependency graph |
| `task_comments` | Task-level discussion |
| `documents` | Project document assets (`doc_type`, source linkage, version, metadata) |
| `task_document_attachments` | Task to document linkage table |
| `meeting_notes` | Meeting transcript/summary records |

### Canonical Larry Runtime
| Table | Purpose |
|-------|---------|
| `canonical_events` | Normalized source ingest events |
| `canonical_event_processing_attempts` | Runtime reliability ledger for canonical event queue attempts (`running`, `succeeded`, `retryable_failed`, `dead_lettered`) |
| `larry_conversations` | Conversation sessions |
| `larry_messages` | Message history with actor attribution |
| `larry_events` | Action-centre ledger with lifecycle/provenance |
| `larry_briefings` | Generated briefing payloads |
| `correction_feedback` | User correction records |

### Connectors and Messaging
| Table | Purpose |
|-------|---------|
| `slack_installations` | Slack OAuth installation metadata |
| `slack_channel_project_mappings` | Slack channel to project mapping |
| `google_calendar_installations` | Calendar OAuth/watch metadata with optional default project linkage |
| `email_installations` | Email connector installation metadata |
| `email_outbound_drafts` | Outbound draft records |

### Audit and Reporting
| Table | Purpose |
|-------|---------|
| `audit_log` | Immutable audit events |
| `notifications` | User notifications |
| `risk_snapshots` | Risk snapshot history |
| `report_snapshots` | Reporting snapshots |
| `tenant_policy_settings` | Tenant-level policy configuration |
| `org_invites` | Org request/approval flow |

## Tenant Isolation Pattern

All product tables include `tenant_id`. RLS policies and tenant-scoped query helpers enforce isolation.
Use tenant-aware query helpers consistently in API and worker code.

## Migration Notes

- Run schema migration before API/worker deployment.
- Restart API and worker after schema changes.
- For remote databases, validate connectivity before migration execution.
- `project_memberships` includes:
  - primary key `(tenant_id, project_id, user_id)`
  - role check constraint (`owner|editor|viewer`)
  - indexes on `(tenant_id, project_id, updated_at)` and `(tenant_id, user_id, updated_at)`
  - tenant RLS policy (`tenant_isolation_project_memberships`)
  - idempotent backfill:
    - project owner -> `owner`
    - existing tenant members on each project -> `viewer`
- `project_notes` includes:
  - visibility check (`shared|personal`)
  - recipient constraint: shared notes require `recipient_user_id IS NULL`; personal notes require non-null recipient
  - indexes on `(tenant_id, project_id, created_at)` and `(tenant_id, recipient_user_id, created_at)`
  - tenant RLS policy (`tenant_isolation_project_notes`)
- `project_intake_drafts` includes tenant RLS policy (`tenant_isolation_project_intake_drafts`) and recency/status/mode indexes for intake runtime access paths.
- `documents` includes additive asset fields (`source_kind`, `source_record_id`, `version`, `metadata`, `updated_at`) and recency/source lookup indexes:
  - `idx_documents_tenant_project_updated`
  - `idx_documents_tenant_doc_type_updated`
  - `idx_documents_tenant_source`
- `task_document_attachments` includes:
  - uniqueness guard `(tenant_id, task_id, document_id)`
  - recency indexes for task/document lookups
  - tenant RLS policy (`tenant_isolation_task_document_attachments`)
- `google_calendar_installations` includes additive default-linkage support:
  - nullable `project_id` (`ON DELETE SET NULL`)
  - tenant/project recency lookup index `idx_google_calendar_installations_tenant_project`
- `canonical_event_processing_attempts` includes additive runtime-reliability coverage:
  - unique guard `(tenant_id, canonical_event_id, attempt_number)`
  - bounded status check (`running|succeeded|retryable_failed|dead_lettered`)
  - recency/filter indexes:
    - `idx_canonical_event_processing_attempts_tenant_status_started`
    - `idx_canonical_event_processing_attempts_tenant_source_status_started`
    - `idx_canonical_event_processing_attempts_tenant_canonical_attempt`
  - tenant RLS policy (`tenant_isolation_canonical_event_processing_attempts`)
- `projects.status` is hardened to the archive lifecycle enum surface:
  - stored values are constrained to `active|archived`
  - additive normalization backfills unexpected/null values to `active`
  - archive-aware recency index: `idx_projects_tenant_status_recent (tenant_id, status, updated_at DESC, created_at DESC)`
- Project hard-delete runtime contract (`POST /v1/projects/:id/delete`) explicitly purges project-linked rows from:
  - `meeting_notes`
  - `documents`
  - `email_outbound_drafts`
  - `larry_conversations`
  before deleting the `projects` row. This avoids leaving retained `ON DELETE SET NULL` artifacts for hard-deleted projects.
- Legacy compatibility columns remain in schema (`meeting_notes.agent_run_id`, `email_outbound_drafts.action_id`), but runtime insert paths no longer explicitly write `NULL` into those columns.
- Seed data includes one deterministic `project_intake_drafts` fixture row so local/demo environments exercise the new intake contract.
- Seed data includes deterministic `project_memberships` rows (including a multi-user project) so collaboration access is visible in local/demo environments.
- Seed data includes deterministic `project_notes` rows (shared and personal) for workspace-note demos.
- Seed data includes deterministic document assets (`email_draft`, `docx_template`, `xlsx_template`) and one task-document attachment row.
- Seed data includes deterministic `canonical_event_processing_attempts` fixtures for one retryable-failed and one dead-lettered canonical event example.
- Seed data now includes one deterministic archived project fixture with:
  - collaborator memberships
  - one archived task
  - one archived meeting note
