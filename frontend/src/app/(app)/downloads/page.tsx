'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type DownloadRecord = {
  id: string; video_id: string; status: string; file_size_bytes: number | string | null;
  plan_code_used: string; requested_at: string; completed_at: string | null;
  video_title: string; thumbnail_url?: string | null;
};
type Quota = { planCode: string; limit: number | 'unlimited'; used: number; remaining: number | 'unlimited' };

function formatBytes(value: number | string | null) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Not reported';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}
function fmtDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}
function statusClass(status: string) {
  if (status === 'completed') return 'bg-success/10 text-success';
  if (status === 'failed') return 'bg-error/10 text-error';
  if (status === 'in_progress') return 'bg-primary/10 text-primary';
  return 'bg-warning/10 text-warning';
}

export default function DownloadsPage() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [q, history] = await Promise.all([api.getQuota(), api.listDownloads()]);
    setQuota(q);
    setDownloads(history as DownloadRecord[]);
  }, []);
  useEffect(() => { refresh().catch((err) => setMessage(err instanceof Error ? err.message : 'Could not load download history.')); }, [refresh]);

  async function downloadAgain(item: DownloadRecord) {
    setBusyId(item.id); setMessage('');
    try {
      const result = await api.requestDownload(item.video_id);
      if (!result.mock && typeof result.streamUrl === 'string' && /^https?:\/\//i.test(result.streamUrl)) {
        const anchor = document.createElement('a'); anchor.href = result.streamUrl; anchor.download = `${item.video_title}.mp4`; anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        setMessage(result.alreadyRequested ? 'The existing daily request was reused.' : 'Your authorized download has started.');
      } else {
        setMessage('Your plan and quota were checked, but real file storage/CDN is not connected. No file was downloaded.');
      }
      await refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Download request failed.'); }
    finally { setBusyId(null); }
  }

  const remaining = quota?.remaining === 'unlimited' ? 'Unlimited' : quota?.remaining ?? '—';
  const limit = quota?.limit === 'unlimited' ? 'Unlimited' : quota?.limit ?? '—';

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Your library</p><h1 className="mt-1 text-2xl font-semibold">Downloads</h1><p className="mt-1 text-sm text-text-dim">Your authorized download requests and daily plan allowance.</p></div>
      <Link href="/courses" className="w-fit rounded border border-border px-3 py-2 text-xs hover:border-primary">Browse courses ↗</Link>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-elevated p-4"><p className="text-xs text-text-dim">Current plan</p><p className="mt-2 font-mono text-2xl text-primary">{quota?.planCode ?? '—'}</p></div>
      <div className="rounded-lg border border-border bg-elevated p-4"><p className="text-xs text-text-dim">Used today</p><p className="mt-2 font-mono text-2xl">{quota?.used ?? '—'} <span className="text-sm text-text-dim">/ {limit}</span></p></div>
      <div className="rounded-lg border border-border bg-elevated p-4"><p className="text-xs text-text-dim">Remaining today</p><p className="mt-2 font-mono text-2xl">{remaining}</p><p className="mt-1 text-[10px] text-text-dim">Quota resets according to the server date.</p></div>
    </section>

    {message && <p role="status" className="break-words rounded border border-border bg-surface px-3 py-2 text-sm text-text-dim">{message}</p>}
    <section className="overflow-hidden rounded-lg border border-border bg-elevated">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Download history</h2><span className="text-xs text-text-dim">Latest {downloads.length}</span></div>
      {downloads.length === 0 ? <div className="p-8 text-center"><p className="text-sm text-text-dim">No download requests yet.</p><Link href="/courses" className="mt-3 inline-block text-sm text-primary hover:underline">Find a lesson to download</Link></div> : <div className="divide-y divide-border">
        {downloads.map((item) => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface">
            {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" /> : <span className="font-mono text-lg text-primary">BA.</span>}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/watch/${item.video_id}`} className="line-clamp-2 text-sm font-medium hover:text-primary">{item.video_title}</Link>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-dim"><span>{fmtDate(item.requested_at)}</span><span>{formatBytes(item.file_size_bytes)}</span><span>Plan: {item.plan_code_used}</span></div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 sm:flex-col sm:items-end">
            <span className={`rounded px-2 py-1 text-[10px] font-medium uppercase ${statusClass(item.status)}`}>{item.status.replace('_', ' ')}</span>
            <button disabled={busyId === item.id} onClick={() => void downloadAgain(item)} className="rounded border border-border px-3 py-1.5 text-xs hover:border-primary disabled:opacity-50">{busyId === item.id ? 'Checking…' : 'Download again'}</button>
          </div>
        </article>)}
      </div>}
    </section>
    <p className="text-[11px] leading-5 text-text-dim">Download authorizations and quota usage are recorded server-side. Actual offline video delivery is not active until a real storage/CDN provider is configured.</p>
  </div>;
}
