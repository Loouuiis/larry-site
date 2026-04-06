CREATE TABLE IF NOT EXISTS user_oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_user_oauth_provider ON user_oauth_accounts(provider, provider_user_id);
CREATE INDEX idx_user_oauth_user ON user_oauth_accounts(user_id);

-- Allow password-less accounts (OAuth-only users have no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
