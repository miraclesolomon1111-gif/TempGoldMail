-- ====================================================================
-- USER RECOVERY EMAIL SCHEMA & ROW LEVEL SECURITY
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_recovery (
  user_id uuid PRIMARY KEY,
  email text,
  recovery_email text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_recovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own recovery email" ON user_recovery;
CREATE POLICY "Users can manage own recovery email"
  ON user_recovery
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
