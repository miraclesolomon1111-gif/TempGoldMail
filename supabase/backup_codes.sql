-- ====================================================================
-- BACKUP CODES SCHEMA & ROW LEVEL SECURITY
-- ====================================================================

CREATE TABLE IF NOT EXISTS backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_codes_user_unused ON backup_codes(user_id, used);

ALTER TABLE backup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own backup codes" ON backup_codes;
CREATE POLICY "Users can view own backup codes"
  ON backup_codes
  FOR SELECT
  USING (auth.uid() = user_id);
