import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaRegistration from '@/components/PwaRegistration';

export const metadata: Metadata = {
  title: 'Forge',
  applicationName: 'Forge',
  description: 'Pillexis marketing analytics and client follow-up workspace.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/forge-logo.png', type: 'image/png', sizes: '1024x1024' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Forge',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#fbfafc',
  viewportFit: 'cover',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
