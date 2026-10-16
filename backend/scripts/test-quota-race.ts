/**
 * Integration test: proves the download_quota atomic upsert actually prevents
 * the race condition described in spec Section 5. Fires 6 concurrent
 * requestDownload() calls for a FREE account (1/day limit) across 6 distinct
 * videos, and asserts exactly 1 succeeds while the other 5 are rejected with
 * 'quota_exceeded' — not via HTTP (to avoid auth/OTP complexity), but calling
 * the real service function directly against your real database.
 *
 * Run with: npm run test:quota-race
 * Requires: DATABASE_URL configured and migrations/seed already applied.
 */
import 'dotenv/config';
import { pool } from '../src/core/db.js';
import { requestDownload } from '../src/modules/downloads/service.js';
import type { Subject } from '../src/core/permissions.js';

const TEST_USER_ID = '33333333-3333-3333-3333-333333333333'; // seeded FREE user: rohan.k@example.com
const CONCURRENT_REQUESTS = 6;

async function main() {
  console.log('--- Setting up test videos ---');

  // Clean slate: remove any prior test runs' leftovers for this user/today.
  await pool.query(`DELETE FROM download_quota WHERE user_id = $1 AND quota_date = CURRENT_DATE`, [TEST_USER_ID]);
  await pool.query(`DELETE FROM downloads WHERE user_id = $1 AND requested_at::date = CURRENT_DATE`, [TEST_USER_ID]);
  await pool.query(`DELETE FROM videos WHERE slug LIKE 'quota-race-test-%'`);

  const { rows: courseRows } = await pool.query(`SELECT id FROM courses LIMIT 1`);
  const courseId = courseRows[0].id;

  const videoIds: string[] = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const { rows } = await pool.query(
      `INSERT INTO videos (course_id, title, slug, duration_seconds, storage_url, is_premium, required_plan_code, order_index, status)
       VALUES ($1, $2, $3, 600, 's3://test/race.mp4', false, 'FREE', $4, 'published') RETURNING id`,
      [courseId, `Quota Race Test Video ${i}`, `quota-race-test-${i}`, 100 + i]
    );
    videoIds.push(rows[0].id);
  }

  const subject: Subject = { id: TEST_USER_ID, role: 'free', planCode: 'FREE' };
  const fakeReq = { ip: '127.0.0.1', headers: { 'user-agent': 'quota-race-test-script' } };

  console.log(`--- Firing ${CONCURRENT_REQUESTS} concurrent download requests (FREE limit = 1/day) ---`);
  const results = await Promise.allSettled(videoIds.map((videoId) => requestDownload(subject, videoId, fakeReq)));

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const quotaRejected = results.filter((r) => r.status === 'rejected' && (r.reason as any)?.code === 'quota_exceeded');
  const otherErrors = results.filter((r) => r.status === 'rejected' && (r.reason as any)?.code !== 'quota_exceeded');

  console.log(`\nSucceeded: ${succeeded.length}`);
  console.log(`Rejected (quota_exceeded): ${quotaRejected.length}`);
  console.log(`Rejected (other reason): ${otherErrors.length}`);
  if (otherErrors.length > 0) {
    console.log('Unexpected errors:', otherErrors.map((r) => (r as PromiseRejectedResult).reason?.message));
  }

  console.log('\n--- Cleaning up test videos ---');
  await pool.query(`DELETE FROM downloads WHERE video_id = ANY($1)`, [videoIds]);
  await pool.query(`DELETE FROM videos WHERE id = ANY($1)`, [videoIds]);
  await pool.query(`DELETE FROM download_quota WHERE user_id = $1 AND quota_date = CURRENT_DATE`, [TEST_USER_ID]);

  const passed = succeeded.length === 1 && quotaRejected.length === CONCURRENT_REQUESTS - 1 && otherErrors.length === 0;
  console.log(passed ? '\n✅ PASS — race condition protection confirmed.' : '\n❌ FAIL — see counts above.');

  await pool.end();
  process.exit(passed ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Test script crashed:', err);
  await pool.end();
  process.exit(1);
});
