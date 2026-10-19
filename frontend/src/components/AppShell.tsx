'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { applyTheme } from '@/lib/theme';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: '⌂' },
  { href: '/courses', label: 'Learn', icon: '▤' },
  { href: '/live', label: 'Live', icon: '●' },
  { href: '/downloads', label: 'Downloads', icon: '↓' },
  { href: '/pricing', label: 'Plans', icon: '$' },
  { href: '/billing', label: 'Billing', icon: '▣' },
  { href: '/settings/security', label: 'Security', icon: '⚑' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  async function handleLogout() {
    await api.logout();
    router.push('/login');
  }

  async function setTheme(theme: 'auto' | 'light' | 'dark') {
    await api.updateTheme(theme);
    if (theme !== 'auto') applyTheme(theme);
    setThemeMenuOpen(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg text-text-dim text-sm">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <nav aria-label="Main navigation" className="flex w-full flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:min-h-screen md:w-[76px] md:flex-col md:justify-start md:gap-1.5 md:border-b-0 md:border-r md:px-0 md:py-5">
        <Link href="/dashboard" aria-label="Bastion Academy home" className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-primary font-bold text-bg md:mb-5 md:flex">B</Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} title={item.label}
            className={`flex h-12 min-w-[58px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded px-1 text-[10px] transition-colors md:w-12 md:min-w-0 md:px-0 ${pathname.startsWith(item.href) ? 'bg-elevated text-primary' : 'text-text-dim hover:text-text'}`}>
            <span className="text-base leading-none">{item.icon}</span>{item.label}
          </Link>
        ))}
        {user?.role === 'admin' && (
          <Link href="/admin" title="Admin" className={`flex h-12 min-w-[58px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded px-1 text-[10px] md:w-12 md:min-w-0 md:px-0 ${pathname.startsWith('/admin') ? 'bg-elevated text-primary' : 'text-text-dim hover:text-text'}`}>
            <span className="text-base leading-none">⚙</span>Admin
          </Link>
        )}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur md:px-6">
          <span className="whitespace-nowrap font-mono text-xs text-text-dim sm:text-sm">bastion.academy</span>
          <div className="relative flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="rounded border border-border bg-elevated px-2 py-1 font-mono text-[10px] text-text-dim sm:text-xs">{user?.plan_code}</span>
            <button onClick={() => setThemeMenuOpen((o) => !o)} className="rounded border border-border bg-elevated px-2 py-1.5 text-xs text-text-dim hover:text-text sm:px-3">Theme</button>
            {themeMenuOpen && (
              <div className="absolute right-20 top-10 z-30 w-32 rounded border border-border bg-elevated py-1 shadow-lg sm:right-24">
                {(['auto', 'light', 'dark'] as const).map((t) => (
                  <button key={t} onClick={() => setTheme(t)} className="block w-full px-3 py-1.5 text-left text-sm capitalize text-text hover:bg-surface">{t}</button>
                ))}
              </div>
            )}
            <span className="hidden max-w-[120px] truncate text-sm text-text sm:block">{user?.display_name}</span>
            <button onClick={handleLogout} className="whitespace-nowrap text-xs text-text-dim hover:text-error">Sign out</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 pb-6 text-xs text-text-dim md:px-8">
          <Link href="/privacy" className="hover:text-primary hover:underline">Privacy policy</Link>
          <Link href="/terms" className="hover:text-primary hover:underline">Terms and Conditions</Link>
        </footer>
      </div>
    </div>
  );
}
