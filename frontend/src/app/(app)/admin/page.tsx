'use client';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

async function adminFetch(path: string) {
  const res = await fetch(`${API_BASE}/admin${path}`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

const TABS = ['users', 'payments', 'subscriptions', 'downloads', 'comments/reports', 'meetings', 'security/login-attempts', 'audit-logs'] as const;

export default function AdminPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('users');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminFetch(`/${tab}`)
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [tab]);

  const columns = rows[0] ? Object.keys(rows[0]).filter((k) => k !== 'metadata') : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded ${tab === t ? 'bg-primary text-bg' : 'bg-elevated text-text-dim'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-text-dim">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} className="text-left text-text-dim font-normal px-2 py-2 border-b border-border whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-2 text-text whitespace-nowrap">{String(r[c] ?? '').slice(0, 60)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-text-dim mt-4">No data.</p>}
        </div>
      )}
    </div>
  );
}
