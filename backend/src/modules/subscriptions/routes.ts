import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as subsService from './service.js';

export const subscriptionsRouter = Router();

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

subscriptionsRouter.get('/plans', async (_req, res, next) => {
  try { res.json(await subsService.listPlans()); } catch (err) { next(err); }
});

subscriptionsRouter.get('/subscriptions/me', requireAuth, async (req, res, next) => {
  try { res.json(await subsService.getMySubscription(req.subject!.id)); } catch (err) { next(err); }
});

const checkoutSchema = z.object({ planCode: z.enum(['BRONZE', 'SILVER', 'GOLD']) });

subscriptionsRouter.post('/subscriptions/checkout', requireAuth, async (req, res, next) => {
  try {
    const body = checkoutSchema.parse(req.body);
    res.json(await subsService.createCheckoutOrder(req.subject!, body.planCode));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

subscriptionsRouter.post('/subscriptions/cancel', requireAuth, async (req, res, next) => {
  try { await subsService.cancelAutoRenew(req.subject!.id); res.json({ cancelled: true }); } catch (err) { next(err); }
});

subscriptionsRouter.get('/billing/invoices', requireAuth, async (req, res, next) => {
  try { res.json(await subsService.listInvoices(req.subject!.id)); } catch (err) { next(err); }
});

subscriptionsRouter.get('/billing/invoices/:id', requireAuth, async (req, res, next) => {
  try { res.json(await subsService.getInvoice(req.subject!.id, req.params.id)); } catch (err) { next(err); }
});
