import crypto from 'crypto';
import { query } from './db.js';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashOtp(otp: string) {
  // sha256 is fine here — OTPs are short-lived (10 min) and single-use,
  // unlike passwords, so we don't need an expensive/memory-hard hash.
  return crypto.createHash('sha256').update(otp + (process.env.SESSION_SECRET ?? '')).digest('hex');
}

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

export type OtpPurpose = 'registration' | 'login' | 'password_reset';

export async function createOtp(userId: string, channel: 'email' | 'sms', purpose: OtpPurpose) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO otp_verifications (user_id, channel, otp_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, channel, hashOtp(otp), purpose, expiresAt]
  );
  return otp; // caller sends this via email/sms — never logged or returned to the client directly
}

export async function verifyOtp(userId: string, purpose: OtpPurpose, submittedOtp: string) {
  const [row] = await query<{
    id: string; otp_hash: string; expires_at: string; attempts: number; verified_at: string | null;
  }>(
    `SELECT id, otp_hash, expires_at, attempts, verified_at FROM otp_verifications
     WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );

  if (!row) return { ok: false as const, reason: 'no_pending_otp' as const };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false as const, reason: 'too_many_attempts' as const };
  if (new Date(row.expires_at) < new Date()) return { ok: false as const, reason: 'expired' as const };

  await query(`UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1`, [row.id]);

  if (hashOtp(submittedOtp) !== row.otp_hash) return { ok: false as const, reason: 'incorrect' as const };

  await query(`UPDATE otp_verifications SET verified_at = now() WHERE id = $1`, [row.id]);
  return { ok: true as const };
}
