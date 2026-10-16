import { test } from 'node:test';
import assert from 'node:assert';
import { can } from '../core/permissions.js';

test('admin can do everything, regardless of action name', () => {
  assert.strictEqual(can({ id: '1', role: 'admin', planCode: 'FREE' }, 'anything.at.all'), true);
});

test('deny-by-default: unknown action is rejected even for a paid plan', () => {
  assert.strictEqual(can({ id: '1', role: 'gold' as any, planCode: 'GOLD' }, 'some.future.action'), false);
});

test('video.watch respects plan rank — FREE cannot watch a BRONZE-gated video', () => {
  assert.strictEqual(can({ id: '1', role: 'free', planCode: 'FREE' }, 'video.watch', { requiredPlan: 'BRONZE' }), false);
});

test('video.watch allows a higher plan than required', () => {
  assert.strictEqual(can({ id: '1', role: 'gold' as any, planCode: 'GOLD' }, 'video.watch', { requiredPlan: 'BRONZE' }), true);
});

test('course.edit requires BOTH instructor role AND ownership', () => {
  const instructor = { id: 'instructor-1', role: 'instructor' as const, planCode: 'FREE' };
  assert.strictEqual(can(instructor, 'course.edit', { ownerId: 'instructor-1' }), true);
  assert.strictEqual(can(instructor, 'course.edit', { ownerId: 'someone-else' }), false);
});

test('meeting.host allows GOLD plan or instructor role, nothing else', () => {
  assert.strictEqual(can({ id: '1', role: 'gold' as any, planCode: 'GOLD' }, 'meeting.host'), true);
  assert.strictEqual(can({ id: '1', role: 'instructor', planCode: 'FREE' }, 'meeting.host'), true);
  assert.strictEqual(can({ id: '1', role: 'silver' as any, planCode: 'SILVER' }, 'meeting.host'), false);
});
