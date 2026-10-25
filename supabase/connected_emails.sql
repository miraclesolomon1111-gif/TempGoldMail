-- Connected Emails and Google Auto-Forward Tables for GoldMailer
CREATE TABLE IF NOT EXISTS connected_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  verification_code TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending_oauth',
  gmail_access_token TEXT,
  gmail_refresh_token TEXT,
  is_forwarding_enabled BOOLEAN DEFAULT FALSE,
  forwarding_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for quick lookups
CREATE INDEX IF NOT EXISTS idx_connected_emails_user_id ON connected_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_emails_email ON connected_emails(email);
CREATE INDEX IF NOT EXISTS idx_connected_email_verifications_lookup ON connected_email_verifications(user_id, email);
