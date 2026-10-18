import argon2 from 'argon2';
import crypto from 'node:crypto';
import { verifyGoogleIdToken } from '../../core/google-id-token.js';
import type { Request } from 'express';
import { computeDefaultThemeForNow } from '../../core/theme.js';
import { query, withTransaction } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { createOtp, verifyOtp, verifyOtpWithClient, type OtpPurpose } from '../../core/otp.js';
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


export async function googleLogin(credential: string, req: Request) {
  const identity = await verifyGoogleIdToken(credential);
  const email = identity.email;

  let [user] = await query<{ id: string; status: string; deleted_at: string | null }>(
    `SELECT id, status, deleted_at FROM users WHERE email = $1`,
    [email]
  );

  if (user?.deleted_at) {
    throw new AppError(403, 'account_unavailable', 'This account is no longer available.');
  }

  if (!user) {
    // Google-only accounts still need a non-null password_hash in the current schema.
    // The random password is never revealed or used for password login.
    const passwordHash = await argon2.hash(crypto.randomBytes(48).toString('base64url'));

    user = await withTransaction(async (client) => {
      // Re-check inside the transaction. Concurrent first-time Google sign-ins
      // must not create orphaned user/profile/subscription records.
      const existingResult = await client.query<{ id: string; status: string; deleted_at: string | null }>(
        `SELECT id, status, deleted_at FROM users WHERE email = $1 FOR UPDATE`,
        [email]
      );
      const existing = existingResult.rows[0];
      if (existing) return existing;

      const roleResult = await client.query<{ id: string }>(`SELECT id FROM roles WHERE name = 'free'`);
      const freeRole = roleResult.rows[0];
      if (!freeRole) throw new AppError(500, 'account_setup_failed', 'Could not create your account right now.');

      const insertedResult = await client.query<{ id: string; status: string; deleted_at: string | null }>(
        `INSERT INTO users (email, password_hash, role_id, email_verified_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (email) DO NOTHING
         RETURNING id, status, deleted_at`,
        [email, passwordHash, freeRole.id]
      );
      const created = insertedResult.rows[0];

      if (!created) {
        // A competing registration/sign-in created this email first.
        const conflictResult = await client.query<{ id: string; status: string; deleted_at: string | null }>(
          `SELECT id, status, deleted_at FROM users WHERE email = $1`,
          [email]
        );
        const conflict = conflictResult.rows[0];
        if (!conflict) throw new AppError(500, 'account_setup_failed', 'Could not create your account right now.');
        return conflict;
      }

      await client.query(
        `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
        [created.id, identity.name?.trim().slice(0, 80) || email.split('@')[0]]
      );
      const subscriptionResult = await client.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status)
         SELECT $1, id, 'active' FROM subscription_plans WHERE code = 'FREE'
         RETURNING user_id`,
        [created.id]
      );
      if (subscriptionResult.rows.length !== 1) {
        throw new AppError(500, 'account_setup_failed', 'Could not create your account right now.');
      }

      return created;
    });
  }

  if (!user || user.deleted_at) {
    throw new AppError(403, 'account_unavailable', 'This account is no longer available.');
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'account_inactive', 'This account is suspended or deactivated.');
  }

  // Google has verified ownership of this email address.
  await query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [user.id]);

  const fingerprint = fingerprintRequest(req);
  const trusted = await isTrustedDevice(user.id, fingerprint);
  if (!trusted) {
    const otp = await createOtp(user.id, 'email', 'login');
    await sendEmail(email, "Confirm it's you", `New Google sign-in detected. Your login code is: ${otp}\nExpires in 10 minutes.`);
    await recordLoginAttempt(req, { userId: user.id, email, success: true, otpVerified: false });
    return { requiresOtp: true as const, userId: user.id, email };
  }

  await recordLoginAttempt(req, { userId: user.id, email, success: true, otpVerified: true });
  const session = await createSession(user.id, req);
  const theme = await resolveTheme(user.id);
  return { requiresOtp: false as const, userId: user.id, email, session, theme };
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
  const [candidate] = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL AND status = 'active'`,
    [email]
  );
  if (!candidate) throw new AppError(400, 'otp_incorrect', 'Invalid code.');

  const passwordHash = await argon2.hash(newPassword);
  const outcome = await withTransaction(async (client) => {
    const currentResult = await client.query<{ id: string; status: string; deleted_at: string | null }>(
      `SELECT id, status, deleted_at FROM users WHERE id = $1 FOR UPDATE`,
      [candidate.id]
    );
    const current = currentResult.rows[0];
    if (!current || current.deleted_at || current.status !== 'active') {
      return { kind: 'unavailable' as const };
    }

    // On OTP failure, return instead of throwing here so the incremented attempt
    // count commits. On success, OTP consumption, password update and session
    // revocation all commit together or all roll back together.
    const verification = await verifyOtpWithClient(client, current.id, 'password_reset', otp);
    if (!verification.ok) {
      return { kind: 'otp_failure' as const, reason: verification.reason };
    }

    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, current.id]);
    await client.query(
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [current.id]
    );
    return { kind: 'success' as const };
  });

  if (outcome.kind === 'otp_failure') {
    throw new AppError(400, `otp_${outcome.reason}`, otpErrorMessage(outcome.reason));
  }
  if (outcome.kind !== 'success') {
    throw new AppError(400, 'otp_incorrect', 'Invalid code.');
  }
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
