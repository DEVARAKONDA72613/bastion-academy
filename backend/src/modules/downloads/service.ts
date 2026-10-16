import { pool, withTransaction } from '../../core/db.js';
import { AppError, errors } from '../../core/errors.js';
import { can, type Subject } from '../../core/permissions.js';
import { getVideoStreamUrl } from '../videos/service.js';

function parseUserAgent(ua: string | undefined) {
  if (!ua) return { browser: 'unknown', device: 'unknown' };
  const browser = /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const device = /mobile/i.test(ua) ? 'mobile' : 'desktop';
  return { browser, device };
}

/**
 * Full server-side authorization flow per spec Section 5. Every step runs
 * before a download record is created — none of this is trusted from the client.
 */
export async function requestDownload(
  subject: Subject,
  videoId: string,
  req: { ip?: string; headers: Record<string, unknown> }
) {
  return withTransaction(async (client) => {
    // 1-2. Authenticate + verify subscription — already done: `subject` was
    // loaded fresh from the DB by requireAuth on this exact request.

    // 3. Verify video exists and is accessible at all (published, not deleted).
    const { rows: videoRows } = await client.query(
      `SELECT id, required_plan_code, status, deleted_at FROM videos WHERE id = $1 FOR SHARE`,
      [videoId]
    );
    const video = videoRows[0];
    if (!video || video.status !== 'published' || video.deleted_at) throw errors.notFound('Video');

    // 4. Verify plan grants access to THIS video (not just that downloads are allowed at all).
    if (!can(subject, 'video.watch', { requiredPlan: video.required_plan_code })) {
      throw errors.planRequired(video.required_plan_code);
    }

    // 5. Duplicate-request guard: if this user already has a download record
    // for this video today (any status), return it rather than double-counting
    // quota — this is what makes a browser refresh, a duplicate click, or a
    // retried request safe instead of silently consuming extra quota.
    const { rows: existingRows } = await client.query(
      `SELECT * FROM downloads WHERE user_id = $1 AND video_id = $2 AND requested_at::date = CURRENT_DATE
       ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`,
      [subject.id, videoId]
    );
    if (existingRows[0]) {
      return { download: existingRows[0], alreadyRequested: true };
    }

    // 6. Look up the plan's configured daily limit (centralized config —
    // see subscription_plans.download_daily_limit, never hardcoded here).
    const { rows: planRows } = await client.query(
      `SELECT download_daily_limit FROM subscription_plans WHERE code = $1`,
      [subject.planCode]
    );
    const dailyLimit = planRows[0]?.download_daily_limit ?? 1;

    // 7. Atomic quota check-and-increment. This single conditional UPSERT is
    // what prevents the race condition the spec calls out: two simultaneous
    // requests can't both pass a "check count, then insert" because Postgres
    // serializes the row-level UPDATE — only one can match the WHERE clause
    // once the limit is reached. -1 (unlimited, e.g. GOLD) always passes.
    const { rows: quotaRows } = await client.query(
      `INSERT INTO download_quota (user_id, quota_date, downloads_used)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, quota_date)
       DO UPDATE SET downloads_used = download_quota.downloads_used + 1
       WHERE $2 = -1 OR download_quota.downloads_used < $2
       RETURNING downloads_used`,
      [subject.id, dailyLimit]
    );
    if (quotaRows.length === 0) throw errors.quotaExceeded();

    // 8. Create the audit record — this is an authorized request, not proof that a file was delivered.
    // Plan is snapshotted at request time so the
    // record stays accurate even if the user's plan later changes.
    const ua = (req.headers['user-agent'] as string) ?? undefined;
    const { browser, device } = parseUserAgent(ua);
    const { rows: downloadRows } = await client.query(
      `INSERT INTO downloads (user_id, video_id, status, ip_address, device, browser, plan_code_used, completed_at)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, NULL) RETURNING *`,
      [subject.id, videoId, req.ip ?? '0.0.0.0', device, browser, subject.planCode]
    );

    return { download: downloadRows[0], alreadyRequested: false };
  }).then(async (result) => {
    // 9. Return a stream URL. This project does not yet have a storage/CDN completion callback.
    // Done outside the transaction since it's not a DB write.
    const streamInfo = await getVideoStreamUrl(videoId, subject);
    return { ...result, ...streamInfo };
  });
}

export async function listDownloads(userId: string) {
  const { rows } = await pool.query(
    `SELECT d.id, d.video_id, d.status, d.file_size_bytes, d.plan_code_used, d.requested_at, d.completed_at,
            v.title AS video_title, v.thumbnail_url
     FROM downloads d JOIN videos v ON v.id = d.video_id
     WHERE d.user_id = $1 ORDER BY d.requested_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function getQuotaStatus(subject: Subject) {
  const { rows: planRows } = await pool.query(`SELECT download_daily_limit FROM subscription_plans WHERE code = $1`, [subject.planCode]);
  const limit = planRows[0]?.download_daily_limit ?? 1;

  const { rows: quotaRows } = await pool.query(
    `SELECT downloads_used FROM download_quota WHERE user_id = $1 AND quota_date = CURRENT_DATE`,
    [subject.id]
  );
  const used = quotaRows[0]?.downloads_used ?? 0;

  return {
    planCode: subject.planCode,
    limit: limit === -1 ? 'unlimited' : limit,
    used,
    remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - used),
  };
}
