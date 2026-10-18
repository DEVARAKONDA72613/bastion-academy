'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

type MeetingType = 'one_to_one' | 'group';

type MeetingHistoryItem = {
  id: string;
  title: string;
  room_code: string;
  status: string;
  participant_role: string;
};

export default function LiveLandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MeetingHistoryItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('group');

  useEffect(() => {
    if (!user) return;
    api.meetingHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [user]);

  function handleJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError('Enter a meeting room code.');
      return;
    }

    router.push(`/live/${encodeURIComponent(code)}`);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const meeting = await api.createMeeting({
        title: title.trim(),
        type: meetingType,
        maxParticipants: meetingType === 'one_to_one' ? 2 : undefined,
      });

      if (!meeting?.room_code) {
        throw new Error('The meeting was created without a room code.');
      }

      router.push(`/live/${encodeURIComponent(meeting.room_code)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create the meeting. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="text-text-dim" role="status">Loading live rooms...</p>;
  }
  if (!user) return null;

  return (
    <div className="max-w-3xl">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
        Real-time collaboration
      </p>
      <h1 className="mb-2 text-3xl font-semibold">Live Rooms</h1>
      <p className="mb-8 text-sm text-text-dim">
        Create a private meeting or join one with a room code. Video calling is available to every authenticated plan.
      </p>

      {error && (
        <div role="alert" className="mb-5 rounded border border-error/40 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-elevated p-5">
          <h2 className="mb-2 text-base font-semibold">Join a room</h2>
          <p className="mb-4 text-sm text-text-dim">Enter the meeting code shared by the host.</p>
          <form onSubmit={handleJoin} className="space-y-3">
            <label htmlFor="room-code" className="block text-xs text-text-dim">Room code</label>
            <input
              id="room-code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="BASTION-XXXXXX"
              autoComplete="off"
              required
              maxLength={64}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-primary"
            />
            <button type="submit" className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-bg">
              Join meeting
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-border bg-elevated p-5">
          <h2 className="mb-2 text-base font-semibold">Create a room</h2>
          <p className="mb-4 text-sm text-text-dim">Choose a call type and create a shareable room.</p>
          <form onSubmit={handleCreate} className="space-y-3">
            <label htmlFor="meeting-title" className="block text-xs text-text-dim">Meeting title</label>
            <input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Study session"
              required
              maxLength={200}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <label htmlFor="meeting-type" className="block text-xs text-text-dim">Call type</label>
            <select
              id="meeting-type"
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value as MeetingType)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="one_to_one">One-to-one call</option>
              <option value="group">Group video call</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded bg-primary px-4 py-2.5 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create meeting'}
            </button>
          </form>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">Your meeting history</h2>
        <div className="flex flex-col gap-2">
          {history.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-elevated p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{meeting.title}</p>
                <p className="mt-1 text-xs text-text-dim">{meeting.status} | {meeting.participant_role}</p>
              </div>
              {meeting.room_code && (
                <button
                  type="button"
                  onClick={() => router.push(`/live/${encodeURIComponent(meeting.room_code)}`)}
                  className="rounded border border-border px-3 py-2 text-xs hover:border-primary"
                >
                  Open room
                </button>
              )}
            </div>
          ))}
          {history.length === 0 && (
            <p className="rounded border border-dashed border-border p-5 text-sm text-text-dim">
              No meetings yet. Create your first room above.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}