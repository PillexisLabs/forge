import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaRegistration from '@/components/PwaRegistration';

export const metadata: Metadata = {
  title: 'Forge Analytics',
  applicationName: 'Forge Analytics',
  description: 'Daily GA4 + Meta Ads performance, joined on cost per booked call.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Forge',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  viewportFit: 'cover',
};

export const dynamic = 'force-dynamic';

// Apply the saved theme before paint to avoid a flash. Defaults to dark.
const themeScript = `
try {
  var t = localStorage.getItem('theme');
  var d = document.documentElement;
  if (t === 'light') d.classList.remove('dark'); else d.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-[#0a0a0a] dark:text-gray-200">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
