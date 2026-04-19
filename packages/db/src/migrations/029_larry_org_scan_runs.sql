-- Migration 029 — rate-limit table for the org-wide timeline intelligence pass.
-- Each tenant has at most one row; we upsert last_run_at after every org pass
-- and the scheduler gate compares NOW() - last_run_at against the 60-minute
-- threshold in shouldRunOrgPass().

BEGIN;

CREATE TABLE IF NOT EXISTS larry_org_scan_runs (
  tenant_id    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_run_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
