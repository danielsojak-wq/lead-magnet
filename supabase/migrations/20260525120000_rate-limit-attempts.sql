CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'email', 'domain')),
  identifier_value TEXT NOT NULL,
  session_id UUID REFERENCES lm_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON rate_limit_attempts (identifier_type, identifier_value, created_at DESC);
