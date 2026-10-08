import type { Request, Response } from 'express';
import { handleTwilioVoiceWebhook } from '../../../src/server/app.js';

export default async function handler(req: Request, res: Response) {
  return handleTwilioVoiceWebhook(req, res);
}
