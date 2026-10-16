export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded bg-primary text-bg font-bold mb-4">B</div>
          <h1 className="text-2xl font-semibold text-text">{title}</h1>
          {subtitle && <p className="text-text-dim text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="bg-elevated border border-border rounded p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm text-text-dim mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-border bg-surface text-text px-3 py-2 text-sm outline-none focus:border-primary transition-colors';

export const buttonClass =
  'w-full rounded bg-primary text-bg font-medium py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed';

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-error text-sm mb-4">{children}</p>;
}
