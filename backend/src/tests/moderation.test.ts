import { test } from 'node:test';
import assert from 'node:assert';
import { checkComment, isFlooding } from '../core/moderation.js';

test('rejects empty comment', () => {
  assert.strictEqual(checkComment('').allowed, false);
  assert.strictEqual(checkComment('   ').allowed, false);
});

test('rejects comment over 2000 characters', () => {
  assert.strictEqual(checkComment('a'.repeat(2001)).allowed, false);
});

test('allows normal comment with no flags', () => {
  const result = checkComment('Does this apply to GCP IAM bindings too?');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.flagged, undefined);
});

test('flags (but does not block) a comment with many links', () => {
  const result = checkComment('check http://a.com and http://b.com and http://c.com');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.flagged, true);
  assert.strictEqual(result.reason, 'multiple_links');
});

test('flags repeated-character spam', () => {
  const result = checkComment('aaaaaaaaaaaaaaaaaaaa this is spam');
  assert.strictEqual(result.flagged, true);
  assert.strictEqual(result.reason, 'repeated_characters');
});

test('flood detection: 5 comments in the last 60s trips the limit', () => {
  const now = Date.now();
  const timestamps = Array.from({ length: 5 }, (_, i) => new Date(now - i * 1000));
  assert.strictEqual(isFlooding(timestamps), true);
});

test('flood detection: comments outside the window do not count', () => {
  const now = Date.now();
  const timestamps = [new Date(now - 120_000), new Date(now - 130_000)]; // 2+ min old
  assert.strictEqual(isFlooding(timestamps), false);
});
