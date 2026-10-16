import { query } from './db.js';
import type { Subject } from './permissions.js';

export async function loadSubject(userId: string): Promise<Subject | null> {
  const [user] = await query<{ id: string; role: string }>(
    `SELECT u.id, r.name AS role FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  if (!user) return null;

  const [sub] = await query<{ code: string }>(
    `SELECT sp.code FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1 AND us.status = 'active' AND (us.expires_at IS NULL OR us.expires_at > now())
     ORDER BY us.created_at DESC LIMIT 1`,
    [userId]
  );

  return {
    id: user.id,
    role: user.role as Subject['role'],
    planCode: sub?.code ?? 'FREE', // no active row falls back to FREE — matches Section 6's "expired → FREE" rule
  };
}
