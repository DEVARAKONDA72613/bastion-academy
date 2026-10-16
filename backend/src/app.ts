import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { videosRouter } from './modules/videos/routes.js';
import { downloadsRouter } from './modules/downloads/routes.js';
import { subscriptionsRouter } from './modules/subscriptions/routes.js';
import { webhookRouter } from './modules/subscriptions/webhook.js';
import { meetingsRouter } from './modules/meetings/routes.js';
import { commentsRouter } from './modules/comments/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { errorHandler } from './core/errors.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());

// Webhook MUST be mounted before express.json() — Razorpay's signature is
// computed over the raw request bytes, and webhook.ts applies express.raw()
// only to this one path. Every other route gets normal JSON parsing below.
app.use('/api/v1', webhookRouter);

app.use(express.json());

// Global rate limit as a floor; auth/OTP routes have their own tighter limits
// layered on top (see modules/auth/routes.ts).
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1', videosRouter);
app.use('/api/v1/downloads', downloadsRouter);
app.use('/api/v1', subscriptionsRouter);
app.use('/api/v1/meetings', meetingsRouter);
app.use('/api/v1', commentsRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);
