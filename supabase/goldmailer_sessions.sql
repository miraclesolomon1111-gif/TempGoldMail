-- GoldMailer Sessions Table
-- Schema for Supabase / PostgreSQL Device & IP Detection like Gmail

CREATE TABLE IF NOT EXISTS goldmailer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  email text NOT NULL,
  session_token text NOT NULL,
  ip_address text,
  city text,
  country text,
  device text, -- e.g. Chrome on Windows
  browser text,
  os text,
  user_agent text,
  is_current boolean DEFAULT false,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goldmailer_sessions_user_id ON goldmailer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_goldmailer_sessions_token ON goldmailer_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_goldmailer_sessions_email ON goldmailer_sessions(email);
CREATE INDEX IF NOT EXISTS idx_goldmailer_sessions_last_active ON goldmailer_sessions(last_active);

ALTER TABLE goldmailer_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own sessions" ON goldmailer_sessions;
CREATE POLICY "Users see own sessions" ON goldmailer_sessions FOR ALL USING (auth.uid() = user_id);
