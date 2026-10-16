import type { Config } from 'tailwindcss';

// Mirrors the design tokens from Phase 3 (01-architecture.md / bastion-prototype.html)
// exactly, so the real app and the earlier prototype stay visually identical.
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        border: 'var(--border)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px', modal: '10px', pill: '999px' },
    },
  },
  plugins: [],
};
export default config;
