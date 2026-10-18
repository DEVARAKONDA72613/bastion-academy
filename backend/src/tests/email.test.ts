import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from '../core/notify/email.js';

test('mock email delivery never logs OTP content in production', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.EMAIL_PROVIDER;
  const output: string[] = [];
  const previousLog = console.log;
  process.env.NODE_ENV = 'production';
  process.env.EMAIL_PROVIDER = 'mock';
  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
  try {
    await assert.rejects(
      sendEmail('test@example.com', 'Reset password', 'OTP: 123456'),
      /disabled in production/i,
    );
    assert.deepEqual(output, []);
  } finally {
    console.log = previousLog;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previousProvider;
  }
});
