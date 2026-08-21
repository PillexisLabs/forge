import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import PwaRegistration from '@/components/PwaRegistration';
import WorkspaceChrome, { type ChromeUser } from '@/components/WorkspaceChrome';
import { getSessionUserFromCookies } from '@/core/session';

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The chrome only needs what the nav filter uses. A null user means the
  // login page (or an expired session mid-redirect) — the chrome hides itself.
  const sessionUser = await getSessionUserFromCookies().catch(() => null);
  const user: ChromeUser | null = sessionUser
    ? { name: sessionUser.name, role: sessionUser.role, modules: sessionUser.modules }
    : null;

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <PwaRegistration />
        <Suspense fallback={children}>
          <WorkspaceChrome user={user}>{children}</WorkspaceChrome>
        </Suspense>
      </body>
    </html>
  );
}
