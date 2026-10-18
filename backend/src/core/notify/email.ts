import nodemailer from 'nodemailer';

type EmailProvider = 'mock' | 'gmail';

let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * Email delivery adapter.
 * - mock: local development only; prints to the terminal.
 * - gmail: SMTP over TLS using a Google App Password stored in Render secrets.
 *
 * Never log OTP bodies in the Gmail provider path.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  const provider = (process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'gmail' : 'mock')).toLowerCase() as EmailProvider;

  if (provider === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mock email delivery is disabled in production. Configure Gmail SMTP before enabling email OTPs.');
    }
    console.log('\n--- MOCK EMAIL (development only) ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    console.log('-------------------------------------\n');
    return;
  }

  if (provider === 'gmail') {
    const user = process.env.GMAIL_USER?.trim();
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
    if (!user || !appPassword) {
      throw new Error('Gmail delivery is enabled but GMAIL_USER or GMAIL_APP_PASSWORD is not configured.');
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

  throw new Error(`Email provider "${provider}" is not supported. Use "mock" or "gmail".`);
}