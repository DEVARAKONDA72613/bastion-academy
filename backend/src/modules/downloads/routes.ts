import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as downloadsService from './service.js';

export const downloadsRouter = Router();
downloadsRouter.use(requireAuth);

downloadsRouter.post('/', async (req, res, next) => {
  try {
    const { videoId } = req.body as { videoId?: string };
    if (!videoId) return res.status(400).json({ error: { code: 'validation_error', message: 'videoId is required.' } });
    const result = await downloadsService.requestDownload(req.subject!, videoId, req);
    res.status(result.alreadyRequested ? 200 : 201).json(result);
  } catch (err) { next(err); }
});

downloadsRouter.get('/', async (req, res, next) => {
  try { res.json(await downloadsService.listDownloads(req.subject!.id)); } catch (err) { next(err); }
});

downloadsRouter.get('/quota', async (req, res, next) => {
  try { res.json(await downloadsService.getQuotaStatus(req.subject!)); } catch (err) { next(err); }
});
