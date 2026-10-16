import { test } from 'node:test';
import assert from 'node:assert';
import { computeDefaultThemeForNow } from '../core/theme.js';

function withMockedNow(isoUtc: string, fn: () => void) {
  const original = Date.now;
  Date.now = () => new Date(isoUtc).getTime();
  try { fn(); } finally { Date.now = original; }
}

test('7 AM IST (1:30 AM UTC) defaults to light', () => {
  withMockedNow('2026-01-15T01:30:00Z', () => {
    assert.strictEqual(computeDefaultThemeForNow(), 'light');
  });
});

test('11:59 AM IST (6:29 AM UTC) is still light', () => {
  withMockedNow('2026-01-15T06:29:00Z', () => {
    assert.strictEqual(computeDefaultThemeForNow(), 'light');
  });
});

test('12:00 PM IST exactly (6:30 AM UTC) switches to dark', () => {
  withMockedNow('2026-01-15T06:30:00Z', () => {
    assert.strictEqual(computeDefaultThemeForNow(), 'dark');
  });
});

test('11 PM IST (5:30 PM UTC) defaults to dark', () => {
  withMockedNow('2026-01-15T17:30:00Z', () => {
    assert.strictEqual(computeDefaultThemeForNow(), 'dark');
  });
});

test('4:59 AM IST (11:29 PM UTC prior day) is still dark', () => {
  withMockedNow('2026-01-14T23:29:00Z', () => {
    assert.strictEqual(computeDefaultThemeForNow(), 'dark');
  });
});
