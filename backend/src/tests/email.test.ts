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

test('Gmail API provider requires OAuth credentials before making network requests', async () => {
  const keys = [
    'NODE_ENV',
    'EMAIL_PROVIDER',
    'GMAIL_USER',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
  ] as const;
  const previous = new Map<string, string | undefined>();
  for (const key of keys) previous.set(key, process.env[key]);

  process.env.NODE_ENV = 'production';
  process.env.EMAIL_PROVIDER = 'gmail-api';
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  delete process.env.GMAIL_REFRESH_TOKEN;

  try {
    await assert.rejects(
      sendEmail('test@example.com', 'Reset password', 'OTP: 123456'),
      /Gmail API delivery is not configured/i,
    );
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
