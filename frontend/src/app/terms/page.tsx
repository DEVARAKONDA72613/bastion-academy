import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description:
    'Terms for accounts, cybersecurity learning content, subscriptions, community features, and use of Bastion Academy.',
  robots: { index: true, follow: true },
};

const updated = '19 October 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg px-4 py-10 text-text sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to Bastion Academy
        </Link>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Legal | Terms
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-text-dim">Last updated: {updated}</p>

        <aside role="note" className="mt-6 rounded border border-warning/50 bg-elevated p-4 text-sm leading-6">
          Read these terms together with the plan details and purchase information shown before checkout. Mandatory rights under applicable law are not waived by these terms. This page is a draft for review and is not legal advice.
        </aside>

        <div className="mt-8 space-y-7 text-sm leading-7 text-text-dim">
          <section>
            <h2 className="text-lg font-semibold text-text">1. Service and operator</h2>
            <p>
              Bastion Academy provides online learning features that may include technical lessons, course progress, subscription tiers, download authorizations, comments, and live learning rooms. The operator is <strong className="text-text">Sasank Devarakonda</strong>. Contact: <strong className="text-text">sasankdevarakonda62@gmail.com</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">2. Accounts and security</h2>
            <p>
              Provide accurate account information, protect your sign-in credentials and verification codes, and notify the operator if you believe your account has been compromised. Account responsibility is subject to any protections provided by applicable law. Access may be restricted where reasonably necessary to protect users, investigate abuse, enforce these terms, or respond to legal requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">3. Learning content and plan access</h2>
            <p>
              Access to lessons and features depends on the requirements displayed by the service and the plan recognised by the server for your account. Do not bypass authentication, subscription checks, quotas, or other technical restrictions. Unless a separate written licence or a legal exception allows it, course materials, branding, and platform software may not be copied, redistributed, resold, or publicly republished without permission. You must have the rights needed to upload or share content you submit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">4. Plans, checkout, and invoices</h2>
            <p>
              Review the plan name, price, billing period, and total shown at checkout before placing an order. Payment credentials are handled through the payment provider and the service may receive transaction identifiers and payment status. Subscription access should be granted only after the server verifies the payment confirmation. The code reviewed for this draft implements one-time checkout and does not implement automatic recurring Razorpay charges. The payment mode actually enabled in the deployment must be checked before real purchases are accepted. A test-mode transaction is not a real paid purchase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">5. Cancellation, payment issues, and refunds</h2>
            <p>
              The code reviewed for this draft uses one-time checkout and does not implement automatic recurring Razorpay charges. Review the amount, plan duration, applicable taxes, and any purchase-specific conditions shown before payment. If payment is debited but access is not provided, a duplicate payment appears, or you believe a refund is due, email <strong className="text-text">sasankdevarakonda62@gmail.com</strong> with the order or payment reference; never include a password, UPI PIN, or one-time code. Requests will be reviewed against the purchase terms, payment-provider records, and applicable Indian law. This section does not guarantee that every request will be approved and does not limit rights that cannot legally be waived. A setting that expresses a renewal preference must not be treated as cancellation of recurring charges unless recurring billing is actually configured.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">6. Community and live-room conduct</h2>
            <p>
              Do not threaten, harass, impersonate, spam, unlawfully record, or share another person's private information without permission. Do not submit content that infringes others' rights or use the platform to facilitate unlawful activity. By submitting content, you permit the operator to host, store, process, and display it only as reasonably needed to run the feature you use, maintain the service, and handle moderation or abuse reports, subject to applicable law. Reported content may be reviewed or restricted under service rules and applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">7. Acceptable technical use</h2>
            <p>
              Do not probe, attack, disrupt, distribute malware through, or attempt unauthorised access to the service or its infrastructure. Security testing must be expressly authorised and performed within the agreed scope. Educational material is provided for learning; you remain responsible for using it lawfully and safely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">8. Availability and changes</h2>
            <p>
              The operator will make reasonable efforts to maintain the service, but uninterrupted or error-free availability is not guaranteed. Features may change, be temporarily unavailable, or depend on third-party services. Actual availability depends on the integrations and infrastructure configured for the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">9. Suspension and termination</h2>
            <p>
              Access may be restricted or suspended for security reasons, misuse, violation of these terms, payment issues where applicable, or legal obligations. Where reasonably possible and legally permitted, notice or an opportunity to resolve an issue may be provided. Mandatory consumer and data-protection rights remain unaffected.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">10. Disclaimers and liability</h2>
            <p>
              The service is provided subject to applicable law. To the extent legally permitted, the operator does not guarantee that content will meet every learner's needs or that the service will always be available. Nothing in these terms excludes statutory warranties, consumer protections, or liability that cannot legally be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text">11. Governing law and contact</h2>
            <p>
              These terms are governed by the applicable laws of India. Disputes are subject to the courts or other forums that have jurisdiction under applicable Indian law. Mandatory consumer rights are not waived. Contact: <strong className="text-text">sasankdevarakonda62@gmail.com</strong>.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 border-t border-border pt-5 text-sm">
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link href="/login" className="text-text-dim hover:text-primary">Sign in</Link>
        </div>
      </article>
    </main>
  );
}
