import { app } from './app';

export function resolveVercelUrl(req: any): string {
  let url = req.url || '/';

  // 1. If req.url already has full path (e.g. /api/auth/login or /oauth/token)
  if (url.startsWith('/api/') || url.startsWith('/oauth/')) {
    return url;
  }

  // 2. If req.originalUrl is present and has full path
  if (req.originalUrl && (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/oauth/'))) {
    return req.originalUrl;
  }

  // 3. If passed via __route query param (?__route=auth/login&...)
  try {
    const parsed = new URL(url, 'http://localhost');
    const routeParam = parsed.searchParams.get('__route');
    if (routeParam) {
      parsed.searchParams.delete('__route');
      const cleanRoute = routeParam.startsWith('/') ? routeParam : '/' + routeParam;
      const fullPath = cleanRoute.startsWith('/api') || cleanRoute.startsWith('/oauth')
        ? cleanRoute
        : '/api' + cleanRoute;
      const search = parsed.searchParams.toString();
      return fullPath + (search ? '?' + search : '');
    }
  } catch {}

  // 4. If x-matched-path is specific (e.g. /api/auth/login)
  const matchedPath = req.headers?.['x-matched-path'];
  if (matchedPath && typeof matchedPath === 'string' && matchedPath !== '/api' && matchedPath !== '/api/') {
    return matchedPath;
  }

  // 5. If x-now-route-matches has regex capture group (e.g. 1=auth%2Fregister)
  const routeMatches = req.headers?.['x-now-route-matches'];
  if (routeMatches && typeof routeMatches === 'string') {
    const m = routeMatches.match(/1=([^&;]+)/);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      const clean = decoded.startsWith('/') ? decoded : '/' + decoded;
      return clean.startsWith('/api') || clean.startsWith('/oauth') ? clean : '/api' + clean;
    }
  }

  return url;
}

export default function handler(req: any, res: any) {
  req.url = resolveVercelUrl(req);
  return app(req, res);
}

