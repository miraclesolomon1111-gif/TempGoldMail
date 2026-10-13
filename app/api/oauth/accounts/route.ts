import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { db } from '../../../../src/server/db';

export async function GET(req: Request) {
  try {
    const supabase = createClient();

    // 1. Read session cookie or Authorization header from THIS browser only
    const cookieHeader = req.headers.get('cookie') || '';
    const cookieMap = new Map<string, string>();
    cookieHeader.split(';').forEach(c => {
      const [k, ...v] = c.split('=');
      if (k) cookieMap.set(k.trim(), decodeURIComponent(v.join('=').trim()));
    });

    const sessionCookie = cookieMap.get('goldmailer_session') || cookieMap.get('session_token');
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    // Check client-provided device account emails/tokens from this browser's localStorage
    const deviceAccountsHeader = req.headers.get('x-device-accounts');
    const url = new URL(req.url);
    const queryEmails = url.searchParams.get('emails')?.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) || [];

    const activeTokens = new Set<string>();
    if (sessionCookie) activeTokens.add(sessionCookie);
    if (authHeader) activeTokens.add(authHeader);

    // Verify session tokens in goldmailer_sessions table:
    // SELECT * FROM goldmailer_sessions WHERE session_token = cookie AND last_active > now() - 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const verifiedUserIds = new Set<string>();
    const verifiedEmails = new Set<string>();

    for (const token of activeTokens) {
      // 1. Check in Supabase goldmailer_sessions
      if (supabase) {
        try {
          const { data: sessData } = await supabase
            .from('goldmailer_sessions')
            .select('*')
            .eq('session_token', token)
            .gte('last_active', thirtyDaysAgo)
            .maybeSingle();

          if (sessData) {
            if (sessData.user_id) verifiedUserIds.add(sessData.user_id);
            if (sessData.email) verifiedEmails.add(sessData.email.toLowerCase().trim());
          }
        } catch {}
      }

      // 2. Check in memory/disk db sessions
      const localSess = await db.getSession(token);
      if (localSess && new Date(localSess.last_active || localSess.last_active_at || 0) >= new Date(thirtyDaysAgo)) {
        if (localSess.user_id) verifiedUserIds.add(localSess.user_id);
        if (localSess.email) verifiedEmails.add(localSess.email.toLowerCase().trim());
      }
    }

    // Also verify any accounts from this browser's local device list against active sessions
    if (queryEmails.length > 0 || deviceAccountsHeader) {
      let candidateEmails = [...queryEmails];
      if (deviceAccountsHeader) {
        try {
          const parsed = JSON.parse(deviceAccountsHeader);
          if (Array.isArray(parsed)) {
            candidateEmails.push(...parsed.map(p => (typeof p === 'string' ? p : p.email)).filter(Boolean));
          }
        } catch {}
      }

      for (const em of candidateEmails) {
        const clean = em.toLowerCase().trim();
        if (supabase) {
          try {
            const { data } = await supabase
              .from('goldmailer_sessions')
              .select('user_id, email')
              .ilike('email', clean)
              .gte('last_active', thirtyDaysAgo)
              .limit(1);
            if (data && data.length > 0) {
              verifiedEmails.add(clean);
              if (data[0].user_id) verifiedUserIds.add(data[0].user_id);
            }
          } catch {}
        }
        const dbSessions = await db.getSessionsForUser(clean);
        if (dbSessions.some(s => new Date(s.last_active || s.last_active_at || 0) >= new Date(thirtyDaysAgo))) {
          verifiedEmails.add(clean);
        }
      }
    }

    // IF NO VALID SESSION ON THIS BROWSER -> Return empty accounts list!
    // NEVER SELECT * FROM users (privacy bug prevention)!
    if (verifiedUserIds.size === 0 && verifiedEmails.size === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Fetch ONLY the accounts that are actively verified on THIS browser
    const allUsers = db.listAccounts();
    const matchedUsers = allUsers.filter(u => {
      const uEmail = (u.email || '').toLowerCase().trim();
      return verifiedUserIds.has(u.id) || verifiedEmails.has(uEmail);
    });

    const accounts = matchedUsers.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
      avatar_url: u.avatar_url || ''
    }));

    return NextResponse.json({ accounts });
  } catch (err: any) {
    return NextResponse.json({ accounts: [], error: err.message });
  }
}
