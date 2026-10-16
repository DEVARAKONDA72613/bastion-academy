import crypto from 'crypto';
import { pool, withTransaction } from '../../core/db.js';
import { AppError, errors } from '../../core/errors.js';
import { can, type Subject } from '../../core/permissions.js';

function generateRoomCode() {
  return 'BASTION-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

export async function createMeeting(subject: Subject, data: { title: string; type: 'one_to_one' | 'group'; scheduledAt?: string; maxParticipants?: number; recordingEnabled?: boolean }) {
  if (!can(subject, 'meeting.host')) throw errors.forbidden('Hosting a live room requires the Gold plan or an instructor role.');

  const roomCode = generateRoomCode();
  const { rows } = await pool.query(
    `INSERT INTO meetings (host_id, title, room_code, type, max_participants, recording_enabled, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [subject.id, data.title, roomCode, data.type, data.maxParticipants ?? 50, !!data.recordingEnabled, data.scheduledAt ?? null]
  );
  await pool.query(
    `INSERT INTO meeting_participants (meeting_id, user_id, participant_role) VALUES ($1, $2, 'host')`,
    [rows[0].id, subject.id]
  );
  return rows[0];
}

/**
 * Full join authorization — capacity, lock state, and duplicate-join are all
 * checked inside one transaction so two simultaneous join requests at exactly
 * the capacity limit can't both succeed (same pattern as the download quota fix).
 */
export async function joinMeeting(subject: Subject, roomCode: string) {
  if (!can(subject, 'meeting.join')) throw errors.planRequired('BRONZE');

  return withTransaction(async (client) => {
    const { rows: meetingRows } = await client.query(
      `SELECT * FROM meetings WHERE room_code = $1 FOR UPDATE`,
      [roomCode]
    );
    const meeting = meetingRows[0];
    if (!meeting) throw errors.notFound('Meeting');
    if (meeting.status === 'ended') throw new AppError(400, 'meeting_ended', 'This meeting has already ended.');

    const { rows: existingRows } = await client.query(
      `SELECT id, mic_state, left_at FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
      [meeting.id, subject.id]
    );
    if (existingRows[0]) {
      if (existingRows[0].mic_state === 'removed') {
        throw new AppError(403, 'removed_by_host', 'The host removed you from this meeting.');
      }
      // A still-active participant can refresh/reconnect in a locked room. Someone
      // who has actually left (left_at set after the disconnect grace) is a new
      // join for lock purposes and must wait for the host to unlock the room.
      if (meeting.is_locked && existingRows[0].left_at) {
        throw new AppError(403, 'meeting_locked', 'This meeting is locked to new participants.');
      }
      // Duplicate join (refresh, double-click, reconnect) — update joined_at, don't error or double-count capacity.
      await client.query(`UPDATE meeting_participants SET joined_at = now(), left_at = NULL WHERE id = $1`, [existingRows[0].id]);
      return { meeting, rejoined: true };
    }

    if (meeting.is_locked) throw new AppError(403, 'meeting_locked', 'This meeting is locked to new participants.');

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) AS count FROM meeting_participants WHERE meeting_id = $1 AND left_at IS NULL`,
      [meeting.id]
    );
    if (Number(countRows[0].count) >= meeting.max_participants) {
      throw new AppError(409, 'meeting_full', 'This meeting has reached its participant limit.');
    }

    await client.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, participant_role, joined_at) VALUES ($1, $2, 'participant', now())`,
      [meeting.id, subject.id]
    );
    if (meeting.status === 'scheduled') {
      await client.query(`UPDATE meetings SET status = 'live', started_at = COALESCE(started_at, now()) WHERE id = $1`, [meeting.id]);
    }

    return { meeting, rejoined: false };
  });
}

export async function getMeetingSnapshot(meetingId: string, userId: string) {
  const { rows: accessRows } = await pool.query(
    `SELECT 1 FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, userId]
  );
  if (!accessRows[0]) throw errors.forbidden('You are not a participant in this meeting.');

  const { rows: meetingRows } = await pool.query(`SELECT * FROM meetings WHERE id = $1`, [meetingId]);
  const { rows: participants } = await pool.query(
    `SELECT mp.user_id, mp.participant_role, mp.mic_state, mp.camera_state, mp.connection_quality, mp.is_muted_by_host, p.display_name,
            COALESCE(mper.can_share_screen, true) AS can_share_screen, COALESCE(mper.can_chat, true) AS can_chat
     FROM meeting_participants mp JOIN profiles p ON p.user_id = mp.user_id
     LEFT JOIN meeting_permissions mper ON mper.meeting_id = mp.meeting_id AND mper.user_id = mp.user_id
     WHERE mp.meeting_id = $1 AND mp.left_at IS NULL`,
    [meetingId]
  );
  return { meeting: meetingRows[0], participants };
}

async function assertHostOrCoHost(meetingId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT participant_role FROM meeting_participants
     WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL AND mic_state <> 'removed'`,
    [meetingId, userId]
  );
  if (!rows[0] || !['host', 'co_host'].includes(rows[0].participant_role)) {
    throw errors.forbidden('Only the host or a co-host can do that.');
  }
}

