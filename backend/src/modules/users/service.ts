import { query } from '../../core/db.js';
import { AppError } from '../../core/errors.js';

export async function getMe(userId: string) {
  const [row] = await query<{
    id: string; email: string; theme_preference: string; role: string; plan_code: string;
    display_name: string; avatar_url: string | null; bio: string | null;
    country: string | null; state: string | null; city: string | null; preferred_language: string;
  }>(
    `SELECT u.id, u.email, u.theme_preference, r.name AS role,
            COALESCE(sp.code, 'FREE') AS plan_code,
            p.display_name, p.avatar_url, p.bio, p.country, p.state, p.city, p.preferred_language
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN profiles p ON p.user_id = u.id
     LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
       AND (us.expires_at IS NULL OR us.expires_at > now())
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  if (!row) throw new AppError(404, 'not_found', 'User not found.');
  return row;
}

export async function updateProfile(userId: string, fields: Partial<{
  displayName: string; bio: string; country: string; state: string; city: string; preferredLanguage: string;
}>) {
  await query(
    `UPDATE profiles SET
       display_name = COALESCE($2, display_name),
       bio = COALESCE($3, bio),
       country = COALESCE($4, country),
       state = COALESCE($5, state),
       city = COALESCE($6, city),
       preferred_language = COALESCE($7, preferred_language)
     WHERE user_id = $1`,
    [userId, fields.displayName, fields.bio, fields.country, fields.state, fields.city, fields.preferredLanguage]
  );
}

export async function updateTheme(userId: string, theme: 'auto' | 'light' | 'dark') {
  await query(`UPDATE users SET theme_preference = $2 WHERE id = $1`, [userId, theme]);
}

export async function listSessions(userId: string, currentSessionId?: string) {
  const rows = await query<{ id: string; ip_address: string; device_info: string; created_at: string; expires_at: string }>(
    `SELECT id, ip_address, device_info, created_at, expires_at FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((r) => ({ ...r, isCurrent: r.id === currentSessionId }));
}

export async function revokeOwnSession(userId: string, sessionId: string) {
  const [row] = await query(`SELECT id FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
  if (!row) throw new AppError(404, 'not_found', 'Session not found.');
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}

export async function listLoginHistory(userId: string, limit = 20, offset = 0) {
  return query(
    `SELECT ip_address, browser, os, device_type, city, state, country, success, otp_verified, created_at
     FROM login_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  // Note: city/state/country will be null until an IP-geolocation provider is
  // configured (see auth/service.ts's recordLoginAttempt comment) — these are
  // always IP-derived approximations, never exact location, per Section 9.
}

export async function listTrustedDevices(userId: string) {
  return query(
    `SELECT id, device_fingerprint, browser, os, trusted_until, created_at
     FROM trusted_devices WHERE user_id = $1 AND trusted_until > now() ORDER BY created_at DESC`,
    [userId]
  );
}

export async function removeTrustedDevice(userId: string, deviceId: string) {
  const [row] = await query(`SELECT id FROM trusted_devices WHERE id = $1 AND user_id = $2`, [deviceId, userId]);
  if (!row) throw new AppError(404, 'not_found', 'Trusted device not found.');
  await query(`DELETE FROM trusted_devices WHERE id = $1`, [deviceId]);
}
