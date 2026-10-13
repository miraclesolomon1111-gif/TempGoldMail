import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '../../../../lib/supabase/server';

/**
 * Requirement 4:
 * Generation: create 10 plain codes with crypto.randomBytes, hash each with bcrypt.hash,
 * delete old codes for user, insert hashed codes, return plain codes once.
 */
export async function POST() {
  try {
    const supabase = createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plainCodes: string[] = [];
    const hashedRows: { user_id: string; code_hash: string; used: boolean }[] = [];

    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 uppercase chars
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`;
      plainCodes.push(formatted);

      const normalized = formatted.replace(/-/g, '').toUpperCase();
      const hash = await bcrypt.hash(normalized, 10);
      hashedRows.push({
        user_id: user.id,
        code_hash: hash,
        used: false
      });
    }

    // Delete old codes for user
    await supabase.from('backup_codes').delete().eq('user_id', user.id);

    // Insert hashed codes
    const { error: insertErr } = await supabase.from('backup_codes').insert(hashedRows);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Return plain codes once
    return NextResponse.json({ success: true, backup_codes: plainCodes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * Requirement 4:
 * Verification: get code input, remove dash, toUpperCase,
 * SELECT * FROM backup_codes WHERE user_id = user.id AND used = false,
 * for each row bcrypt.compare(input, row.code_hash), if match UPDATE used = true and allow login.
 */
export async function PUT(req: Request) {
  try {
    const supabase = createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: 'Backup code is required' }, { status: 400 });
    }

    const normalizedInput = String(code).replace(/[-\s]/g, '').toUpperCase();

    // SELECT * FROM backup_codes WHERE user_id = user.id AND used = false
    const { data: records, error: fetchErr } = await supabase
      .from('backup_codes')
      .select('id, code_hash')
      .eq('user_id', user.id)
      .eq('used', false);

    if (fetchErr || !records || records.length === 0) {
      return NextResponse.json({ valid: false, error: 'Invalid or used backup code' }, { status: 400 });
    }

    // for each row bcrypt.compare(input, row.code_hash)
    for (const row of records) {
      const match = await bcrypt.compare(normalizedInput, row.code_hash);
      if (match) {
        // if match UPDATE used = true and allow login
        await supabase
          .from('backup_codes')
          .update({ used: true })
          .eq('id', row.id);

        return NextResponse.json({ valid: true, message: 'Backup code verified successfully' });
      }
    }

    return NextResponse.json({ valid: false, error: 'Invalid backup code' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
