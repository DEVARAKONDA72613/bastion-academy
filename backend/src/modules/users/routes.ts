import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as usersService from './service.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

usersRouter.get('/me', async (req, res, next) => {
  try {
    res.json(await usersService.getMe(req.subject!.id));
  } catch (err) { next(err); }
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  country: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  preferredLanguage: z.string().max(10).optional(),
});

usersRouter.patch('/me', async (req, res, next) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    await usersService.updateProfile(req.subject!.id, body);
    res.json({ updated: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

const themeSchema = z.object({ theme: z.enum(['auto', 'light', 'dark']) });

usersRouter.patch('/me/theme', async (req, res, next) => {
  try {
    const body = themeSchema.parse(req.body);
    await usersService.updateTheme(req.subject!.id, body.theme);
    res.json({ updated: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

usersRouter.get('/me/security/sessions', async (req, res, next) => {
  try {
    res.json(await usersService.listSessions(req.subject!.id, req.sessionId));
  } catch (err) { next(err); }
});

usersRouter.delete('/me/security/sessions/:id', async (req, res, next) => {
  try {
    await usersService.revokeOwnSession(req.subject!.id, req.params.id);
    res.json({ revoked: true });
  } catch (err) { next(err); }
});

usersRouter.get('/me/security/login-history', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json(await usersService.listLoginHistory(req.subject!.id, 20, (page - 1) * 20));
  } catch (err) { next(err); }
});

usersRouter.get('/me/security/trusted-devices', async (req, res, next) => {
  try {
    res.json(await usersService.listTrustedDevices(req.subject!.id));
  } catch (err) { next(err); }
});

usersRouter.delete('/me/security/trusted-devices/:id', async (req, res, next) => {
  try {
    await usersService.removeTrustedDevice(req.subject!.id, req.params.id);
    res.json({ removed: true });
  } catch (err) { next(err); }
});
