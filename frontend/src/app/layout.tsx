
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bastion Academy',
  description: 'Where defenders are trained, not just certified.',
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
