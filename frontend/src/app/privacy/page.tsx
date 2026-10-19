import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Bastion Academy handles account information, learning activity, security records, and payment-related data.',
  robots: { index: true, follow: true },
};

const updated = '19 October 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-bg px-4 py-10 text-text sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to Bastion Academy
        </Link>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Legal | Privacy
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-text-dim">Last updated: {updated}</p>

        <aside role="note" className="mt-6 rounded border border-warning/50 bg-elevated p-4 text-sm leading-6">
          This policy explains the information handled by Bastion Academy based on the features currently implemented or configured for the service. Actual provider settings and practices must be kept consistent with this notice. This page is general information, not legal advice.
        </aside>

        <div className="mt-8 space-y-7 text-sm leading-7 text-text-dim">
          <section>
            <h2 className="text-lg font-semibold text-text">1. Who operates Bastion Academy</h2>
            <p>
              Bastion Academy is an online learning platform for cybersecurity and related technical learning. The operator is <strong className="text-text">Sasank Devarakonda</strong> ("Bastion Academy", "we", "us", or "our"). For privacy questions or requests, email <strong className="text-text">sasankdevarakonda62@gmail.com</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">2. Information we handle</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li><strong className="text-text">Account and profile information:</strong> email address, display name, profile details, account status, and account-related records.</li>
              <li><strong className="text-text">Authentication and security information:</strong> password hashes, one-time-code verification records, session-token hashes, IP addresses, browser or device information, trusted-device records, and login history.</li>
              <li><strong className="text-text">Learning activity:</strong> course and video progress, resume positions, completion state, subscription plan, and download authorization or history.</li>
              <li><strong className="text-text">Community and live learning:</strong> comments, replies, reactions, reports, translation requests, meeting participation, room details, and related operational records when you use those features.</li>
              <li><strong className="text-text">Subscription and payment records:</strong> selected plan, invoice amounts, payment or order identifiers, and payment status received through the configured payment integration. Do not send card details, UPI PINs, passwords, or verification codes to support.</li>
              <li><strong className="text-text">Google sign-in:</strong> if you choose Google sign-in, the service receives identity information returned by that sign-in flow, such as your email address and available profile name.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">3. Why information is used</h2>
            <p>
              Information is used to create and secure accounts; verify email addresses and sign-ins; provide courses and plan-based access; save learning progress; operate comments and live rooms; enforce quotas and service rules; process and reconcile payments; prevent abuse; investigate technical problems; respond to requests; and meet applicable legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">4. Cookies and local storage</h2>
            <p>
              The application uses a session cookie for authentication. In production, the server configures the cookie as HttpOnly and Secure; its SameSite setting depends on the deployment configuration. The frontend also stores your selected visual theme in browser local storage. These mechanisms support core service functionality. The frontend source reviewed for this policy does not include an app-level analytics SDK. If analytics, advertising, or other non-essential tracking is added, this policy and any consent controls required by applicable law must be reviewed before that tracking is enabled.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">5. Service providers and data transfers</h2>
            <p>
              Parts of the service may be operated with third-party providers, including Vercel for frontend hosting, Render for backend hosting, Google for sign-in, Gmail-based email delivery, Razorpay for payment processing, and the database or storage providers configured by the operator. Those providers may process information under their own terms and privacy notices. The actual database, storage region, provider settings, and any international transfers depend on the accounts and services configured for the deployment and should be confirmed by the operator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">6. Security and retention</h2>
            <p>
              The project includes controls such as hashed passwords and session tokens, server-side access checks, rate limits, and security logging. No internet service can guarantee absolute security. Information is retained only for as long as reasonably needed for account operation, learning features, security, payment reconciliation, dispute handling, operational records, or applicable legal requirements. Retention periods may vary by record type and by the configured hosting, email, database, and other providers. Requests to delete information will be considered under applicable law and may be subject to necessary legal, accounting, security, or dispute-related retention.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">7. Your choices and requests</h2>
            <p>
              You can contact the operator to ask about personal information associated with your account or to request access, correction, or deletion, subject to identity verification, applicable law, and any legitimate retention requirements. Use the contact address in Section 1. The operator should respond using the contact process and time limits that apply under the law in force when the request is received.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">8. Children</h2>
            <p>
              If you are under 18, use the service only with appropriate parent or legal-guardian involvement and any authorisation required by applicable law. Please contact us if you believe a child has provided personal information inappropriately. We will review the concern and take steps required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">9. Changes to this policy</h2>
            <p>
              This policy may change when the service, providers, data practices, or legal requirements change. The current version and its update date will be published on this page. Material changes should be reviewed before they take effect.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">10. Contact and applicable law</h2>
            <p>
              Privacy contact: <strong className="text-text">sasankdevarakonda62@gmail.com</strong>. Indian laws applicable to the service apply, including relevant information-technology and data-protection requirements and the Digital Personal Data Protection Act, 2023, and Digital Personal Data Protection Rules, 2025, to the extent their provisions are in force and apply. The application and this notice must be operated consistently with the requirements applicable at the relevant time.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 border-t border-border pt-5 text-sm">
          <Link href="/terms" className="text-primary hover:underline">Terms and Conditions</Link>
          <Link href="/login" className="text-text-dim hover:text-primary">Sign in</Link>
        </div>
      </article>
    </main>
  );
}
