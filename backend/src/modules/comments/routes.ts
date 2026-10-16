import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as commentsService from './service.js';

export const commentsRouter = Router();

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

commentsRouter.get('/videos/:id/comments', async (req, res, next) => {
  try {
    const sort = (req.query.sort as any) ?? 'newest';
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json(await commentsService.listComments(req.params.id, sort, 20, (page - 1) * 20));
  } catch (err) { next(err); }
});

commentsRouter.get('/comments/:id/replies', async (req, res, next) => {
  try { res.json(await commentsService.listReplies(req.params.id)); } catch (err) { next(err); }
});

const postSchema = z.object({ content: z.string().min(1), parentCommentId: z.string().uuid().optional() });

commentsRouter.post('/videos/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const body = postSchema.parse(req.body);
    res.status(201).json(await commentsService.postComment(req.subject!.id, req.params.id, body.content, body.parentCommentId ?? null));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

const editSchema = z.object({ content: z.string().min(1) });

commentsRouter.patch('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const body = editSchema.parse(req.body);
    res.json(await commentsService.editComment(req.subject!.id, req.params.id, body.content));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

commentsRouter.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    await commentsService.deleteComment(req.subject!.id, req.params.id, req.subject!.role === 'admin');
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

const likeSchema = z.object({ voteType: z.enum(['like', 'dislike']) });

commentsRouter.post('/comments/:id/like', requireAuth, async (req, res, next) => {
  try {
    const body = likeSchema.parse(req.body);
    await commentsService.likeComment(req.subject!.id, req.params.id, body.voteType);
    res.json({ recorded: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

const translateSchema = z.object({ targetLanguage: z.string().min(2).max(10) });

commentsRouter.post('/comments/:id/translate', requireAuth, async (req, res, next) => {
  try {
    const body = translateSchema.parse(req.body);
    res.json(await commentsService.translateComment(req.params.id, body.targetLanguage));
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

const reportSchema = z.object({ reason: z.enum(['spam', 'harassment', 'offensive', 'other']) });

commentsRouter.post('/comments/:id/report', requireAuth, async (req, res, next) => {
  try {
    const body = reportSchema.parse(req.body);
    await commentsService.reportComment(req.subject!.id, req.params.id, body.reason);
    res.json({ reported: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});
