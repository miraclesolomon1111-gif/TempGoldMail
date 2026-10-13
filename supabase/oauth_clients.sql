-- GoldMailer OAuth 2.0 Clients Table
-- Schema for Supabase / PostgreSQL

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret TEXT NOT NULL,
  app_name TEXT NOT NULL,
  app_type TEXT DEFAULT 'Web application',
  javascript_origins TEXT[] DEFAULT '{}',
  redirect_uris TEXT[] DEFAULT '{}',
  user_id TEXT DEFAULT 'dev_user',
  owner_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for instant lookup on /oauth/authorize and /api/oauth/validate
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_user_id ON oauth_clients(user_id);

-- Row Level Security (RLS)
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own apps" ON oauth_clients FOR ALL USING (auth.uid() = user_id);
