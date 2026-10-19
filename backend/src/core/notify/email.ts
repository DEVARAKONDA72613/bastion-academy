import nodemailer from 'nodemailer';

type EmailProvider = 'mock' | 'gmail' | 'gmail-api';

type GmailApiConfig = {
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
};

type GoogleTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
};

let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let cachedGmailAccessToken: { value: string; expiresAt: number } | null = null;

function getGmailApiConfig(): GmailApiConfig {
  const user = process.env.GMAIL_USER?.trim();
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();

  const missing: string[] = [];
  if (!user) missing.push('GMAIL_USER');
  if (!clientId) missing.push('GMAIL_CLIENT_ID');
  if (!clientSecret) missing.push('GMAIL_CLIENT_SECRET');
  if (!refreshToken) missing.push('GMAIL_REFRESH_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Gmail API delivery is not configured. Missing environment variables: ${missing.join(', ')}.`);
  }

  return {
    user: user!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    from: process.env.EMAIL_FROM?.trim() || user!,
  };
}

function safeHeader(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    throw new Error(`${label} is invalid for Gmail API email delivery.`);
  }
  return trimmed;
}

async function getGmailApiAccessToken(config: GmailApiConfig): Promise<string> {
  if (cachedGmailAccessToken && cachedGmailAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedGmailAccessToken.value;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || typeof payload.access_token !== 'string') {
    const providerError = typeof payload.error === 'string' ? `: ${payload.error}` : '';
    throw new Error(`Gmail API OAuth token refresh failed (HTTP ${response.status})${providerError}.`);
  }

  const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
    ? payload.expires_in
    : 3600;

  cachedGmailAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return payload.access_token;
}

async function sendViaGmailApi(to: string, subject: string, body: string): Promise<void> {
  const config = getGmailApiConfig();
  const recipient = safeHeader(to, 'Recipient');
  const sender = safeHeader(config.from, 'Sender');
  const safeSubject = safeHeader(subject, 'Subject');
  const accessToken = await getGmailApiAccessToken(config);

  // Build a simple RFC 2822 message, then base64url-encode it as required by Gmail API.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(safeSubject, 'utf8').toString('base64')}?=`;
  const encodedBody = Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
  const mimeMessage = [
    `To: ${recipient}`,
    `From: ${sender}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: Buffer.from(mimeMessage, 'utf8').toString('base64url') }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    let reason = '';
    try {
      const result = await response.json() as { error?: { message?: unknown } };
      if (typeof result.error?.message === 'string') {
        reason = `: ${result.error.message.slice(0, 180)}`;
      }
    } catch {
      // Keep the failure message safe even if Google returns a non-JSON response.
    }
    throw new Error(`Gmail API message send failed (HTTP ${response.status})${reason}.`);
  }
}

/**
 * Email delivery adapter.
 * - mock: local development only; prints to the terminal.
 * - gmail: SMTP over TLS using a Google App Password.
 * - gmail-api: Gmail API over HTTPS using OAuth client credentials and a refresh token.
 *
 * Never log OTP bodies, OAuth tokens, or email credentials.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  const provider = (process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'gmail' : 'mock')).toLowerCase() as EmailProvider;

  if (provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mock email delivery is disabled in production. Configure a production email provider before enabling email OTPs.');
    }
    console.log('\n--- MOCK EMAIL (development only) ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    console.log('-------------------------------------\n');
    return;
  }

  if (provider === 'gmail-api') {
    await sendViaGmailApi(to, subject, body);
    return;
  }

  if (provider === 'gmail') {
    const user = process.env.GMAIL_USER?.trim();
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    if (!user || !appPassword) {
      throw new Error('Gmail SMTP delivery is enabled but GMAIL_USER or GMAIL_APP_PASSWORD is not configured.');
    }

    if (!gmailTransporter) {
      gmailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: appPassword },
      });
    }

    await gmailTransporter.sendMail({
      from: process.env.EMAIL_FROM?.trim() || user,
      to,
      subject,
      text: body,
    });
    return;
  }

  throw new Error(`Email provider "${provider}" is not supported. Use "mock", "gmail", or "gmail-api".`);
}
