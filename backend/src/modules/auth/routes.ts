import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as authService from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../core/errors.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions, fingerprintRequest, trustDevice } from '../../core/session.js';

export const authRouter = Router();

// Tighter than the app-wide limiter — auth/OTP endpoints are the ones
// brute-force and OTP-spam protection actually matters for.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
authRouter.use(authLimiter);

function handleZodError(err: unknown) {
  if (err instanceof z.ZodError) {
    return new AppError(400, 'validation_error', err.errors[0]?.message ?? 'Invalid input.');
  }
  throw err;
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  displayName: z.string().min(1).max(80),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body.email, body.password, body.displayName);
    res.status(201).json({ userId: result.userId, message: 'Verification code sent to your email.' });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password, req);
    if (result.requiresOtp) {
      return res.json({ requiresOtp: true, userId: result.userId });
    }
    res.cookie(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions);
    res.json({ requiresOtp: false, userId: result.userId, theme: result.theme });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

const googleLoginSchema = z.object({ credential: z.string().min(100).max(10000) });

authRouter.post('/google', otpLimiter, async (req, res, next) => {
  try {
    const body = googleLoginSchema.parse(req.body);
    const result = await authService.googleLogin(body.credential, req);
    if (result.requiresOtp) {
      return res.json({ requiresOtp: true, userId: result.userId, email: result.email });
    }
    res.cookie(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions);
    res.json({ requiresOtp: false, userId: result.userId, email: result.email, theme: result.theme });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});
const verifyOtpSchema = z.object({
  userId: z.string().uuid(),
  otp: z.string().length(6),
  purpose: z.enum(['registration', 'login']),
  trustDevice: z.boolean().optional(),
});

authRouter.post('/verify-otp', async (req, res, next) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    if (body.purpose === 'registration') {
      await authService.confirmRegistrationOtp(body.userId, body.otp);
      return res.json({ verified: true, message: 'Email verified — you can now log in.' });
    }
    const session = await authService.confirmLoginOtp(body.userId, body.otp, req, !!body.trustDevice);
    res.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions);
    res.json({ verified: true, theme: session.theme });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) await authService.logout(token);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ loggedOut: true });
});

const emailSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot-password', otpLimiter, async (req, res, next) => {
  try {
    const body = emailSchema.parse(req.body);
    await authService.forgotPassword(body.email);
    res.json({ message: 'If that email exists, a reset code has been sent.' });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
});

authRouter.post('/reset-password', otpLimiter, async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(body.email, body.otp, body.newPassword);
    res.json({ message: 'Password updated — you can now log in.' });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

const resendSchema = z.object({ email: z.string().email(), purpose: z.enum(['registration', 'login', 'password_reset']) });

authRouter.post('/resend-otp', otpLimiter, async (req, res, next) => {
  try {
    const body = resendSchema.parse(req.body);
    await authService.resendOtp(body.email, body.purpose);
    res.json({ message: 'If that email exists, a new code has been sent.' });
  } catch (err) {
    next(err instanceof z.ZodError ? handleZodError(err) : err);
  }
});

authRouter.post('/trust-device', requireAuth, async (req, res) => {
  const fingerprint = fingerprintRequest(req);
  await trustDevice(req.subject!.id, fingerprint, undefined, undefined);
  res.json({ trusted: true });
});
