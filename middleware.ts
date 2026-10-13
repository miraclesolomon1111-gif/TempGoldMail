import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from './lib/supabase/server';

export async function middleware(req: NextRequest) {
  // Read session token from cookies or Authorization header
  const sessionToken =
    req.cookies.get('goldmailer_session')?.value ||
    req.cookies.get('session_token')?.value ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (sessionToken) {
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      // UPDATE goldmailer_sessions SET last_active = now() WHERE session_token = current
      await supabase
        .from('goldmailer_sessions')
        .update({ last_active: nowIso })
        .eq('session_token', sessionToken);
    } catch {
      // Ignore background update failures in edge middleware
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
