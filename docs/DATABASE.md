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
| `project_intake_drafts` | Durable unified intake drafts (manual/chat/meeting, bootstrap preview, finalization metadata) |
| `tasks` | Project tasks |
| `task_dependencies` | Task dependency graph |
| `task_comments` | Task-level discussion |
| `meeting_notes` | Meeting transcript/summary records |

### Canonical Larry Runtime
| Table | Purpose |
|-------|---------|
| `canonical_events` | Normalized source ingest events |
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
| `google_calendar_installations` | Calendar OAuth/watch metadata |
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
- `project_intake_drafts` includes tenant RLS policy (`tenant_isolation_project_intake_drafts`) and recency/status/mode indexes for intake runtime access paths.
- Seed data includes one deterministic `project_intake_drafts` fixture row so local/demo environments exercise the new intake contract.
