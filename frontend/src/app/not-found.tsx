import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-text">
      <section className="w-full max-w-lg rounded-lg border border-border bg-elevated p-8 text-center sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Error 404</p>
        <h1 className="mt-3 text-3xl font-semibold">This page is out of scope.</h1>
        <p className="mt-3 text-sm leading-6 text-text-dim">The link may be outdated, or the page may have moved. Head back to Bastion Academy and continue from there.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded bg-primary px-4 py-2.5 text-sm font-semibold text-bg">Go to sign in</Link>
          <Link href="/privacy" className="rounded border border-border px-4 py-2.5 text-sm hover:border-primary">Privacy policy</Link>
        </div>
      </section>
    </main>
  );
}
