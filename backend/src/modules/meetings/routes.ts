import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import * as meetingsService from './service.js';

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  throw err;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['one_to_one', 'group']),
  scheduledAt: z.string().datetime().optional(),
  maxParticipants: z.number().int().positive().max(50).optional(),
  recordingEnabled: z.boolean().optional(),
});

meetingsRouter.post('/', async (req, res, next) => {
  try { res.status(201).json(await meetingsService.createMeeting(req.subject!, createSchema.parse(req.body))); }
  catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

meetingsRouter.post('/:roomCode/join', async (req, res, next) => {
  try { res.json(await meetingsService.joinMeeting(req.subject!, req.params.roomCode)); }
  catch (err) { next(err); }
});

meetingsRouter.get('/history', async (req, res, next) => {
  try { res.json(await meetingsService.listMeetingHistory(req.subject!.id)); } catch (err) { next(err); }
});

meetingsRouter.get('/:id', async (req, res, next) => {
  try { res.json(await meetingsService.getMeetingSnapshot(req.params.id, req.subject!.id)); } catch (err) { next(err); }
});

meetingsRouter.post('/:id/lock', async (req, res, next) => {
  try { await meetingsService.lockMeeting(req.params.id, req.subject!.id, true); res.json({ locked: true }); } catch (err) { next(err); }
});

meetingsRouter.post('/:id/unlock', async (req, res, next) => {
  try { await meetingsService.lockMeeting(req.params.id, req.subject!.id, false); res.json({ locked: false }); } catch (err) { next(err); }
});

meetingsRouter.post('/:id/participants/:userId/mute', async (req, res, next) => {
  try { await meetingsService.muteParticipant(req.params.id, req.subject!.id, req.params.userId); res.json({ muted: true }); } catch (err) { next(err); }
});

meetingsRouter.post('/:id/participants/:userId/remove', async (req, res, next) => {
  try { await meetingsService.removeParticipant(req.params.id, req.subject!.id, req.params.userId); res.json({ removed: true }); } catch (err) { next(err); }
});

const coHostSchema = z.object({ grant: z.boolean() });

meetingsRouter.post('/:id/participants/:userId/co-host', async (req, res, next) => {
  try {
    const body = coHostSchema.parse(req.body);
    await meetingsService.setCoHost(req.params.id, req.subject!.id, req.params.userId, body.grant);
    res.json({ updated: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});

const recordingSchema = z.object({ consentConfirmed: z.boolean() });

meetingsRouter.post('/:id/recording/start', async (req, res, next) => {
  try {
    const body = recordingSchema.parse(req.body);
    await meetingsService.startRecording(req.params.id, req.subject!.id, body.consentConfirmed);
    res.json({ recording: true });
  } catch (err) { next(err instanceof z.ZodError ? handleZodError(err) : err); }
});
