import jwt from 'jsonwebtoken';
import { query } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { can, type Subject } from '../../core/permissions.js';

export async function listCourses() {
  return query(
    `SELECT c.id, c.title, c.slug, c.description, c.thumbnail_url, c.is_premium, c.required_plan_code,
            cat.name AS category_name, p.display_name AS instructor_name
     FROM courses c
     JOIN categories cat ON cat.id = c.category_id
     JOIN profiles p ON p.user_id = c.instructor_id
     WHERE c.status = 'published' AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`
  );
}

export async function getCourseBySlug(slug: string, subject?: Subject) {
  const [course] = await query<{
    id: string; title: string; slug: string; description: string; is_premium: boolean;
    required_plan_code: string; instructor_id: string; instructor_name: string;
  }>(
    `SELECT c.id, c.title, c.slug, c.description, c.is_premium, c.required_plan_code,
            c.instructor_id, p.display_name AS instructor_name
     FROM courses c JOIN profiles p ON p.user_id = c.instructor_id
     WHERE c.slug = $1 AND c.status = 'published' AND c.deleted_at IS NULL`,
    [slug]
  );
  if (!course) throw new AppError(404, 'not_found', 'Course not found.');

  const videos = await query<{ id: string; title: string; duration_seconds: number; order_index: number; is_premium: boolean; required_plan_code: string }>(
    `SELECT id, title, duration_seconds, order_index, is_premium, required_plan_code
     FROM videos WHERE course_id = $1 AND status = 'published' AND deleted_at IS NULL ORDER BY order_index`,
    [course.id]
  );

  // Lock indicator only — never hide the existence of a lesson, just whether
  // the viewer can play it. Actual stream access is re-checked server-side
  // in getVideoStreamUrl() regardless of what this returns.
  const videosWithLockState = videos.map((v) => ({
    ...v,
    locked: subject ? !can(subject, 'video.watch', { requiredPlan: v.required_plan_code }) : v.is_premium,
  }));

  return { ...course, videos: videosWithLockState };
}

async function getVideoOrThrow(videoId: string) {
  const [video] = await query<{
    id: string; course_id: string; title: string; description: string; duration_seconds: number;
    storage_url: string; is_premium: boolean; required_plan_code: string;
  }>(
    `SELECT id, course_id, title, description, duration_seconds, storage_url, is_premium, required_plan_code
     FROM videos WHERE id = $1 AND status = 'published' AND deleted_at IS NULL`,
    [videoId]
  );
  if (!video) throw new AppError(404, 'not_found', 'Video not found.');
  return video;
}

export async function getVideoMetadata(videoId: string, subject: Subject) {
  const video = await getVideoOrThrow(videoId);
  if (!can(subject, 'video.watch', { requiredPlan: video.required_plan_code })) {
    throw new AppError(403, 'plan_required', `This video requires the ${video.required_plan_code} plan or higher.`);
  }

  const { storage_url, ...metadata } = video;
  const [course] = await query<{ slug: string; title: string; order_index: number }>(
    `SELECT c.slug, c.title, v.order_index
     FROM videos v JOIN courses c ON c.id = v.course_id
     WHERE v.id = $1`,
    [videoId]
  );
  const [progress] = await query<{ position_seconds: number; completed: boolean }>(
    `SELECT position_seconds, completed FROM video_progress WHERE user_id = $1 AND video_id = $2`,
    [subject.id, videoId]
  );
  const candidates = await query<{ id: string; title: string; required_plan_code: string }>(
    `SELECT id, title, required_plan_code FROM videos
     WHERE course_id = $1 AND order_index > $2 AND status = 'published' AND deleted_at IS NULL
     ORDER BY order_index ASC`,
    [video.course_id, course?.order_index ?? -1]
  );
  const next = candidates.find((candidate) => can(subject, 'video.watch', { requiredPlan: candidate.required_plan_code }));

  return {
    ...metadata,
    course_slug: course?.slug ?? null,
    course_title: course?.title ?? null,
    next_video: next ? { id: next.id, title: next.title } : null,
    resume_position: progress?.position_seconds ?? 0,
    completed: progress?.completed ?? false,
  };
}

export async function getVideoStreamUrl(videoId: string, subject: Subject) {
  const video = await getVideoOrThrow(videoId);
  if (!can(subject, 'video.watch', { requiredPlan: video.required_plan_code })) {
    throw new AppError(403, 'plan_required', `This video requires the ${video.required_plan_code} plan or higher.`);
  }

  // Re-checked on every call specifically so a plan downgrade takes effect
  // quickly even for an already-open tab (5 min expiry), per 04-rbac-permissions.md.
  if (!process.env.CDN_BASE_URL) {
    return {
      streamUrl: video.storage_url,
      mock: true,
      note: 'No CDN_BASE_URL configured — returning the raw storage path for local dev. Wire up real S3/CloudFront signed URLs before production.',
    };
  }

  const token = jwt.sign({ videoId, userId: subject.id }, process.env.JWT_SECRET!, { expiresIn: '5m' });
  return { streamUrl: `${process.env.CDN_BASE_URL}/${videoId}?token=${token}`, mock: false, expiresInSeconds: 300 };
}

export async function saveProgress(userId: string, videoId: string, positionSeconds: number) {
  const video = await getVideoOrThrow(videoId);
  // Completion threshold: 90% watched counts as complete — matches typical
  // "mark complete" conventions and Section 7's configurable-threshold requirement.
  const completed = positionSeconds >= video.duration_seconds * 0.9;
  await query(
    `INSERT INTO video_progress (user_id, video_id, position_seconds, completed, completed_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END)
     ON CONFLICT (user_id, video_id)
     DO UPDATE SET position_seconds = $3, completed = $4,
       completed_at = CASE WHEN $4 AND video_progress.completed_at IS NULL THEN now() ELSE video_progress.completed_at END`,
    [userId, videoId, positionSeconds, completed]
  );
  return { completed };
}

export async function getCourseProgress(userId: string, courseId: string) {
  const [row] = await query<{ total: string; completed: string }>(
    `SELECT COUNT(v.id) AS total, COUNT(vp.id) FILTER (WHERE vp.completed) AS completed
     FROM videos v
     LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.user_id = $2
     WHERE v.course_id = $1 AND v.status = 'published' AND v.deleted_at IS NULL`,
    [courseId, userId]
  );
  const total = Number(row.total);
  const completed = Number(row.completed);
  return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export async function createCourse(instructorId: string, data: { title: string; slug: string; description: string; categoryId: string; isPremium: boolean; requiredPlanCode: string }) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO courses (title, slug, description, category_id, instructor_id, is_premium, required_plan_code, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING id`,
    [data.title, data.slug, data.description, data.categoryId, instructorId, data.isPremium, data.requiredPlanCode]
  );
  return row;
}

export async function assertCourseOwnership(courseId: string, instructorId: string) {
  const [row] = await query(`SELECT id FROM courses WHERE id = $1 AND instructor_id = $2`, [courseId, instructorId]);
  if (!row) throw new AppError(403, 'forbidden', "You don't own this course.");
}
