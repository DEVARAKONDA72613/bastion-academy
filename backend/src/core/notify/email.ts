/**
 * Provider-agnostic email interface. This mock adapter just logs to the
 * console so you can develop/test without a real email provider.
 * To go live: implement the same sendEmail() signature using Resend/SES/etc.
 * and swap the export based on process.env.EMAIL_PROVIDER — nothing else
 * in the codebase needs to change.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  if (process.env.EMAIL_PROVIDER === 'mock' || !process.env.EMAIL_PROVIDER) {
    console.log('\n--- MOCK EMAIL ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    console.log('------------------\n');
    return;
  }
  throw new Error(`Email provider "${process.env.EMAIL_PROVIDER}" not implemented yet.`);
}
