import type { Server, Socket } from 'socket.io';
import { pool } from './db.js';
import { findSessionByToken, SESSION_COOKIE_NAME } from './session.js';
import { loadSubject } from './subject.js';
import type { Subject } from './permissions.js';
import * as meetingsService from '../modules/meetings/service.js';

declare module 'socket.io' {
  interface SocketData {
    subject?: Subject;
  }
}

function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.split('=')[1] : null;
}

// Single-process signalling registry. A Redis adapter is needed before scaling
// the backend horizontally; media itself is peer-to-peer WebRTC, not server-recorded.
const meetingRooms = new Map<string, Map<string, string>>();

function getTargetSocketId(meetingId: string, userId: string) {
  return meetingRooms.get(meetingId)?.get(userId);
}

export function registerMeetingHandlers(io: Server) {
  io.use(async (socket: Socket, next) => {
    try {
      const token = extractSessionToken(socket.handshake.headers.cookie);
      if (!token) return next(new Error('unauthorized'));
      const session = await findSessionByToken(token);
      if (!session) return next(new Error('unauthorized'));
      const subject = await loadSubject(session.user_id);
      if (!subject) return next(new Error('unauthorized'));
      socket.data.subject = subject;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const subject = socket.data.subject!;

    const isActiveMember = (meetingId: string) => getTargetSocketId(meetingId, subject.id) === socket.id;
    const sendHostError = (err: unknown) => {
      const message = err instanceof Error ? err.message : 'That meeting action could not be completed.';
      socket.emit('meeting:error', { message });
    };

    socket.on('meeting:join', async ({ meetingId }: { meetingId: string }) => {
      try {
        const { rows } = await pool.query(
          `SELECT mp.mic_state, mp.left_at, m.status AS meeting_status, m.is_locked
           FROM meeting_participants mp JOIN meetings m ON m.id = mp.meeting_id
           WHERE mp.meeting_id = $1 AND mp.user_id = $2`,
          [meetingId, subject.id]
        );
        const participant = rows[0];
        if (!participant || participant.mic_state === 'removed') {
          return socket.emit('meeting:removed', { message: 'You have been removed from this meeting.' });
        }
        if (participant.meeting_status === 'ended') {
          return socket.emit('meeting:ended');
        }
        if (participant.is_locked && participant.left_at) {
          return socket.emit('meeting:error', { message: 'This meeting is locked to new participants.' });
        }
        // A socket reconnect may arrive after a temporary network interruption.
        // The HTTP join endpoint already enforced lock and capacity rules for this account.
        if (participant.left_at) {
          await pool.query(`UPDATE meeting_participants SET joined_at = now(), left_at = NULL WHERE meeting_id = $1 AND user_id = $2 AND mic_state <> 'removed'`, [meetingId, subject.id]);
        }

        // Keep one signalling socket per account per meeting. Without this, an old
        // tab could remain in the Socket.IO room and continue receiving private chat
        // broadcasts after a second tab replaces it in the participant registry.
        const previousSocketId = getTargetSocketId(meetingId, subject.id);
        if (previousSocketId && previousSocketId !== socket.id) {
          io.sockets.sockets.get(previousSocketId)?.leave(meetingId);
        }
        socket.join(meetingId);
        if (!meetingRooms.has(meetingId)) meetingRooms.set(meetingId, new Map());
        meetingRooms.get(meetingId)!.set(subject.id, socket.id);
        socket.to(meetingId).emit('meeting:participant-joined', { userId: subject.id });
      } catch (err) {
        sendHostError(err);
      }
    });

    // Signalling is accepted only after this socket has authenticated into the room.
    socket.on('meeting:offer', ({ meetingId, toUserId, sdp }) => {
      if (!isActiveMember(meetingId)) return;
      const targetSocketId = getTargetSocketId(meetingId, toUserId);
      if (targetSocketId) io.to(targetSocketId).emit('meeting:offer', { fromUserId: subject.id, sdp });
    });

    socket.on('meeting:answer', ({ meetingId, toUserId, sdp }) => {
      if (!isActiveMember(meetingId)) return;
      const targetSocketId = getTargetSocketId(meetingId, toUserId);
      if (targetSocketId) io.to(targetSocketId).emit('meeting:answer', { fromUserId: subject.id, sdp });
    });

    socket.on('meeting:ice-candidate', ({ meetingId, toUserId, candidate }) => {
      if (!isActiveMember(meetingId)) return;
      const targetSocketId = getTargetSocketId(meetingId, toUserId);
      if (targetSocketId) io.to(targetSocketId).emit('meeting:ice-candidate', { fromUserId: subject.id, candidate });
    });

    socket.on('meeting:chat', async ({ meetingId, content }: { meetingId: string; content: string }) => {
      if (!isActiveMember(meetingId) || typeof content !== 'string' || !content.trim()) return;
      try {
        const message = content.trim().slice(0, 2000);
        const { rows } = await pool.query(
          `SELECT can_chat FROM meeting_permissions WHERE meeting_id = $1 AND user_id = $2`,
          [meetingId, subject.id]
        );
        if (rows[0]?.can_chat === false) return socket.emit('meeting:error', { message: 'Chat is disabled for you in this room.' });
        await pool.query(`INSERT INTO chat_messages (meeting_id, user_id, content) VALUES ($1, $2, $3)`, [meetingId, subject.id, message]);
        io.to(meetingId).emit('meeting:chat', { fromUserId: subject.id, content: message, sentAt: new Date().toISOString() });
      } catch (err) {
        sendHostError(err);
      }
    });

    socket.on('meeting:raise-hand', ({ meetingId, raised }: { meetingId: string; raised?: boolean }) => {
      if (!isActiveMember(meetingId)) return;
      io.to(meetingId).emit('meeting:hand-raised', { userId: subject.id, raised: raised !== false });
    });

    socket.on('meeting:media-state', async ({ meetingId, micState, cameraState }) => {
      if (!isActiveMember(meetingId)) return;
      try {
        const { rows } = await pool.query(
          `UPDATE meeting_participants
           SET mic_state = CASE WHEN is_muted_by_host THEN 'off' ELSE COALESCE($3, mic_state) END,
               camera_state = COALESCE($4, camera_state)
           WHERE meeting_id = $1 AND user_id = $2 AND mic_state <> 'removed'
           RETURNING mic_state, camera_state, is_muted_by_host`,
          [meetingId, subject.id, micState ?? null, cameraState ?? null]
        );
        if (rows[0]) socket.to(meetingId).emit('meeting:media-state', { userId: subject.id, micState: rows[0].mic_state, cameraState: rows[0].camera_state, isMutedByHost: rows[0].is_muted_by_host });
      } catch (err) {
        sendHostError(err);
      }
    });

    socket.on('host-mute', async ({ meetingId, targetUserId }: { meetingId: string; targetUserId: string }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        const state = await meetingsService.muteParticipant(meetingId, subject.id, targetUserId);
        const targetSocketId = getTargetSocketId(meetingId, targetUserId);
        if (targetSocketId && state.is_muted_by_host) io.to(targetSocketId).emit('meeting:force-mute', { byUserId: subject.id });
        if (targetSocketId && !state.is_muted_by_host) io.to(targetSocketId).emit('meeting:host-unmuted', { byUserId: subject.id });
        io.to(meetingId).emit('meeting:media-state', { userId: targetUserId, micState: state.mic_state, cameraState: state.camera_state, isMutedByHost: state.is_muted_by_host });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-remove', async ({ meetingId, targetUserId }: { meetingId: string; targetUserId: string }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        await meetingsService.removeParticipant(meetingId, subject.id, targetUserId);
        const targetSocketId = getTargetSocketId(meetingId, targetUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('meeting:removed', { message: 'The host removed you from this meeting.' });
          io.sockets.sockets.get(targetSocketId)?.leave(meetingId);
        }
        meetingRooms.get(meetingId)?.delete(targetUserId);
        io.to(meetingId).emit('meeting:participant-left', { userId: targetUserId });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-lock', async ({ meetingId, locked }: { meetingId: string; locked: boolean }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        await meetingsService.lockMeeting(meetingId, subject.id, !!locked);
        io.to(meetingId).emit('meeting:lock-state', { locked: !!locked });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-cohost', async ({ meetingId, targetUserId, grant }: { meetingId: string; targetUserId: string; grant: boolean }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        await meetingsService.setCoHost(meetingId, subject.id, targetUserId, !!grant);
        io.to(meetingId).emit('meeting:roles-changed', { userId: targetUserId, role: grant ? 'co_host' : 'participant' });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-permissions', async ({ meetingId, targetUserId, canShareScreen, canChat }: { meetingId: string; targetUserId: string; canShareScreen?: boolean; canChat?: boolean }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        const permissions = await meetingsService.setParticipantPermissions(meetingId, subject.id, targetUserId, { canShareScreen, canChat });
        io.to(meetingId).emit('meeting:permissions-changed', { userId: targetUserId, ...permissions });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-record', async ({ meetingId, consentConfirmed }: { meetingId: string; consentConfirmed: boolean }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        await meetingsService.startRecording(meetingId, subject.id, !!consentConfirmed);
        io.to(meetingId).emit('meeting:recording', { active: true });
      } catch (err) { sendHostError(err); }
    });

    socket.on('host-end', async ({ meetingId }: { meetingId: string }) => {
      try {
        if (!isActiveMember(meetingId)) throw new Error('You are not an active participant in this room.');
        await meetingsService.endMeeting(meetingId, subject.id);
        io.to(meetingId).emit('meeting:ended');
        for (const [userId, socketId] of meetingRooms.get(meetingId) ?? []) {
          io.sockets.sockets.get(socketId)?.leave(meetingId);
          meetingRooms.get(meetingId)?.delete(userId);
        }
      } catch (err) { sendHostError(err); }
    });

    socket.on('disconnect', async () => {
      for (const [meetingId, participants] of meetingRooms.entries()) {
        if (participants.get(subject.id) === socket.id) {
          participants.delete(subject.id);
          socket.to(meetingId).emit('meeting:participant-left', { userId: subject.id });
          // Give the socket time to reconnect before marking this participant as having left.
          // A reconnected socket writes itself back into meetingRooms and cancels the effective cleanup.
          setTimeout(async () => {
            if (meetingRooms.get(meetingId)?.has(subject.id)) return;
            try {
              await pool.query(
                `UPDATE meeting_participants SET left_at = COALESCE(left_at, now())
                 WHERE meeting_id = $1 AND user_id = $2 AND mic_state <> 'removed'`,
                [meetingId, subject.id]
              );
            } catch { /* disconnect cleanup should not crash socket server */ }
          }, 15000);
          if (participants.size === 0) meetingRooms.delete(meetingId);
        }
      }
    });
  });
}
