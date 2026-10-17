import { test } from 'node:test';
import assert from 'node:assert';
import { can, type Subject } from '../core/permissions.js';

test('admin can do everything, regardless of action name', () => {
  assert.strictEqual(
    can({ id: '1', role: 'admin', planCode: 'FREE' }, 'anything.at.all'),
    true
  );
});

test('deny-by-default: unknown action is rejected even for a paid plan', () => {
  assert.strictEqual(
    can(
      { id: '1', role: 'gold', planCode: 'GOLD' },
      'some.future.action'
    ),
    false
  );
});

test('video.watch respects plan rank â€” FREE cannot watch BRONZE content', () => {
  assert.strictEqual(
    can(
      { id: '1', role: 'free', planCode: 'FREE' },
      'video.watch',
      { requiredPlan: 'BRONZE' }
    ),
    false
  );
});

test('video.watch allows a higher plan than required', () => {
  assert.strictEqual(
    can(
      { id: '1', role: 'gold', planCode: 'GOLD' },
      'video.watch',
      { requiredPlan: 'BRONZE' }
    ),
    true
  );
});

test('course.edit requires instructor role AND ownership', () => {
  const instructor: Subject = {
    id: 'instructor-1',
    role: 'instructor',
    planCode: 'FREE',
  };

  assert.strictEqual(
    can(instructor, 'course.edit', { ownerId: 'instructor-1' }),
    true
  );

  assert.strictEqual(
    can(instructor, 'course.edit', { ownerId: 'someone-else' }),
    false
  );
});

const planUsers: Subject[] = [
  { id: 'free-1', role: 'free', planCode: 'FREE' },
  { id: 'bronze-1', role: 'bronze', planCode: 'BRONZE' },
  { id: 'silver-1', role: 'silver', planCode: 'SILVER' },
  { id: 'gold-1', role: 'gold', planCode: 'GOLD' },
  { id: 'instructor-1', role: 'instructor', planCode: 'FREE' },
];

test('all subscription plans can create and host meetings', () => {
  for (const subject of planUsers) {
    assert.strictEqual(
      can(subject, 'meeting.host'),
      true,
      `${subject.planCode} should be able to host a meeting`
    );
  }
});

test('all subscription plans can join meetings', () => {
  for (const subject of planUsers) {
    assert.strictEqual(
      can(subject, 'meeting.join'),
      true,
      `${subject.planCode} should be able to join a meeting`
    );
  }
});