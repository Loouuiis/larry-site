CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ
);
