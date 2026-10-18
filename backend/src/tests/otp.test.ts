import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { verifyOtpWithClient } from '../core/otp.js';

type OtpRow = {
  id: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
};

const testSecret = 'otp-unit-test-secret';
process.env.SESSION_SECRET = testSecret;
function hashOtpForTest(code: string) {
  return crypto.createHash('sha256').update(code + testSecret).digest('hex');
}
function makeRow(overrides: Partial<OtpRow> = {}): OtpRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    otp_hash: hashOtpForTest('123456'),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0,
    verified_at: null,
    ...overrides,
  };
}
function makeClient(row: OtpRow | null) {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('SELECT id, otp_hash, expires_at, attempts, verified_at')) {
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('SET attempts = attempts + 1')) {
        if (row) row.attempts += 1;
        return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('SET verified_at = now()')) {
        if (row) row.verified_at = new Date().toISOString();
        return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`Unexpected query in fake client: ${sql}`);
    },
  };
  return { client: client as unknown as PoolClient, statements };
}

test('OTP verification locks the row, increments attempts, and consumes a correct code', async () => {
  const row = makeRow();
  const { client, statements } = makeClient(row);
  const result = await verifyOtpWithClient(client, 'user-id', 'login', '123456');
  assert.deepEqual(result, { ok: true });
  assert.match(statements[0], /FOR UPDATE/i);
  assert.equal(row.attempts, 1);
  assert.ok(row.verified_at);
});

test('incorrect OTP increments attempts but does not consume the code', async () => {
  const row = makeRow();
  const { client } = makeClient(row);
  const result = await verifyOtpWithClient(client, 'user-id', 'login', '654321');
  assert.deepEqual(result, { ok: false, reason: 'incorrect' });
  assert.equal(row.attempts, 1);
  assert.equal(row.verified_at, null);
});

test('expired OTP is rejected without incrementing attempts', async () => {
  const row = makeRow({ expires_at: new Date(Date.now() - 1000).toISOString() });
  const { client } = makeClient(row);
  const result = await verifyOtpWithClient(client, 'user-id', 'login', '123456');
  assert.deepEqual(result, { ok: false, reason: 'expired' });
  assert.equal(row.attempts, 0);
});

test('OTP at the attempt limit is rejected without another increment', async () => {
  const row = makeRow({ attempts: 5 });
  const { client } = makeClient(row);
  const result = await verifyOtpWithClient(client, 'user-id', 'login', '123456');
  assert.deepEqual(result, { ok: false, reason: 'too_many_attempts' });
  assert.equal(row.attempts, 5);
});

test('missing pending OTP is rejected', async () => {
  const { client } = makeClient(null);
  const result = await verifyOtpWithClient(client, 'user-id', 'login', '123456');
  assert.deepEqual(result, { ok: false, reason: 'no_pending_otp' });
});