async function assertHost(meetingId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT host_id FROM meetings WHERE id = $1`,
    [meetingId]
  );
  if (!rows[0] || rows[0].host_id !== userId) throw errors.forbidden('Only the host can do that.');
}

async function assertCanModerateTarget(meetingId: string, actingUserId: string, targetUserId: string) {
  const { rows } = await pool.query(
    `SELECT m.host_id, actor.participant_role AS actor_role, target.participant_role AS target_role
     FROM meetings m
     JOIN meeting_participants actor ON actor.meeting_id = m.id AND actor.user_id = $2 AND actor.left_at IS NULL
     JOIN meeting_participants target ON target.meeting_id = m.id AND target.user_id = $3 AND target.left_at IS NULL
     WHERE m.id = $1 AND target.mic_state <> 'removed'`,
    [meetingId, actingUserId, targetUserId]
  );
  if (!rows[0]) throw new AppError(404, 'participant_not_found', 'Active meeting participant not found.');
  if (rows[0].host_id === targetUserId || rows[0].target_role === 'host') {
    throw errors.forbidden('The meeting host cannot be moderated by another participant.');
  }
  if (rows[0].actor_role === 'co_host' && rows[0].target_role !== 'participant') {
    throw errors.forbidden('Co-hosts can moderate participants, but not the host or another co-host.');
  }
}

export async function lockMeeting(meetingId: string, userId: string, locked: boolean) {
  await assertHost(meetingId, userId);
  await pool.query(`UPDATE meetings SET is_locked = $2 WHERE id = $1`, [meetingId, locked]);
}

export async function muteParticipant(meetingId: string, actingUserId: string, targetUserId: string) {
  await assertHostOrCoHost(meetingId, actingUserId);
  await assertCanModerateTarget(meetingId, actingUserId, targetUserId);
  const { rows } = await pool.query(
    `UPDATE meeting_participants
     SET is_muted_by_host = NOT is_muted_by_host,
         mic_state = CASE WHEN NOT is_muted_by_host THEN 'off' ELSE mic_state END
     WHERE meeting_id = $1 AND user_id = $2
     RETURNING is_muted_by_host, mic_state, camera_state`,
    [meetingId, targetUserId]
  );
  return rows[0];
}

export async function removeParticipant(meetingId: string, actingUserId: string, targetUserId: string) {
  await assertHostOrCoHost(meetingId, actingUserId);
  await assertCanModerateTarget(meetingId, actingUserId, targetUserId);
  await pool.query(
    `UPDATE meeting_participants SET left_at = now(), mic_state = 'removed' WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, targetUserId]
  );
}

export async function setCoHost(meetingId: string, actingUserId: string, targetUserId: string, grant: boolean) {
  await assertHost(meetingId, actingUserId);
  const { rows: targets } = await pool.query(
    `SELECT participant_role FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL AND mic_state <> 'removed'`,
    [meetingId, targetUserId]
  );
  if (!targets[0] || targets[0].participant_role === 'host') throw new AppError(404, 'participant_not_found', 'Active participant not found.');
  await pool.query(
    `UPDATE meeting_participants SET participant_role = $3 WHERE meeting_id = $1 AND user_id = $2`,
    [meetingId, targetUserId, grant ? 'co_host' : 'participant']
  );
}

export async function setParticipantPermissions(
  meetingId: string,
  actingUserId: string,
  targetUserId: string,
  permissions: { canShareScreen?: boolean; canChat?: boolean }
) {
  await assertHost(meetingId, actingUserId);
  const { rows: participants } = await pool.query(
    `SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL AND mic_state <> 'removed'`,
    [meetingId, targetUserId]
  );
  if (!participants[0]) throw new AppError(404, 'participant_not_found', 'Active participant not found.');
  const { rows } = await pool.query(
    `INSERT INTO meeting_permissions (meeting_id, user_id, can_share_screen, can_chat)
     VALUES ($1, $2, COALESCE($3, true), COALESCE($4, true))
     ON CONFLICT (meeting_id, user_id) DO UPDATE SET
       can_share_screen = COALESCE($3, meeting_permissions.can_share_screen),
       can_chat = COALESCE($4, meeting_permissions.can_chat),
       updated_at = now()
     RETURNING can_share_screen, can_chat`,
    [meetingId, targetUserId, permissions.canShareScreen ?? null, permissions.canChat ?? null]
  );
  return rows[0];
}

export async function startRecording(meetingId: string, userId: string, consentConfirmed: boolean) {
  await assertHost(meetingId, userId);
  if (!consentConfirmed) throw new AppError(400, 'consent_required', 'Recording consent must be explicitly confirmed before starting.');
  await pool.query(
    `INSERT INTO recordings (meeting_id, consent_confirmed, started_at, status) VALUES ($1, true, now(), 'recording')`,
    [meetingId]
  );
}

export async function listMeetingHistory(userId: string) {
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.room_code, m.type, m.status, m.started_at, m.ended_at, mp.participant_role
     FROM meeting_participants mp JOIN meetings m ON m.id = mp.meeting_id
     WHERE mp.user_id = $1 ORDER BY m.scheduled_at DESC NULLS LAST, m.created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}


export async function endMeeting(meetingId: string, userId: string) {
  await assertHost(meetingId, userId);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE meetings SET status = 'ended', ended_at = COALESCE(ended_at, now())
       WHERE id = $1 AND status <> 'ended' RETURNING id`,
      [meetingId]
    );
    if (rows.length) {
      await client.query(
        `UPDATE meeting_participants SET left_at = COALESCE(left_at, now())
         WHERE meeting_id = $1 AND left_at IS NULL`,
        [meetingId]
      );
      // This platform records consent and recording intent only; it does not capture media yet.
      await client.query(
        `UPDATE recordings SET status = 'failed', ended_at = COALESCE(ended_at, now())
         WHERE meeting_id = $1 AND status = 'recording'`,
        [meetingId]
      );
    }
  });
}
