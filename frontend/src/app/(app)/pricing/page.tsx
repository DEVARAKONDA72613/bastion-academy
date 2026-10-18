'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';

declare global {
  interface Window { Razorpay: any; }
}

export default function PricingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.listPlans().then(setPlans);
    api.getMySubscription().then(setSub).catch(() => {});
  }, []);

  async function handleUpgrade(planCode: string) {
    setMessage('');
    try {
      const order = await api.checkout(planCode);
      if (!window.Razorpay) {
        setMessage('Payment widget still loading â€” try again in a second.');
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Bastion Academy',
        description: `Upgrade to ${planCode}`,
        handler: async function () {
          // Checkout success is not treated as authority to activate a plan. Poll the
          // server, which updates membership only after the signed Razorpay webhook.
          setMessage('Payment submitted. Waiting for secure confirmation from the serverâ€¦');
          const maxAttempts = 10;
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
              const current = await api.getMySubscription();
              if (current?.code === planCode && current?.status === 'active') {
                setSub(current);
                setMessage(`Payment verified. Your ${planCode} plan is now active.`);
                return;
              }
            } catch {
              // Keep polling briefly if the API is transiently unavailable.
            }
            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 2000));
            }
          }
          try {
            const current = await api.getMySubscription();
            if (current) setSub(current);
          } catch {
            // The server remains the source of truth; show a pending state below.
          }
          setMessage('Payment was submitted, but plan activation is still pending verification. Do not pay again. Check Billing & receipts shortly.');
        },
        theme: { color: '#3fbf8f' },
      });
      rzp.open();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not start checkout.');
    }
  }

  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <h1 className="text-2xl font-semibold mb-1">Plans</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-dim">Your current plan: <span className="font-mono text-primary">{sub?.code ?? 'FREE'}</span></p>
        <Link href="/billing" className="rounded border border-border px-3 py-2 text-xs hover:border-primary">Billing & receipts â†—</Link>
      </div>
      {message && <p className="text-sm text-accent mb-4 max-w-md">{message}</p>}
      <div className="grid md:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div key={p.code} className="bg-elevated border border-border rounded p-5 flex flex-col">
            <h3 className="font-semibold mb-1">{p.name}</h3>
            <p className="font-mono text-2xl mb-3">
              â‚¹{p.price_inr}
              <span className="text-text-dim text-xs">/mo</span>
            </p>
            <ul className="text-text-dim text-xs flex flex-col gap-1 mb-4 flex-1">
              <li>{p.streaming_quality} streaming</li>
              <li>{p.download_daily_limit === -1 ? 'Unlimited' : p.download_daily_limit} downloads/day</li>
              <li>Live: {p.live_room_access}</li>
              <li>{p.premium_track_access} content</li>
            </ul>
            {Number(p.price_inr) > 0 ? (
              <button onClick={() => handleUpgrade(p.code)} className="bg-primary text-bg text-sm py-2 rounded font-medium">Upgrade</button>
            ) : (
              <button disabled className="bg-surface text-text-dim text-sm py-2 rounded">Default plan</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
