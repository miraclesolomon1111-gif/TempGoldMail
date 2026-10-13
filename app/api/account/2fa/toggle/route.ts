import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

/**
 * Requirement 2:
 * Fix 2FA toggle glitching:
 * - Don't toggle useState before DB.
 * - On toggle: get user, then UPDATE users SET is_2fa_enabled =!current WHERE id = user.id,
 *   then SELECT is_2fa_enabled WHERE id = user.id and set state from DB only.
 * - Add RLS: users can only update where auth.uid() = id
 */
export async function POST() {
  try {
    const supabase = createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // 1. Get user dynamically
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch current status
    const { data: currentRecord } = await supabase
      .from('users')
      .select('is_2fa_enabled')
      .eq('id', user.id)
      .single();

    const current = Boolean(currentRecord?.is_2fa_enabled);
    const nextVal = !current;

    // 3. UPDATE users SET is_2fa_enabled = !current WHERE id = user.id
    const { error: updateErr } = await supabase
      .from('users')
      .update({ is_2fa_enabled: nextVal })
      .eq('id', user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. SELECT is_2fa_enabled WHERE id = user.id and return state from DB only
    const { data: freshRecord, error: selectErr } = await supabase
      .from('users')
      .select('is_2fa_enabled')
      .eq('id', user.id)
      .single();

    if (selectErr || !freshRecord) {
      return NextResponse.json({ error: selectErr?.message || 'Failed to re-fetch state' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      is_2fa_enabled: freshRecord.is_2fa_enabled
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
