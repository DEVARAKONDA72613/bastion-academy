import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as adminService from './service.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

function page(req: any) { return Math.max(1, Number(req.query.page) || 1); }

adminRouter.get('/users', async (req, res, next) => {
  try { res.json(await adminService.listUsers(req.query.search as string | undefined, page(req))); } catch (err) { next(err); }
});

const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'deactivated']) });

adminRouter.patch('/users/:id/status', async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    res.json(await adminService.updateUserStatus(req.subject!.id, req.params.id, body.status, req.ip));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

adminRouter.get('/payments', async (req, res, next) => {
  try { res.json(await adminService.listPayments(page(req))); } catch (err) { next(err); }
});

adminRouter.get('/subscriptions', async (req, res, next) => {
  try { res.json(await adminService.listSubscriptions(page(req))); } catch (err) { next(err); }
});

adminRouter.get('/downloads', async (req, res, next) => {
  try { res.json(await adminService.listDownloads(page(req))); } catch (err) { next(err); }
});

adminRouter.get('/comments/reports', async (req, res, next) => {
  try { res.json(await adminService.listCommentReports(page(req))); } catch (err) { next(err); }
});

const moderateSchema = z.object({ action: z.enum(['hidden', 'deleted', 'dismissed']), reason: z.string().optional() });

adminRouter.post('/comments/:id/moderate', async (req, res, next) => {
  try {
    const body = moderateSchema.parse(req.body);
    await adminService.moderateComment(req.subject!.id, req.params.id, body.action, body.reason, req.ip);
    res.json({ moderated: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

adminRouter.get('/meetings', async (req, res, next) => {
  try { res.json(await adminService.listMeetings(page(req))); } catch (err) { next(err); }
});

adminRouter.get('/security/login-attempts', async (req, res, next) => {
  try { res.json(await adminService.listLoginAttempts(page(req))); } catch (err) { next(err); }
});

adminRouter.get('/audit-logs', async (req, res, next) => {
  try { res.json(await adminService.listAuditLogs(page(req), req.query.targetType as string | undefined)); } catch (err) { next(err); }
});
