import { Router } from 'express';
import express from 'express';
import * as subsService from './service.js';

// Separate router, mounted BEFORE express.json() in app.ts with express.raw()
// applied ONLY to this path — Razorpay's signature is computed over the exact
// raw request bytes, so the body must never be JSON-parsed before verification.
export const webhookRouter = Router();

webhookRouter.post('/webhooks/razorpay', express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;

    if (!subsService.verifyWebhookSignature(req.body, signature)) {
      // Deliberately vague response — don't tell a would-be attacker which part failed.
      res.status(400).json({ error: 'invalid_signature' });
      return;
    }

    let payload: unknown;
    try { payload = JSON.parse(req.body.toString('utf8')); }
    catch { res.status(400).json({ error: 'invalid_payload' }); return; }

    await subsService.handleWebhookEvent(payload);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});
