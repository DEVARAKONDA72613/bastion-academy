'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Invoice = { id: string; invoice_number: string; amount_inr: string | number; tax_inr: string | number; total_inr: string | number; issued_at: string; payment_status?: string; razorpay_payment_id?: string | null; razorpay_order_id?: string | null; currency?: string };
type Subscription = { code: string; name: string; status: string; started_at: string; expires_at: string | null; auto_renew: boolean } | null;
function fmtDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}
function money(value: string | number | undefined) { return `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    const [sub, rows] = await Promise.all([api.getMySubscription(), api.listInvoices()]);
    setSubscription(sub as Subscription);
    setInvoices(rows as Invoice[]);
  }, []);
  useEffect(() => { refresh().catch((err) => setMessage(err instanceof Error ? err.message : 'Could not load billing information.')).finally(() => setLoading(false)); }, [refresh]);

  async function cancelRenewal() {
    if (!window.confirm('Turn off automatic renewal? Your current access remains until its expiry date.')) return;
    setCancelling(true); setMessage('');
    try { await api.cancelSubscription(); setMessage('Automatic renewal has been turned off. Your current access remains until expiry.'); await refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not update renewal settings.'); }
    finally { setCancelling(false); }
  }

  async function viewInvoice(invoice: Invoice) {
    setMessage('');
    try { setSelected(await api.getInvoice(invoice.id)); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not open this receipt.'); }
  }

  if (loading) return <p className="text-sm text-text-dim">Loading billing…</p>;

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Account finance</p><h1 className="mt-1 text-2xl font-semibold">Billing & receipts</h1><p className="mt-1 text-sm text-text-dim">Manage your membership and review recorded transactions.</p></div><Link href="/pricing" className="w-fit rounded bg-primary px-4 py-2 text-xs font-semibold text-bg">Compare plans ↗</Link></header>

    <section className="rounded-lg border border-border bg-elevated p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs text-text-dim">Current membership</p><h2 className="mt-1 text-2xl font-semibold">{subscription?.name ?? 'Free Recruit'}</h2><p className="mt-1 font-mono text-xs text-primary">{subscription?.code ?? 'FREE'} · {subscription?.status ?? 'default'}</p></div>
        <span className={`w-fit rounded px-2 py-1 text-[10px] font-medium uppercase ${subscription?.status === 'active' ? 'bg-success/10 text-success' : 'bg-surface text-text-dim'}`}>{subscription?.status ?? 'Free plan'}</span>
      </div>
      <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <div><p className="text-xs text-text-dim">Started</p><p className="mt-1 text-sm">{fmtDate(subscription?.started_at)}</p></div>
        <div><p className="text-xs text-text-dim">Expires</p><p className="mt-1 text-sm">{fmtDate(subscription?.expires_at)}</p></div>
        <div><p className="text-xs text-text-dim">Auto-renew</p><p className="mt-1 text-sm">{subscription?.auto_renew ? 'On' : 'Off'}</p></div>
      </div>
      {subscription?.auto_renew && <button disabled={cancelling} onClick={() => void cancelRenewal()} className="mt-5 rounded border border-error/50 px-3 py-2 text-xs text-error hover:bg-error/10 disabled:opacity-50">{cancelling ? 'Updating…' : 'Turn off auto-renew preference'}</button>}
      <p className="mt-4 text-[11px] leading-5 text-text-dim">Renewal status is stored as a preference in this project. Automatic recurring Razorpay charges are not configured; each test checkout is a one-time payment.</p>
      {message && <p role="status" className="mt-4 break-words rounded border border-border bg-surface px-3 py-2 text-xs text-text-dim">{message}</p>}
    </section>

    <section className="overflow-hidden rounded-lg border border-border bg-elevated">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Invoices & payment receipts</h2></div>
      {invoices.length === 0 ? <div className="p-8 text-center"><p className="text-sm text-text-dim">No invoices recorded yet.</p><p className="mt-1 text-xs text-text-dim">Successful payment webhook events create invoices.</p></div> : <div className="divide-y divide-border">
        {invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{invoice.invoice_number}</p><p className="mt-1 text-xs text-text-dim">Issued {fmtDate(invoice.issued_at)}</p></div>
          <p className="font-mono text-sm">{money(invoice.total_inr)}</p><button onClick={() => void viewInvoice(invoice)} className="rounded border border-border px-3 py-2 text-xs hover:border-primary">View receipt</button>
        </div>)}
      </div>}
    </section>

    {selected && <section id="receipt" className="rounded-lg border border-border bg-surface p-5 sm:p-8 print:border-0 print:bg-white print:p-0 print:text-black">
      <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between print:border-black">
        <div><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary print:text-black">Bastion Academy</p><h2 className="mt-2 text-xl font-semibold">Payment receipt</h2><p className="mt-1 text-xs text-text-dim print:text-black">Tax invoice / transaction summary</p></div>
        <div className="sm:text-right"><p className="text-xs text-text-dim print:text-black">Invoice number</p><p className="mt-1 break-all font-mono text-sm">{selected.invoice_number}</p><p className="mt-1 text-xs text-text-dim print:text-black">{fmtDate(selected.issued_at)}</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-text-dim print:text-black">Payment status</p><p className="mt-1 text-sm font-medium">{selected.payment_status ?? 'Recorded'}</p></div><div><p className="text-xs text-text-dim print:text-black">Currency</p><p className="mt-1 text-sm">{selected.currency ?? 'INR'}</p></div>
        <div><p className="text-xs text-text-dim print:text-black">Razorpay payment ID</p><p className="mt-1 break-all font-mono text-xs">{selected.razorpay_payment_id || 'Not available'}</p></div><div><p className="text-xs text-text-dim print:text-black">Order ID</p><p className="mt-1 break-all font-mono text-xs">{selected.razorpay_order_id || 'Not available'}</p></div></div>
      <div className="mt-6 space-y-3 border-t border-border pt-4 text-sm print:border-black"><div className="flex justify-between gap-4"><span className="text-text-dim print:text-black">Subtotal</span><span>{money(selected.amount_inr)}</span></div><div className="flex justify-between gap-4"><span className="text-text-dim print:text-black">Tax</span><span>{money(selected.tax_inr)}</span></div><div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold print:border-black"><span>Total paid</span><span>{money(selected.total_inr)}</span></div></div>
      <p className="mt-6 text-xs text-text-dim print:text-black">Keep this receipt for your records. This view reflects the payment data stored in Bastion Academy.</p>
      <div className="mt-5 flex gap-2 print:hidden"><button onClick={() => window.print()} className="rounded bg-primary px-4 py-2 text-xs font-semibold text-bg">Print / Save PDF</button><button onClick={() => setSelected(null)} className="rounded border border-border px-4 py-2 text-xs">Close</button></div>
    </section>}
  </div>;
}
