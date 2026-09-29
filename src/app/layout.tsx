import './globals.css';
import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
import type { Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import PwaRegistration from '@/components/PwaRegistration';
import WorkspaceChrome, { type ChromeUser } from '@/components/WorkspaceChrome';
import { attentionCount } from '@/core/attention';
import { enabledModuleNames, switchedOffModules } from '@/core/modules';
import { MODULES } from '@/modules/registry';
import { getSessionUserFromCookies } from '@/core/session';

export const metadata: Metadata = {
  title: 'Forge',
  applicationName: 'Forge',
  description: 'Pillexis marketing analytics and client follow-up workspace.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: '48x48' }],
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
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

// Pillexis design system typeface.
const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-noto', display: 'swap' });

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The chrome only needs what the nav filter uses. A null user means the
  // login page (or an expired session mid-redirect) — the chrome hides itself.
  const sessionUser = await getSessionUserFromCookies().catch(() => null);
  const attention = sessionUser ? await attentionCount(sessionUser).catch(() => 0) : 0;
  // Installed modules (FORGE_MODULES) minus the ones switched off in Settings → Modules.
  const off = sessionUser ? await switchedOffModules() : [];
  const installed = enabledModuleNames() ?? MODULES.map((mod) => mod.name);
  const visible = installed.filter((name) => !off.includes(name));
  const user: ChromeUser | null = sessionUser
    ? { name: sessionUser.name, role: sessionUser.role, modules: sessionUser.modules }
    : null;

  return (
    <html lang="en" className={noto.variable}>
      <body className="min-h-screen antialiased">
        <PwaRegistration />
        <Suspense fallback={children}>
          <WorkspaceChrome user={user} enabledModules={visible} attention={attention}>{children}</WorkspaceChrome>
        </Suspense>
      </body>
    </html>
  );
}
