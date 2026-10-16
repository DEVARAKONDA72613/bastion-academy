import crypto from 'crypto';
import type { Request } from 'express';
import { query } from './db.js';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 720;
const TRUSTED_DEVICE_DAYS = 30;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Coarse device fingerprint from what's available without frontend JS —
// good enough to distinguish "same browser+IP" from "new device", not
// meant to be cryptographically unique. Upgrade to a client-side fingerprint
// library later if you need finer-grained trust decisions.
export function fingerprintRequest(req: Request) {
  const ua = req.headers['user-agent'] ?? 'unknown';
  const ip = req.ip ?? 'unknown';
  return crypto.createHash('sha256').update(`${ua}::${ip}`).digest('hex');
}

export async function isTrustedDevice(userId: string, fingerprint: string) {
  const [row] = await query(
    `SELECT 1 FROM trusted_devices WHERE user_id = $1 AND device_fingerprint = $2 AND trusted_until > now()`,
    [userId, fingerprint]
  );
  return !!row;
}

export async function trustDevice(userId: string, fingerprint: string, browser?: string, os?: string) {
  const trustedUntil = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60_000);
  await query(
    `INSERT INTO trusted_devices (user_id, device_fingerprint, browser, os, trusted_until)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, device_fingerprint) DO UPDATE SET trusted_until = $5`,
    [userId, fingerprint, browser ?? null, os ?? null, trustedUntil]
  );
}

export async function createSession(userId: string, req: Request) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60_000);
  await query(
    `INSERT INTO sessions (user_id, session_token_hash, ip_address, device_info, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), req.ip ?? null, req.headers['user-agent'] ?? null, expiresAt]
  );
  return { token, expiresAt };
}

export async function findSessionByToken(token: string) {
  const [row] = await query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    `SELECT id, user_id, expires_at, revoked_at FROM sessions
     WHERE session_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  return row ?? null;
}

export async function revokeSession(sessionId: string) {
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}

export const SESSION_COOKIE_NAME = 'session_token';
// Keep Lax by default (simple local development and same-site deployments). If
// the Vercel frontend and API are on different registrable domains, set
// SESSION_COOKIE_SAME_SITE=none and NODE_ENV=production so credentialed fetches
// can send the Secure, httpOnly session cookie across sites.
const crossSiteCookie = process.env.SESSION_COOKIE_SAME_SITE?.toLowerCase() === 'none';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || crossSiteCookie,
  sameSite: (crossSiteCookie ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000,
};
