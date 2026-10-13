-- ====================================================================
-- USERS 2FA COLUMN & ROW LEVEL SECURITY
-- ====================================================================

ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only update where auth.uid() = id" ON users;
CREATE POLICY "Users can only update where auth.uid() = id"
  ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own user record" ON users;
CREATE POLICY "Users can view own user record"
  ON users
  FOR SELECT
  USING (auth.uid() = id);
