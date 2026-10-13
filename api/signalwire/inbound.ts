import type { Request, Response } from 'express';
import { handleSignalWireInboundWebhook } from '../../src/server/app';

export default async function handler(req: Request, res: Response) {
  return handleSignalWireInboundWebhook(req, res);
}
