import { app } from './app';

export default function handler(req: any, res: any) {
  const matchedPath = req.headers?.['x-matched-path'] || req.headers?.['x-now-route-matches'];
  if (matchedPath && typeof matchedPath === 'string' && (req.url === '/api' || req.url === '/' || !req.url.startsWith('/api/'))) {
    req.url = matchedPath;
  }
  return app(req, res);
}
