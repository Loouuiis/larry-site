# Larry — Database

## Connection

- Schema file: `packages/db/src/schema.sql`
- Migration runner: `packages/db/src/migrate.ts` — **must be run from the `packages/db/` directory**
- Seed: `packages/db/src/seed.ts`
- Client: `packages/db/src/index.ts` — exports `getDb()` pool

```bash
cd packages/db && npm run migrate && npm run seed
```

## Key Tables

### Tenancy & Users
| Table | Purpose |
|-------|---------|
| `tenants` | Top-level tenant isolation unit |
| `users` | User accounts scoped to tenants |
| `memberships` | User↔tenant membership + role (admin/pm/viewer) |

### Workspace Core
| Table | Purpose |
|-------|---------|
| `projects` | Projects with status, risk, created_by |
| `tasks` | Tasks with status, priority, due_date, assignee, project_id |
| `dependencies` | Task dependency graph |
| `comments` | Per-task comments |
| `meeting_notes` | Meeting note records with transcript |

### Agent Pipeline
| Table | Purpose |
|-------|---------|
| `canonical_events` | Normalised events from all channels (source, actor, payload) |
| `agent_runs` | Lifecycle tracking per canonical event (state machine) |
| `agent_run_transitions` | State transition history per run |
| `extracted_actions` | Proposed actions with actionType, payload, confidence, reasoning, state |
| `approval_decisions` | Approve/reject/override records |
| `interventions` | Per-action intervention decisions |
| `correction_feedback` | User corrections fed back into policy tuning |

### Connectors
| Table | Purpose |
|-------|---------|
| `slack_installations` | Slack OAuth tokens + workspace metadata per tenant |
| `google_calendar_installations` | Google Calendar OAuth tokens + watch channel metadata |
| `email_installations` | Email connector state (mock only in v1) |
| `email_outbound_drafts` | Outbound email drafts pending send |

### Reporting & Audit
| Table | Purpose |
|-------|---------|
| `audit_log` | Immutable log of all high-value mutations |
| `risk_snapshots` | Per-project risk score snapshots (deduped: one per project per day) |
| `report_snapshots` | Weekly summary and outcome reports |
| `notifications` | User notifications with unique constraint for dedup |
| `tenant_policy_settings` | Per-tenant AI confidence threshold overrides |
| `org_invites` | Organisation access request queue (pending/approved) |

### Larry Chat
| Table | Purpose |
|-------|---------|
| `larry_conversations` | Conversation sessions with optional projectId |
| `larry_messages` | Individual messages within conversations |

## Tenant Isolation Pattern

All tables include `tenant_id UUID NOT NULL`. Row-Level Security policies enforce isolation:
- Default policy: `WHERE tenant_id = current_setting('app.tenant_id')::uuid`
- System policy: `WHERE tenant_id = '__system__'` — used for webhook workspace resolution

Every query must set `app.tenant_id` before executing. Use `fastify.db.queryTenant(tenantId, sql, params)` — never raw queries without tenant scoping.

## Migration Notes

- Migrations are run in-order from `packages/db/src/migrations/` (or embedded in `schema.sql`)
- `npm run db:migrate` from repo root calls the migration runner
- After schema changes: restart API + worker to pick up new columns
- Neon remote DB: test connectivity with `SELECT 1` before assuming migration success
