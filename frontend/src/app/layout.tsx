
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bastion-academy.vercel.app'),
  title: {
    default: 'Bastion Academy | Cybersecurity Learning',
    template: '%s | Bastion Academy',
  },
  description: 'Train practical cybersecurity skills with structured lessons, live learning rooms, and subscription-based learning paths.',
  applicationName: 'Bastion Academy',
  openGraph: {
    type: 'website',
    url: 'https://bastion-academy.vercel.app',
    siteName: 'Bastion Academy',
    title: 'Bastion Academy | Cybersecurity Learning',
    description: 'Train practical cybersecurity skills with structured lessons, live learning rooms, and subscription-based learning paths.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Bastion Academy cybersecurity learning' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bastion Academy | Cybersecurity Learning',
    description: 'Train practical cybersecurity skills with structured lessons, live learning rooms, and subscription-based learning paths.',
    images: ['/twitter-image'],
  },
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('bastion-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
