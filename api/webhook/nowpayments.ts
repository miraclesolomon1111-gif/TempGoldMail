import type { Request, Response } from 'express';
import { handleNowPaymentsWebhook } from '../../src/server/app.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  return handleNowPaymentsWebhook(req, res);
}
