import { app } from '../src/server/app';

export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/oauth')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
