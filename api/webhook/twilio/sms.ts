import type { Request, Response } from 'express';
import { handleTwilioSmsWebhook } from '../../../src/server/app.js';

export default async function handler(req: Request, res: Response) {
  return handleTwilioSmsWebhook(req, res);
}
