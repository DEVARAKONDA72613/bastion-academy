import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as videosService from './service.js';

export const videosRouter = Router();

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

// PUBLIC
videosRouter.get('/courses', async (_req, res, next) => {
  try { res.json(await videosService.listCourses()); } catch (err) { next(err); }
});

videosRouter.get('/courses/:slug', async (req, res, next) => {
  try { res.json(await videosService.getCourseBySlug(req.params.slug, req.subject)); } catch (err) { next(err); }
});

// AUTH
videosRouter.get('/videos/:id', requireAuth, async (req, res, next) => {
  try { res.json(await videosService.getVideoMetadata(req.params.id, req.subject!)); } catch (err) { next(err); }
});

videosRouter.get('/videos/:id/stream-url', requireAuth, async (req, res, next) => {
  try { res.json(await videosService.getVideoStreamUrl(req.params.id, req.subject!)); } catch (err) { next(err); }
});

const progressSchema = z.object({ positionSeconds: z.number().int().min(0) });

videosRouter.post('/videos/:id/progress', requireAuth, async (req, res, next) => {
  try {
    const body = progressSchema.parse(req.body);
    res.json(await videosService.saveProgress(req.subject!.id, req.params.id, body.positionSeconds));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

videosRouter.get('/courses/:id/progress', requireAuth, async (req, res, next) => {
  try { res.json(await videosService.getCourseProgress(req.subject!.id, req.params.id)); } catch (err) { next(err); }
});

// ROLE:instructor
const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(2000),
  categoryId: z.string().uuid(),
  isPremium: z.boolean(),
  requiredPlanCode: z.enum(['FREE', 'BRONZE', 'SILVER', 'GOLD']),
});

videosRouter.post('/instructor/courses', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    const body = createCourseSchema.parse(req.body);
    res.status(201).json(await videosService.createCourse(req.subject!.id, body));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

videosRouter.patch('/instructor/courses/:id', requireAuth, requireRole('instructor'), async (req, res, next) => {
  try {
    await videosService.assertCourseOwnership(req.params.id, req.subject!.id);
    res.status(501).json({ todo: 'field-by-field update — same pattern as users.updateProfile' });
  } catch (err) { next(err); }
});
