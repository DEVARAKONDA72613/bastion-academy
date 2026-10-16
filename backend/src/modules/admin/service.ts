import { pool } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { withAudit } from '../../core/audit.js';

function paginate(page = 1, pageSize = 25) {
  return { limit: pageSize, offset: (Math.max(1, page) - 1) * pageSize };
}

export async function listUsers(search: string | undefined, page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.status, r.name AS role, p.display_name, u.created_at
     FROM users u JOIN roles r ON r.id = u.role_id JOIN profiles p ON p.user_id = u.id
     WHERE u.deleted_at IS NULL AND ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%')
     ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
    [search ?? null, limit, offset]
  );
  return rows;
}

export async function updateUserStatus(adminId: string, targetUserId: string, status: 'active' | 'suspended' | 'deactivated', ip?: string) {
  return withAudit(
    { actorId: adminId, action: 'user.status_changed', targetType: 'user', targetId: targetUserId, metadata: { status }, ipAddress: ip },
    async () => {
      const { rows } = await pool.query(`UPDATE users SET status = $2 WHERE id = $1 RETURNING id, status`, [targetUserId, status]);
      if (!rows[0]) throw new AppError(404, 'not_found', 'User not found.');
      return rows[0];
    }
  );
}

export async function listPayments(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT p.id, p.user_id, u.email, p.amount_inr, p.status, p.razorpay_order_id, p.razorpay_payment_id, p.created_at
     FROM payments p JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listSubscriptions(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT us.id, u.email, sp.code AS plan_code, us.status, us.started_at, us.expires_at, us.auto_renew
     FROM user_subscriptions us JOIN users u ON u.id = us.user_id JOIN subscription_plans sp ON sp.id = us.plan_id
     ORDER BY us.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listDownloads(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT d.id, u.email, v.title AS video_title, d.status, d.plan_code_used, d.ip_address, d.requested_at
     FROM downloads d JOIN users u ON u.id = d.user_id JOIN videos v ON v.id = d.video_id
     ORDER BY d.requested_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listCommentReports(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT cr.id, cr.reason, cr.status, cr.created_at, c.id AS comment_id, c.content, reporter.email AS reporter_email, author.email AS author_email
     FROM comment_reports cr
     JOIN comments c ON c.id = cr.comment_id
     JOIN users reporter ON reporter.id = cr.reporter_id
     LEFT JOIN users author ON author.id = c.user_id
     WHERE cr.status = 'pending'
     ORDER BY cr.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function moderateComment(adminId: string, commentId: string, action: 'hidden' | 'deleted' | 'dismissed', reason: string | undefined, ip?: string) {
  return withAudit(
    { actorId: adminId, action: 'comment.moderated', targetType: 'comment', targetId: commentId, metadata: { action, reason }, ipAddress: ip },
    async () => {
      if (action !== 'dismissed') {
        await pool.query(`UPDATE comments SET status = $2 WHERE id = $1`, [commentId, action]);
      }
      await pool.query(
        `INSERT INTO moderation_actions (target_type, target_id, action, performed_by, reason) VALUES ('comment', $1, $2, $3, $4)`,
        [commentId, action, adminId, reason ?? null]
      );
      await pool.query(`UPDATE comment_reports SET status = 'reviewed' WHERE comment_id = $1 AND status = 'pending'`, [commentId]);
    }
  );
}

export async function listMeetings(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.room_code, m.status, m.type, u.email AS host_email, m.started_at, m.ended_at
     FROM meetings m JOIN users u ON u.id = m.host_id
     ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listLoginAttempts(page: number) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT la.id, la.email_attempted, la.ip_address, la.browser, la.os, la.success, la.otp_verified, la.created_at
     FROM login_attempts la ORDER BY la.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listAuditLogs(page: number, targetType?: string) {
  const { limit, offset } = paginate(page);
  const { rows } = await pool.query(
    `SELECT al.id, al.action, al.target_type, al.target_id, al.metadata, al.ip_address, al.created_at, u.email AS actor_email
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
     WHERE ($3::text IS NULL OR al.target_type = $3)
     ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset, targetType ?? null]
  );
  return rows;
}
