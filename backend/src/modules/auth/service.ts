import argon2 from 'argon2';
import type { Request } from 'express';
import { computeDefaultThemeForNow } from '../../core/theme.js';
import { query } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { createOtp, verifyOtp, type OtpPurpose } from '../../core/otp.js';
import { sendEmail } from '../../core/notify/email.js';
import {
  createSession, findSessionByToken, revokeSession, fingerprintRequest,
  isTrustedDevice, trustDevice,
} from '../../core/session.js';

function parseUserAgent(ua: string | undefined) {
  // Minimal parsing — good enough for login_attempts/audit display.
  // Swap for a proper library (ua-parser-js) if you need precise device models.
  if (!ua) return { browser: 'unknown', os: 'unknown', deviceType: 'unknown' };
  const browser = /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  const deviceType = /mobile/i.test(ua) ? 'mobile' : 'desktop';
  return { browser, os, deviceType };
}

async function recordLoginAttempt(req: Request, params: { userId: string | null; email: string; success: boolean; otpVerified: boolean }) {
  const { browser, os, deviceType } = parseUserAgent(req.headers['user-agent'] as string | undefined);
  await query(
    `INSERT INTO login_attempts (user_id, email_attempted, ip_address, browser, os, device_type, success, otp_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [params.userId, params.email, req.ip ?? null, browser, os, deviceType, params.success, params.otpVerified]
  );
  // Note: city/state/country are left null here — filling them in requires an
  // IP-geolocation lookup (e.g. MaxMind or ipapi.co), which needs an API key
  // we don't have configured yet. Wire that in before relying on this for
  // real "new city" anomaly detection; until then, device+IP fingerprinting
  // below is what actually gates the OTP challenge.
}

async function resolveTheme(userId: string): Promise<'light' | 'dark'> {
  const [row] = await query<{ theme_preference: string }>(`SELECT theme_preference FROM users WHERE id = $1`, [userId]);
  if (row?.theme_preference === 'light' || row?.theme_preference === 'dark') return row.theme_preference;
  return computeDefaultThemeForNow(); // 'auto' (or missing) falls back to the IST time-based default
}

export async function register(email: string, password: string, displayName: string) {
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.length > 0) throw new AppError(409, 'email_taken', 'An account with this email already exists.');

  const passwordHash = await argon2.hash(password);
  const [freeRole] = await query<{ id: string }>(`SELECT id FROM roles WHERE name = 'free'`);

  const [user] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3) RETURNING id`,
    [email, passwordHash, freeRole.id]
  );
  await query(`INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, [user.id, displayName]);
  await query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status)
     SELECT $1, id, 'active' FROM subscription_plans WHERE code = 'FREE'`,
    [user.id]
  );

  const otp = await createOtp(user.id, 'email', 'registration');
  await sendEmail(email, 'Verify your Bastion Academy account', `Your verification code is: ${otp}\nExpires in 10 minutes.`);

  return { userId: user.id };
}

export async function login(email: string, password: string, req: Request) {
  const [user] = await query<{ id: string; password_hash: string; status: string }>(
    `SELECT id, password_hash, status FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );

  if (!user) {
    await recordLoginAttempt(req, { userId: null, email, success: false, otpVerified: false });
    throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'account_inactive', 'This account is suspended or deactivated.');
  }

  const passwordOk = await argon2.verify(user.password_hash, password);
  if (!passwordOk) {
    await recordLoginAttempt(req, { userId: user.id, email, success: false, otpVerified: false });
    throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
  }

  const fingerprint = fingerprintRequest(req);
  const trusted = await isTrustedDevice(user.id, fingerprint);

  if (!trusted) {
    const otp = await createOtp(user.id, 'email', 'login');
    await sendEmail(email, 'Confirm it\'s you', `New device detected. Your login code is: ${otp}\nExpires in 10 minutes.`);
    await recordLoginAttempt(req, { userId: user.id, email, success: true, otpVerified: false });
    return { requiresOtp: true as const, userId: user.id };
  }

  await recordLoginAttempt(req, { userId: user.id, email, success: true, otpVerified: true });
  const session = await createSession(user.id, req);
  const theme = await resolveTheme(user.id);
  return { requiresOtp: false as const, userId: user.id, session, theme };
}

export async function confirmLoginOtp(userId: string, otp: string, req: Request, trust: boolean) {
  const result = await verifyOtp(userId, 'login', otp);
  if (!result.ok) throw new AppError(400, `otp_${result.reason}`, otpErrorMessage(result.reason));

  const fingerprint = fingerprintRequest(req);
  if (trust) {
    const { browser, os } = parseUserAgent(req.headers['user-agent'] as string | undefined);
    await trustDevice(userId, fingerprint, browser, os);
  }
  const session = await createSession(userId, req);
  const theme = await resolveTheme(userId);
  return { ...session, theme };
}

export async function confirmRegistrationOtp(userId: string, otp: string) {
  const result = await verifyOtp(userId, 'registration', otp);
  if (!result.ok) throw new AppError(400, `otp_${result.reason}`, otpErrorMessage(result.reason));
  await query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [userId]);
}

export async function logout(token: string) {
  const session = await findSessionByToken(token);
  if (session) await revokeSession(session.id);
}

export async function forgotPassword(email: string) {
  const [user] = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (!user) return; // don't reveal whether the email exists
  const otp = await createOtp(user.id, 'email', 'password_reset');
  await sendEmail(email, 'Reset your password', `Your password reset code is: ${otp}\nExpires in 10 minutes.`);
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  const [user] = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (!user) throw new AppError(400, 'otp_incorrect', 'Invalid code.');
  const result = await verifyOtp(user.id, 'password_reset', otp);
  if (!result.ok) throw new AppError(400, `otp_${result.reason}`, otpErrorMessage(result.reason));
  const passwordHash = await argon2.hash(newPassword);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, user.id]);
}

export async function resendOtp(email: string, purpose: OtpPurpose) {
  const [user] = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (!user) return; // don't reveal whether the email exists
  const otp = await createOtp(user.id, 'email', purpose);
  const subjectLine = purpose === 'password_reset' ? 'Reset your password' : 'Your verification code';
  await sendEmail(email, subjectLine, `Your code is: ${otp}\nExpires in 10 minutes.`);
}

function otpErrorMessage(reason: string) {
  switch (reason) {
    case 'expired': return 'That code has expired — request a new one.';
    case 'too_many_attempts': return 'Too many incorrect attempts — request a new code.';
    case 'no_pending_otp': return 'No pending verification found — request a new code.';
    default: return 'That code is incorrect.';
  }
}
