import crypto from 'crypto';
import { query, withTransaction } from './db.js';
import type { PoolClient } from 'pg';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashOtp(otp: string) {
  // sha256 is fine here — OTPs are short-lived (10 min) and single-use,
  // unlike passwords, so we don't need an expensive/memory-hard hash.
  return crypto.createHash('sha256').update(otp + (process.env.SESSION_SECRET ?? '')).digest('hex');
}

function generateOtp() {
  return crypto.randomInt(100000, 1_000_000).toString();
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

export type OtpVerificationResult =
  | { ok: true }
  | { ok: false; reason: 'no_pending_otp' | 'too_many_attempts' | 'expired' | 'incorrect' };

type OtpVerificationRow = {
  id: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified_at: string | Date | null;
};

/**
 * Verify one OTP using a transaction-owned client. The SELECT ... FOR UPDATE
 * serializes concurrent attempts for this OTP row. Call only inside a transaction.
 */
export async function verifyOtpWithClient(
  client: PoolClient,
  userId: string,
  purpose: OtpPurpose,
  submittedOtp: string,
): Promise<OtpVerificationResult> {
  const result = await client.query<OtpVerificationRow>(
    `SELECT id, otp_hash, expires_at, attempts, verified_at FROM otp_verifications
     WHERE user_id = $1 AND purpose = $2 AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [userId, purpose]
  );
  const row = result.rows[0];

  if (!row) return { ok: false, reason: 'no_pending_otp' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  const expiry = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return { ok: false, reason: 'expired' };

  const expected = Buffer.from(row.otp_hash, 'hex');
  const submitted = Buffer.from(hashOtp(submittedOtp), 'hex');
  const matches = expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);

  const attemptUpdate = await client.query(
    `UPDATE otp_verifications SET attempts = attempts + 1
     WHERE id = $1 AND verified_at IS NULL RETURNING id`,
    [row.id]
  );
  if (attemptUpdate.rows.length !== 1) return { ok: false, reason: 'no_pending_otp' };

  if (!matches) return { ok: false, reason: 'incorrect' };

  const consume = await client.query(
    `UPDATE otp_verifications SET verified_at = now()
     WHERE id = $1 AND verified_at IS NULL RETURNING id`,
    [row.id]
  );
  if (consume.rows.length !== 1) return { ok: false, reason: 'no_pending_otp' };
  return { ok: true };
}

export async function verifyOtp(userId: string, purpose: OtpPurpose, submittedOtp: string) {
  // A failed code returns normally so its attempt counter is committed.
  return withTransaction((client) => verifyOtpWithClient(client, userId, purpose, submittedOtp));
}
