'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function LiveLandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const canHost = user?.plan_code === 'GOLD' || user?.role === 'instructor' || user?.role === 'admin';

  useEffect(() => {
    api.meetingHistory().then(setHistory).catch(() => {});
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/live/${code}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const meeting = await api.createMeeting({ title, type: 'group' });
      router.push(`/live/${meeting.room_code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create meeting.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Live Rooms</h1>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="bg-elevated border border-border rounded p-5">
          <h3 className="font-semibold mb-3 text-sm">Join a room</h3>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="BASTION-XXXXXX"
              className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary"
            />
            <button className="bg-primary text-bg text-sm px-4 py-2 rounded font-medium">Join</button>
          </form>
        </div>

        <div className="bg-elevated border border-border rounded p-5">
          <h3 className="font-semibold mb-3 text-sm">Host a room</h3>
          {canHost ? (
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session title"
                required
                className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button disabled={creating} className="bg-primary text-bg text-sm px-4 py-2 rounded font-medium disabled:opacity-50">
                {creating ? 'Creating…' : 'Start'}
              </button>
            </form>
          ) : (
            <p className="text-text-dim text-sm">
              Hosting requires the Gold plan or an instructor role. <a href="/pricing" className="text-primary">Upgrade →</a>
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-error text-sm mb-4">{error}</p>}

      <h3 className="font-semibold mb-3 text-sm">Your meeting history</h3>
      <div className="flex flex-col gap-2">
        {history.map((m) => (
          <div key={m.id} className="flex justify-between items-center bg-elevated border border-border rounded p-3 text-sm">
            <span>{m.title}</span>
            <span className="text-text-dim text-xs font-mono">{m.status} · {m.participant_role}</span>
          </div>
        ))}
        {history.length === 0 && <p className="text-text-dim text-sm">No meetings yet.</p>}
      </div>
    </div>
  );
}
