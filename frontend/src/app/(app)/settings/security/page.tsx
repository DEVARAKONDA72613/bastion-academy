'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SecurityPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);

  function load() {
    api.listSessions().then(setSessions).catch(() => {});
    api.listLoginHistory().then(setHistory).catch(() => {});
    api.listTrustedDevices().then(setDevices).catch(() => {});
  }
  useEffect(load, []);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Security</h1>

      <div>
        <h3 className="font-semibold mb-2 text-sm">Active sessions</h3>
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex justify-between items-center bg-elevated border border-border rounded p-3 text-sm">
              <span className="text-text-dim">
                {s.device_info ?? 'Unknown device'} · {s.ip_address} {s.isCurrent && <span className="text-primary">(this device)</span>}
              </span>
              {!s.isCurrent && (
                <button onClick={() => api.revokeSession(s.id).then(load)} className="text-error text-xs">Revoke</button>
              )}
            </div>
          ))}
          {sessions.length === 0 && <p className="text-text-dim text-sm">No active sessions.</p>}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm">Trusted devices</h3>
        <div className="flex flex-col gap-2">
          {devices.map((d) => (
            <div key={d.id} className="flex justify-between items-center bg-elevated border border-border rounded p-3 text-sm">
              <span className="text-text-dim">{d.browser} on {d.os} · trusted until {new Date(d.trusted_until).toLocaleDateString()}</span>
              <button onClick={() => api.removeTrustedDevice(d.id).then(load)} className="text-error text-xs">Remove</button>
            </div>
          ))}
          {devices.length === 0 && <p className="text-text-dim text-sm">No trusted devices.</p>}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm">Recent login activity</h3>
        <div className="flex flex-col gap-1">
          {history.map((h, i) => (
            <div key={i} className="flex justify-between text-xs text-text-dim border-b border-border py-2">
              <span>{h.browser} · {h.os} · {h.ip_address}</span>
              <span className={h.success ? 'text-success' : 'text-error'}>
                {h.success ? 'Success' : 'Failed'} · {new Date(h.created_at).toLocaleString()}
              </span>
            </div>
          ))}
          {history.length === 0 && <p className="text-text-dim text-sm">No login history yet.</p>}
        </div>
      </div>
    </div>
  );
}
