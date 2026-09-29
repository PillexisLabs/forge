import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Noto_Sans } from 'next/font/google';
import type { Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import PwaRegistration from '@/components/PwaRegistration';
import WorkspaceChrome, { type ChromeUser } from '@/components/WorkspaceChrome';
import { brandPalette, getAppearance, TEXT_SIZES } from '@/core/appearance';
import { attentionCount } from '@/core/attention';
import { enabledModuleNames, switchedOffModules } from '@/core/modules';
import { MODULES } from '@/modules/registry';
import { getSessionUserFromCookies } from '@/core/session';

const DESCRIPTION = 'Enquiries from WhatsApp, email and Google Sheets become quotes, orders and payment follow-ups. Your team checks and approves.';

// The share preview (WhatsApp, LinkedIn, X, Slack). Links are absolute and
// built from the host the link was shared from, so staging and production
// each preview their own address.
export async function generateMetadata(): Promise<Metadata> {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const image = { url: '/og-image.png', width: 1200, height: 630, alt: 'Forge by Pillexis Labs' };
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: 'Forge',
    applicationName: 'Forge',
    description: DESCRIPTION,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: '48x48' }],
      apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    openGraph: { type: 'website', siteName: 'Forge by Pillexis Labs', title: 'Forge by Pillexis Labs', description: DESCRIPTION, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title: 'Forge by Pillexis Labs', description: DESCRIPTION, images: [image.url] },
    // A private workspace: previews work, search engines do not list it.
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      title: 'Forge',
      statusBarStyle: 'default',
    },
    formatDetection: { telephone: false },
  };
}

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
  // Settings → Appearance: brand color tokens and the root text size.
  const appearance = await getAppearance();
  const look = { ...brandPalette(appearance.brandColor), fontSize: `${TEXT_SIZES[appearance.textSize].px}px` } as React.CSSProperties;
  // Installed modules (FORGE_MODULES) minus the ones switched off in Settings → Modules.
  const off = sessionUser ? await switchedOffModules() : [];
  const installed = enabledModuleNames() ?? MODULES.map((mod) => mod.name);
  const visible = installed.filter((name) => !off.includes(name));
  const user: ChromeUser | null = sessionUser
    ? { name: sessionUser.name, role: sessionUser.role, modules: sessionUser.modules }
    : null;

  return (
    <html lang="en" className={noto.variable} style={look}>
      <body className="min-h-screen antialiased">
        <PwaRegistration />
        <Suspense fallback={children}>
          <WorkspaceChrome user={user} enabledModules={visible} attention={attention}>{children}</WorkspaceChrome>
        </Suspense>
      </body>
    </html>
  );
}
