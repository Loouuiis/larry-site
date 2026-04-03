ALTER TABLE tenant_policy_settings
  ADD COLUMN IF NOT EXISTS autonomy_level INTEGER NOT NULL DEFAULT 3
    CHECK (autonomy_level BETWEEN 1 AND 5);
