import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pillexis · Marketing Analytics',
  description: 'Daily GA4 + Meta Ads performance, joined on cost per booked call.',
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
        {children}
      </body>
    </html>
  );
}
