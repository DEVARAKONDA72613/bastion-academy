import crypto from 'crypto';
import { pool, withTransaction } from '../../core/db.js';
import { razorpay } from '../../core/razorpay.js';
import { AppError } from '../../core/errors.js';
import { sendEmail } from '../../core/notify/email.js';
import type { Subject } from '../../core/permissions.js';

export async function listPlans() {
  const { rows } = await pool.query(
    `SELECT code, name, price_inr, billing_period_days, streaming_quality,
            download_daily_limit, live_room_access, premium_track_access
     FROM subscription_plans WHERE is_active = true ORDER BY price_inr`
  );
  return rows;
}

export async function getMySubscription(userId: string) {
  // Expired paid rows must not continue to display as active or auto-renewable.
  await pool.query(`UPDATE user_subscriptions SET status = 'expired', auto_renew = false WHERE user_id = $1 AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()`, [userId]);
  const { rows } = await pool.query(
    `SELECT sp.code, sp.name, us.status, us.started_at, us.expires_at, us.auto_renew
     FROM user_subscriptions us JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1 AND us.status = 'active'
     ORDER BY us.created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Creates a Razorpay order and a 'created' payment row. This does NOT grant
 * any access — activation only ever happens in handleWebhookEvent() below,
 * after signature verification. Never trust a frontend "payment succeeded" call.
 */
export async function createCheckoutOrder(subject: Subject, planCode: string) {
  const { rows: planRows } = await pool.query(
    `SELECT id, price_inr FROM subscription_plans WHERE code = $1 AND is_active = true`,
    [planCode]
  );
  const plan = planRows[0];
  if (!plan) throw new AppError(400, 'invalid_plan', 'Unknown plan.');
  if (Number(plan.price_inr) <= 0) throw new AppError(400, 'invalid_plan', 'This plan does not require payment.');

  const amountPaise = Math.round(Number(plan.price_inr) * 100);
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    notes: { userId: subject.id, planCode },
  });

  await pool.query(
    `INSERT INTO payments (user_id, razorpay_order_id, amount_inr, currency, status)
     VALUES ($1, $2, $3, 'INR', 'created')`,
    [subject.id, order.id, plan.price_inr]
  );

  return { orderId: order.id, amount: amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID };
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  // Constant-time comparison — avoids timing-attack leakage of the expected signature.
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleWebhookEvent(payload: any) {
  const event = payload?.event;
  if (event !== 'payment.captured' && event !== 'payment.failed') return;
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  const razorpayPaymentId = paymentEntity?.id;
  if (!orderId || !razorpayPaymentId) return;

  if (event === 'payment.failed') {
    // A delayed failure webhook must never roll a previously captured payment back.
    await pool.query(
      `UPDATE payments SET status = 'failed', razorpay_payment_id = $2, raw_webhook_payload = $3
       WHERE razorpay_order_id = $1 AND status <> 'captured'`,
      [orderId, razorpayPaymentId, payload]
    );
    return;
  }

  // Order notes are the source of the selected plan. Some Razorpay webhook payloads
  // omit them from the payment entity, so retrieve the signed order record as fallback.
  let planCode = paymentEntity.notes?.planCode as string | undefined;
  if (!planCode) {
    const order = await razorpay.orders.fetch(orderId);
    planCode = order.notes?.planCode as string | undefined;
  }
  if (!planCode) throw new AppError(400, 'missing_plan_note', 'The Razorpay order does not contain a plan code.');

  const paidAmountPaise = Number(paymentEntity.amount);
  const paidCurrency = String(paymentEntity.currency ?? '').toUpperCase();
  if (!Number.isSafeInteger(paidAmountPaise) || paidAmountPaise <= 0 || !paidCurrency) {
    throw new AppError(400, 'invalid_payment_amount', 'The captured payment is missing valid amount or currency details.');
  }

  const activation = await withTransaction(async (client) => {
    const { rows: paymentRows } = await client.query(
      `SELECT id, user_id, amount_inr, currency, status, razorpay_payment_id
       FROM payments WHERE razorpay_order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const paymentRow = paymentRows[0];
    if (!paymentRow) throw new AppError(404, 'payment_order_not_found', 'No matching checkout order was found.');

    // Verify the captured amount and currency against the server-created order row.
    // A valid webhook signature alone must not activate a differently-priced plan.
    const expectedOrderPaise = Math.round(Number(paymentRow.amount_inr) * 100);
    if (paidAmountPaise !== expectedOrderPaise || paidCurrency !== String(paymentRow.currency).toUpperCase()) {
      throw new AppError(400, 'payment_amount_mismatch', 'Captured amount or currency does not match the checkout order.');
    }
    if (paymentRow.status === 'captured') {
      if (paymentRow.razorpay_payment_id === razorpayPaymentId) return null; // idempotent webhook retry
      throw new AppError(409, 'conflicting_captured_payment', 'This checkout order is already associated with a different captured payment.');
    }

    const { rows: planRows } = await client.query(
      `SELECT id, billing_period_days, price_inr FROM subscription_plans WHERE code = $1 AND is_active = true`,
      [planCode]
    );
    const plan = planRows[0];
    if (!plan) throw new AppError(400, 'unknown_plan', `Webhook referenced unknown plan code: ${planCode}`);
    if (paidAmountPaise !== Math.round(Number(plan.price_inr) * 100)) {
      throw new AppError(400, 'plan_amount_mismatch', 'Captured payment does not match the selected subscription plan price.');
    }

    // Serialize activations per account to avoid two simultaneous captured orders
    // leaving two paid subscriptions active for the same user.
    await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [paymentRow.user_id]);

    await client.query(
      `UPDATE payments SET status = 'captured', razorpay_payment_id = $2, raw_webhook_payload = $3 WHERE id = $1`,
      [paymentRow.id, razorpayPaymentId, payload]
    );

    // Keep one active membership per user. The previous membership history is preserved.
    await client.query(
      `UPDATE user_subscriptions SET status = 'expired', auto_renew = false
       WHERE user_id = $1 AND status = 'active'`,
      [paymentRow.user_id]
    );
    const { rows: subRows } = await client.query(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, started_at, expires_at, auto_renew)
       VALUES ($1, $2, 'active', now(), now() + ($3 || ' days')::interval, true)
       RETURNING id`,
      [paymentRow.user_id, plan.id, plan.billing_period_days]
    );

    await client.query(`UPDATE payments SET user_subscription_id = $2 WHERE id = $1`, [paymentRow.id, subRows[0].id]);
    const invoiceNumber = `INV-${Date.now()}-${String(paymentRow.id).slice(0, 8)}`;
    await client.query(
      `INSERT INTO invoices (payment_id, user_id, invoice_number, amount_inr, tax_inr, total_inr)
       VALUES ($1, $2, $3, $4, 0, $4)
       ON CONFLICT (payment_id) DO NOTHING`,
      [paymentRow.id, paymentRow.user_id, invoiceNumber, paymentRow.amount_inr]
    );
    return { userId: paymentRow.user_id };
  });

  if (activation) {
    const { rows: userRows } = await pool.query(`SELECT email FROM users WHERE id = $1`, [activation.userId]);
    if (userRows[0]) {
      await sendEmail(
        userRows[0].email,
        'Subscription confirmed — Bastion Academy',
        `Your subscription is now active. Thanks for upgrading!`
      );
    }
  }
}

export async function cancelAutoRenew(userId: string) {
  // Stays active until expiry, per spec — cancellation just stops renewal, doesn't revoke access immediately.
  await pool.query(`UPDATE user_subscriptions SET auto_renew = false WHERE user_id = $1 AND status = 'active'`, [userId]);
}

export async function listInvoices(userId: string) {
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.amount_inr, i.tax_inr, i.total_inr, i.issued_at, p.status AS payment_status
     FROM invoices i JOIN payments p ON p.id = i.payment_id
     WHERE i.user_id = $1 ORDER BY i.issued_at DESC`,
    [userId]
  );
  return rows;
}

export async function getInvoice(userId: string, invoiceId: string) {
  const { rows } = await pool.query(
    `SELECT i.*, p.razorpay_payment_id, p.razorpay_order_id, p.currency, p.status AS payment_status
     FROM invoices i JOIN payments p ON p.id = i.payment_id
     WHERE i.id = $1 AND i.user_id = $2`,
    [invoiceId, userId]
  );
  if (!rows[0]) throw new AppError(404, 'not_found', 'Invoice not found.');
  return rows[0];
}
