CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('admin', 'pm', 'member', 'executive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('backlog', 'not_started', 'in_progress', 'waiting', 'completed', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE action_state AS ENUM ('pending', 'approved', 'rejected', 'overridden', 'executed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_run_state AS ENUM (
    'INGESTED',
    'NORMALIZED',
    'EXTRACTED',
    'PROPOSED',
    'APPROVAL_PENDING',
    'EXECUTED',
    'VERIFIED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL DEFAULT 'eu-west-1',
  data_retention_days INT NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  slug_candidate TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  team_size TEXT,
  launch_context TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tenant_slug TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_status_created
  ON org_invites (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_invites_requester_email
  ON org_invites (requester_email, created_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_tenant
  ON refresh_tokens (tenant_id, user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived')),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level risk_level NOT NULL DEFAULT 'low',
  start_date DATE,
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  larry_context TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_status_recent
  ON projects (tenant_id, status, updated_at DESC, created_at DESC);

-- Phase 10: harden project archive status values before enabling archive lifecycle routes.
UPDATE projects
SET status = 'active'
WHERE status IS NULL
   OR status NOT IN ('active', 'archived');

ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'active';

DO $$ BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('active', 'archived'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Phase 7: project-scoped collaboration membership model
CREATE TABLE IF NOT EXISTS project_memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_tenant_project
  ON project_memberships (tenant_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_memberships_tenant_user
  ON project_memberships (tenant_id, user_id, updated_at DESC);

-- Phase 7 follow-up: project shared/personal notes
CREATE TABLE IF NOT EXISTS project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('shared', 'personal')),
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_kind TEXT,
  source_record_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_notes_visibility_recipient_check CHECK (
    (visibility = 'shared' AND recipient_user_id IS NULL)
    OR (visibility = 'personal' AND recipient_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_project_notes_tenant_project_created
  ON project_notes (tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_notes_tenant_recipient_created
  ON project_notes (tenant_id, recipient_user_id, created_at DESC);

-- Backfill owner memberships from existing projects.
INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
SELECT p.tenant_id, p.id, p.owner_user_id, 'owner'
FROM projects p
WHERE p.owner_user_id IS NOT NULL
ON CONFLICT (tenant_id, project_id, user_id)
DO UPDATE SET role = 'owner', updated_at = NOW();

-- Backfill viewer memberships so current tenant members retain project access.
INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
SELECT p.tenant_id, p.id, m.user_id, 'viewer'
FROM projects p
JOIN memberships m ON m.tenant_id = p.tenant_id
ON CONFLICT (tenant_id, project_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'not_started',
  priority task_priority NOT NULL DEFAULT 'medium',
  assignee_user_id UUID REFERENCES users(id),
  created_by_user_id UUID REFERENCES users(id),
  progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level risk_level NOT NULL DEFAULT 'low',
  start_date DATE,
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to_larry BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by_larry BOOLEAN NOT NULL DEFAULT FALSE,
  larry_document_id UUID REFERENCES larry_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project ON tasks (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (tenant_id, assignee_user_id);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'finish_to_start',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_tenant_task ON task_comments(tenant_id, task_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  activity_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_raw_events_tenant_source ON raw_events (tenant_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS canonical_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  raw_event_id UUID REFERENCES raw_events(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_created
  ON canonical_events (tenant_id, created_at DESC);

-- Phase 12: runtime reliability ledger for canonical event processing attempts.
CREATE TABLE IF NOT EXISTS canonical_event_processing_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canonical_event_id UUID NOT NULL REFERENCES canonical_events(id) ON DELETE CASCADE,
  queue_job_id TEXT,
  queue_job_name TEXT NOT NULL DEFAULT 'canonical_event.created',
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'retryable_failed', 'dead_lettered')),
  attempt_number INT NOT NULL CHECK (attempt_number >= 1),
  max_attempts INT NOT NULL CHECK (max_attempts >= 1),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  error_message TEXT,
  error_stack TEXT,
  error_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, canonical_event_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_canonical_event_processing_attempts_tenant_status_started
  ON canonical_event_processing_attempts (tenant_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_event_processing_attempts_tenant_source_status_started
  ON canonical_event_processing_attempts (tenant_id, source, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_event_processing_attempts_tenant_canonical_attempt
  ON canonical_event_processing_attempts (tenant_id, canonical_event_id, attempt_number DESC, started_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  channel TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_scope TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_user_key TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_date DATE;
ALTER TABLE notifications ALTER COLUMN dedupe_user_key SET DEFAULT '__broadcast__';
ALTER TABLE notifications ALTER COLUMN dedupe_date SET DEFAULT CURRENT_DATE;

UPDATE notifications
SET dedupe_user_key = COALESCE(dedupe_user_key, COALESCE(user_id::text, '__broadcast__')),
    dedupe_date = COALESCE(dedupe_date, created_at::date)
WHERE dedupe_user_key IS NULL
   OR dedupe_date IS NULL;

WITH ranked_notifications AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, COALESCE(user_id::text, '__broadcast__'), channel, subject, created_at::date
           ORDER BY created_at ASC, id ASC
         ) AS row_number
  FROM notifications
)
DELETE FROM notifications
WHERE id IN (
  SELECT id
  FROM ranked_notifications
  WHERE row_number > 1
);

UPDATE notifications
SET dedupe_user_key = COALESCE(dedupe_user_key, COALESCE(user_id::text, '__broadcast__')),
    dedupe_date = COALESCE(dedupe_date, created_at::date)
WHERE dedupe_user_key IS NULL
   OR dedupe_date IS NULL;

ALTER TABLE notifications ALTER COLUMN dedupe_user_key SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN dedupe_date SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_notifications_dedup'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT uq_notifications_dedup
      UNIQUE (tenant_id, dedupe_scope, dedupe_user_key, channel, subject, dedupe_date);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS slack_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  slack_team_id TEXT NOT NULL UNIQUE,
  slack_team_name TEXT,
  slack_enterprise_id TEXT,
  slack_bot_user_id TEXT,
  slack_scope TEXT,
  app_id TEXT,
  bot_access_token TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_installations_tenant
  ON slack_installations (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS slack_channel_project_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slack_team_id TEXT NOT NULL,
  slack_channel_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slack_team_id, slack_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_channel_project_mappings_tenant_project
  ON slack_channel_project_mappings (tenant_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_slack_channel_project_mappings_team_channel
  ON slack_channel_project_mappings (tenant_id, slack_team_id, slack_channel_id);

CREATE TABLE IF NOT EXISTS google_calendar_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_access_token TEXT NOT NULL,
  google_refresh_token TEXT,
  google_scope TEXT,
  token_expires_at TIMESTAMPTZ,
  webhook_channel_id TEXT UNIQUE,
  webhook_resource_id TEXT,
  webhook_expiration TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, google_calendar_id)
);

ALTER TABLE google_calendar_installations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_google_calendar_installations_tenant
  ON google_calendar_installations (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_calendar_installations_tenant_project
  ON google_calendar_installations (tenant_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS outlook_calendar_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  outlook_calendar_id TEXT NOT NULL DEFAULT 'primary',
  outlook_access_token TEXT NOT NULL,
  outlook_refresh_token TEXT,
  outlook_scope TEXT,
  token_expires_at TIMESTAMPTZ,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, outlook_calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_outlook_calendar_installations_tenant
  ON outlook_calendar_installations (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_outlook_calendar_installations_tenant_project
  ON outlook_calendar_installations (tenant_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS email_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'generic',
  account_email TEXT NOT NULL,
  provider_account_id TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_scope TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  webhook_secret TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_email)
);

CREATE INDEX IF NOT EXISTS idx_email_installations_tenant
  ON email_installations (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS email_outbound_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  action_id UUID,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_outbound_drafts_tenant_state
  ON email_outbound_drafts (tenant_id, state, created_at DESC);

-- Phase 2.7g: detach email_outbound_drafts.action_id from legacy extracted_actions FK.
DO $$
DECLARE
  fk_constraint_name TEXT;
BEGIN
  FOR fk_constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.table_schema = kcu.table_schema
     AND tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.table_schema = ccu.table_schema
     AND tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'email_outbound_drafts'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'action_id'
      AND ccu.table_name = 'extracted_actions'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE email_outbound_drafts DROP CONSTRAINT %I', fk_constraint_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  summary JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_tenant_created
  ON report_snapshots (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_policy_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  low_impact_min_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.750,
  medium_impact_min_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  auto_execute_low_impact BOOLEAN NOT NULL DEFAULT TRUE,
  autonomy_level INTEGER NOT NULL DEFAULT 3 CHECK (autonomy_level BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  risk_score NUMERIC(5,2) NOT NULL,
  risk_level risk_level NOT NULL,
  signals JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS correction_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id UUID,
  corrected_by_user_id UUID NOT NULL REFERENCES users(id),
  correction_type TEXT NOT NULL,
  correction_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2.7g: detach correction_feedback.action_id from legacy extracted_actions FK.
DO $$
DECLARE
  fk_constraint_name TEXT;
BEGIN
  FOR fk_constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.table_schema = kcu.table_schema
     AND tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.table_schema = ccu.table_schema
     AND tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'correction_feedback'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'action_id'
      AND ccu.table_name = 'extracted_actions'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE correction_feedback DROP CONSTRAINT %I', fk_constraint_name);
  END LOOP;
END $$;

-- Phase 2.7h Migration D: retire extraction child tables after FK-detach prep.
DROP TABLE IF EXISTS approval_decisions;
DROP TABLE IF EXISTS interventions;
DROP TABLE IF EXISTS agent_run_transitions;

-- Phase 2.7i Migration E: retire extraction parent tables after child retirement.
DROP TABLE IF EXISTS extracted_actions;
DROP TABLE IF EXISTS agent_runs;

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_hash TEXT,
  entry_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC(12,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row level security toggles. Policies assume app sets SET app.tenant_id before query.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_event_processing_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_channel_project_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_calendar_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbound_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_policy_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_projects ON projects USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_project_memberships
    ON project_memberships
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_project_notes
    ON project_notes
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_tasks ON tasks USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dependencies ON task_dependencies USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_comments ON task_comments USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_activity ON activity_log USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_canonical_events ON canonical_events USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_canonical_event_processing_attempts
    ON canonical_event_processing_attempts
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_raw_events ON raw_events USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_notifications ON notifications USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_risk_snapshots ON risk_snapshots USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_feedback ON correction_feedback USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_audit ON audit_log USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_kpis ON kpi_snapshots USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_slack_installations ON slack_installations USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_slack_channel_project_mappings
    ON slack_channel_project_mappings
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY slack_installations_system_lookup
    ON slack_installations
    FOR SELECT
    USING (current_setting('app.tenant_id', true) = '__system__');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_google_calendar_installations
    ON google_calendar_installations
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY google_calendar_installations_system_lookup
    ON google_calendar_installations
    FOR SELECT
    USING (current_setting('app.tenant_id', true) = '__system__');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_outlook_calendar_installations
    ON outlook_calendar_installations
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_email_installations
    ON email_installations
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY email_installations_system_lookup
    ON email_installations
    FOR SELECT
    USING (current_setting('app.tenant_id', true) = '__system__');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_email_outbound_drafts
    ON email_outbound_drafts
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_report_snapshots
    ON report_snapshots
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_tenant_policy_settings
    ON tenant_policy_settings
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 5: add read_at to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;


-- Phase 6: meeting notes table
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  agent_run_id UUID,
  title TEXT,
  transcript TEXT NOT NULL,
  summary TEXT,
  action_count INT NOT NULL DEFAULT 0,
  meeting_date DATE,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 2.7d: detach meeting_notes.agent_run_id from legacy agent_runs FK.
DO $$
DECLARE
  fk_constraint_name TEXT;
BEGIN
  FOR fk_constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.table_schema = kcu.table_schema
     AND tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.table_schema = ccu.table_schema
     AND tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'meeting_notes'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'agent_run_id'
      AND ccu.table_name = 'agent_runs'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE meeting_notes DROP CONSTRAINT %I', fk_constraint_name);
  END LOOP;
END $$;

ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_meeting_notes
    ON meeting_notes
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 5: unified project intake draft model
CREATE TABLE IF NOT EXISTS project_intake_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'chat', 'meeting')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'bootstrapped', 'finalized')),

  project_name TEXT,
  project_description TEXT,
  project_start_date DATE,
  project_target_date DATE,
  attach_to_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  chat_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  meeting_title TEXT,
  meeting_transcript TEXT,

  bootstrap_summary TEXT,
  bootstrap_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  bootstrap_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  bootstrap_seed_message TEXT,

  finalized_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  finalized_meeting_note_id UUID REFERENCES meeting_notes(id) ON DELETE SET NULL,
  finalized_canonical_event_id UUID REFERENCES canonical_events(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,

  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_created
  ON project_intake_drafts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_status
  ON project_intake_drafts (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_mode
  ON project_intake_drafts (tenant_id, mode, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_attach_project
  ON project_intake_drafts (tenant_id, attach_to_project_id, updated_at DESC);

ALTER TABLE project_intake_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_project_intake_drafts
    ON project_intake_drafts
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 1.2: Larry conversation tables
CREATE TABLE IF NOT EXISTS larry_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS larry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES larry_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'larry')),
  content TEXT NOT NULL,
  reasoning JSONB,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE larry_messages
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE larry_messages lm
SET actor_user_id = lc.user_id
FROM larry_conversations lc
WHERE lm.actor_user_id IS NULL
  AND lm.role = 'user'
  AND lm.tenant_id = lc.tenant_id
  AND lm.conversation_id = lc.id
  AND lc.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_larry_messages_conversation_created
  ON larry_messages (conversation_id, created_at ASC);

ALTER TABLE larry_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE larry_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_larry_conversations
    ON larry_conversations
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_larry_messages
    ON larry_messages
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Phase 10: documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'general',
  source_kind TEXT,
  source_record_id TEXT,
  version INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_kind TEXT;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_record_id TEXT;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS version INT;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE documents
SET version = 1
WHERE version IS NULL;

UPDATE documents
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

UPDATE documents
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE documents
  ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE documents
  ALTER COLUMN version SET NOT NULL;
ALTER TABLE documents
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE documents
  ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE documents
  ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE documents
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_tenant_project_updated
  ON documents (tenant_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_doc_type_updated
  ON documents (tenant_id, doc_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_source
  ON documents (tenant_id, source_kind, source_record_id, updated_at DESC);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_documents
    ON documents
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS task_document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attached_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, task_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_task_document_attachments_tenant_task_created
  ON task_document_attachments (tenant_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_document_attachments_tenant_document_created
  ON task_document_attachments (tenant_id, document_id, created_at DESC);

ALTER TABLE task_document_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_task_document_attachments
    ON task_document_attachments
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Larry Intelligence tables ──────────────────────────────────────────────────
-- Canonical Larry runtime tables replacing the retired extraction-era parents.

CREATE TABLE IF NOT EXISTS larry_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Lifecycle state
  event_type   TEXT NOT NULL CHECK (event_type IN ('auto_executed', 'suggested', 'accepted', 'dismissed')),

  -- What Larry did or wants to do
  action_type  TEXT NOT NULL,
  display_text TEXT NOT NULL,
  reasoning    TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Execution
  executed_at  TIMESTAMPTZ,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('schedule', 'login', 'chat', 'signal')),
  chat_message TEXT,
  conversation_id UUID REFERENCES larry_conversations(id) ON DELETE SET NULL,
  request_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL,
  response_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  dismissed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  executed_by_kind TEXT CHECK (executed_by_kind IN ('larry', 'user')),
  executed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  execution_mode TEXT CHECK (execution_mode IN ('auto', 'approval')),
  source_kind TEXT,
  source_record_id UUID,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES larry_conversations(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS request_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS response_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS dismissed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS executed_by_kind TEXT CHECK (executed_by_kind IN ('larry', 'user'));
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS executed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS execution_mode TEXT CHECK (execution_mode IN ('auto', 'approval'));
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS source_kind TEXT;
ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS source_record_id UUID;

UPDATE larry_events
SET execution_mode = CASE
  WHEN event_type = 'auto_executed' THEN 'auto'
  ELSE 'approval'
END
WHERE execution_mode IS NULL;

UPDATE larry_events
SET executed_by_kind = 'larry'
WHERE executed_by_kind IS NULL
  AND event_type = 'auto_executed';

UPDATE larry_events
SET source_kind = triggered_by
WHERE source_kind IS NULL;

CREATE INDEX IF NOT EXISTS idx_larry_events_project
  ON larry_events (project_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_larry_events_tenant_state
  ON larry_events (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_larry_events_project_conversation_created
  ON larry_events (project_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_larry_events_request_message
  ON larry_events (request_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_larry_events_response_message
  ON larry_events (response_message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_larry_events_source_record
  ON larry_events (tenant_id, source_kind, source_record_id, created_at DESC);

ALTER TABLE larry_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_larry_events
    ON larry_events
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS larry_briefings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     JSONB NOT NULL,
  event_ids   UUID[] NOT NULL DEFAULT '{}',
  seen_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_larry_briefings_user
  ON larry_briefings (user_id, created_at DESC);

ALTER TABLE larry_briefings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_larry_briefings
    ON larry_briefings
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_memory_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  source_kind      VARCHAR NOT NULL,
  source_record_id TEXT,
  content          TEXT NOT NULL,
  content_hash     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_memory_entries
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

UPDATE project_memory_entries
SET source_kind = 'meeting'
WHERE lower(regexp_replace(source_kind, '[\s_-]+', '', 'g'))
  IN ('meeting', 'meetings', 'transcript', 'meetingtranscript', 'meetingsignal');

UPDATE project_memory_entries
SET source_kind = 'email'
WHERE lower(regexp_replace(source_kind, '[\s_-]+', '', 'g'))
  IN ('email', 'emails', 'emailsignal');

UPDATE project_memory_entries
SET source_kind = 'slack'
WHERE lower(regexp_replace(source_kind, '[\s_-]+', '', 'g'))
  IN ('slack', 'slacksignal');

UPDATE project_memory_entries
SET source_kind = 'calendar'
WHERE lower(regexp_replace(source_kind, '[\s_-]+', '', 'g'))
  IN ('calendar', 'calendarsignal', 'googlecalendar');

UPDATE project_memory_entries
SET content_hash = encode(digest(regexp_replace(trim(content), '\s+', ' ', 'g'), 'sha256'), 'hex')
WHERE content_hash IS NULL;

DELETE FROM project_memory_entries pme
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY tenant_id, project_id, source_kind, source_record_id, content_hash
        ORDER BY created_at DESC, id DESC
      ) AS duplicate_rank
    FROM project_memory_entries
    WHERE source_record_id IS NOT NULL
      AND content_hash IS NOT NULL
  ) ranked
  WHERE duplicate_rank > 1
) duplicates
WHERE pme.id = duplicates.id;

CREATE INDEX IF NOT EXISTS idx_project_memory_entries_project
  ON project_memory_entries (tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_memory_entries_source_kind
  ON project_memory_entries (tenant_id, source_kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memory_entries_replay_dedup
  ON project_memory_entries (tenant_id, project_id, source_kind, source_record_id, content_hash)
  WHERE source_record_id IS NOT NULL
    AND content_hash IS NOT NULL;

ALTER TABLE project_memory_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_project_memory_entries
    ON project_memory_entries
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Larry custom rules
CREATE TABLE IF NOT EXISTS larry_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'behavioral',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_larry_rules_tenant ON larry_rules (tenant_id, is_active);

ALTER TABLE larry_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_larry_rules
    ON larry_rules
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Outlook Calendar webhook subscription tracking
ALTER TABLE outlook_calendar_installations
  ADD COLUMN IF NOT EXISTS outlook_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS outlook_subscription_client_state TEXT,
  ADD COLUMN IF NOT EXISTS outlook_subscription_expiration TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outlook_calendar_installations_subscription
  ON outlook_calendar_installations (outlook_subscription_id)
  WHERE outlook_subscription_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Larry Documents: files generated by Larry (email drafts, letters, memos, reports)
CREATE TABLE IF NOT EXISTS larry_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  larry_event_id UUID REFERENCES larry_events(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('email_draft', 'letter', 'memo', 'report', 'note', 'other')),
  content TEXT NOT NULL,

  email_recipient TEXT,
  email_subject TEXT,
  email_sent_at TIMESTAMPTZ,

  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'final', 'sent')),

  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_larry_documents_tenant ON larry_documents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_larry_documents_project ON larry_documents(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_larry_documents_event ON larry_documents(larry_event_id);

ALTER TABLE larry_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY larry_documents_tenant_isolation ON larry_documents
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
EXCEPTION WHEN duplicate_object THEN null; END $$;
