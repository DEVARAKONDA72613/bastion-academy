import { pool } from '../../core/db.js';
import { AppError } from '../../core/errors.js';
import { checkComment, isFlooding } from '../../core/moderation.js';
import { translateText } from '../../core/notify/translate.js';

type SortOrder = 'newest' | 'oldest' | 'top' | 'relevant';

export async function listComments(videoId: string, sort: SortOrder = 'newest', limit = 20, offset = 0) {
  const orderBy = {
    newest: 'c.created_at DESC',
    oldest: 'c.created_at ASC',
    top: 'like_count DESC, c.created_at DESC',
    relevant: 'like_count DESC, reply_count DESC, c.created_at DESC',
  }[sort];

  const { rows } = await pool.query(
    `SELECT c.id, c.parent_comment_id, c.content, c.original_language, c.is_edited, c.edited_at,
            c.status, c.created_at, c.user_id, p.display_name, p.avatar_url, p.city,
            COUNT(DISTINCT cl.id) FILTER (WHERE cl.vote_type = 'like') AS like_count,
            COUNT(DISTINCT cl.id) FILTER (WHERE cl.vote_type = 'dislike') AS dislike_count,
            COUNT(DISTINCT replies.id) AS reply_count
     FROM comments c
     LEFT JOIN profiles p ON p.user_id = c.user_id
     LEFT JOIN comment_likes cl ON cl.comment_id = c.id
     LEFT JOIN comments replies ON replies.parent_comment_id = c.id AND replies.status = 'visible'
     WHERE c.video_id = $1 AND c.parent_comment_id IS NULL
       AND (c.status = 'visible' OR (c.status = 'deleted' AND EXISTS (
         SELECT 1 FROM comments r WHERE r.parent_comment_id = c.id AND r.status = 'visible'
       )))
     GROUP BY c.id, p.display_name, p.avatar_url, p.city
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [videoId, limit, offset]
  );
  return rows;
}

export async function listReplies(parentCommentId: string) {
  const { rows } = await pool.query(
    `SELECT c.id, c.content, c.is_edited, c.edited_at, c.status, c.created_at, c.user_id, p.display_name, p.avatar_url
     FROM comments c LEFT JOIN profiles p ON p.user_id = c.user_id
     WHERE c.parent_comment_id = $1 AND c.status != 'hidden' ORDER BY c.created_at ASC`,
    [parentCommentId]
  );
  // Tombstone rendering for soft-deleted comments with replies still intact (Section 10 edge case).
  return rows.map((r) => (r.status === 'deleted' ? { ...r, content: '[comment deleted]' } : r));
}

export async function postComment(userId: string, videoId: string, content: string, parentCommentId: string | null) {
  const { rows: videoRows } = await pool.query<{ id: string }>(
  `SELECT id FROM videos WHERE id = $1 AND status = 'published' AND deleted_at IS NULL`,
  [videoId]
);

if (!videoRows[0]) {
  throw new AppError(404, 'not_found', 'Video not found.');
}

  const moderation = checkComment(content);
  if (!moderation.allowed) throw new AppError(400, 'comment_rejected', `Comment rejected: ${moderation.reason}`);

  const { rows: recentRows } = await pool.query(
    `SELECT created_at FROM comments WHERE user_id = $1 AND created_at > now() - interval '60 seconds'`,
    [userId]
  );
  if (isFlooding(recentRows.map((r) => new Date(r.created_at)))) {
    throw new AppError(429, 'rate_limited', "You're posting comments too quickly — slow down a bit.");
  }

  if (parentCommentId) {
    const { rows: parentRows } = await pool.query(
      `SELECT id, video_id, status FROM comments WHERE id = $1`,
      [parentCommentId]
    );
    // Do not allow a reply to attach a thread from a different lesson. A soft-deleted
    // parent is allowed so its tombstone can continue to hold the existing discussion.
    if (!parentRows[0] || parentRows[0].video_id !== videoId || parentRows[0].status === 'hidden') {
      throw new AppError(404, 'not_found', 'Parent comment not found in this lesson.');
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO comments (video_id, user_id, parent_comment_id, content) VALUES ($1, $2, $3, $4) RETURNING *`,
    [videoId, userId, parentCommentId, content]
  );

  if (moderation.flagged) {
    await pool.query(
      `INSERT INTO moderation_actions (target_type, target_id, action, reason) VALUES ('comment', $1, 'flagged', $2)`,
      [rows[0].id, moderation.reason]
    );
  }

  return rows[0];
}

export async function editComment(userId: string, commentId: string, content: string) {
  const moderation = checkComment(content);
  if (!moderation.allowed) throw new AppError(400, 'comment_rejected', `Comment rejected: ${moderation.reason}`);

  const { rows } = await pool.query(
    `UPDATE comments SET content = $3, is_edited = true, edited_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'visible'
       AND created_at >= now() - interval '15 minutes' RETURNING *`,
    [commentId, userId, content]
  );
  if (!rows[0]) throw new AppError(404, 'not_found', 'Comment not found or not yours to edit.');
  return rows[0];
}

export async function deleteComment(userId: string, commentId: string, isAdmin: boolean) {
  const { rows } = await pool.query(`SELECT user_id, created_at, status FROM comments WHERE id = $1`, [commentId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Comment not found.');
  if (!isAdmin && rows[0].user_id !== userId) throw new AppError(403, 'forbidden', 'Not your comment.');
  if (!isAdmin && (rows[0].status === 'deleted' || new Date(rows[0].created_at).getTime() < Date.now() - 15 * 60 * 1000)) {
    throw new AppError(403, 'edit_window_expired', 'Comments can only be edited or deleted during the first 15 minutes.');
  }

  // Soft delete with tombstone — never hard-delete, since replies may reference this comment.
  await pool.query(`UPDATE comments SET status = 'deleted', content = '[comment deleted]' WHERE id = $1`, [commentId]);
}

export async function likeComment(userId: string, commentId: string, voteType: 'like' | 'dislike') {
  await pool.query(
    `INSERT INTO comment_likes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)
     ON CONFLICT (comment_id, user_id) DO UPDATE SET vote_type = $3, created_at = now()`,
    [commentId, userId, voteType]
  );
  // Note: dislikes are tracked but NEVER trigger auto-deletion — per spec, only
  // explicit moderation action (see admin module) removes a comment.
}

export async function translateComment(commentId: string, targetLanguage: string) {
  const { rows } = await pool.query(`SELECT content, original_language FROM comments WHERE id = $1`, [commentId]);
  if (!rows[0]) throw new AppError(404, 'not_found', 'Comment not found.');
  if (rows[0].original_language === targetLanguage) return { translated: rows[0].content, alreadyInLanguage: true };

  try {
    const translated = await translateText(rows[0].content, targetLanguage);
    return { translated, alreadyInLanguage: false };
  } catch {
    throw new AppError(502, 'translation_failed', 'Translation is temporarily unavailable — please try again.');
  }
}

export async function reportComment(reporterId: string, commentId: string, reason: string) {
  try {
    await pool.query(
      `INSERT INTO comment_reports (comment_id, reporter_id, reason) VALUES ($1, $2, $3)`,
      [commentId, reporterId, reason]
    );
  } catch (err: any) {
    // unique(comment_id, reporter_id) violation — duplicate report from the same user.
    if (err.code === '23505') throw new AppError(409, 'already_reported', "You've already reported this comment.");
    throw err;
  }
}
