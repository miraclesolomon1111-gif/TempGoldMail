import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from './lib/supabase/server';
import { getRealIP } from './lib/geo';

export async function middleware(req: NextRequest) {
  const sessionToken =
    req.cookies.get('goldmailer_session')?.value ||
    req.cookies.get('session_token')?.value;

  if (sessionToken) {
    try {
      const supabase = createClient();
      if (supabase) {
        const ip = getRealIP(req);
        const nowIso = new Date().toISOString();

        // Requirement 5: Only UPDATE last_active WHERE session_token = current token, don't insert new row
        await supabase
          .from('goldmailer_sessions')
          .update({
            last_active: nowIso,
            ip_address: ip
          })
          .eq('session_token', sessionToken);

        // Requirement 5: Add cleanup: DELETE FROM goldmailer_sessions WHERE last_active < NOW() - INTERVAL '30 days'
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('goldmailer_sessions')
          .delete()
          .lt('last_active', thirtyDaysAgo);
      }
    } catch {}
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
