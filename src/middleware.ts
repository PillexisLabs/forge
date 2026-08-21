import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from './core/auth';

// API routes authenticate themselves and must return JSON errors rather than
// being redirected to the dashboard login page.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/sync') ||
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/whatsapp/webhook') ||
    pathname.startsWith('/api/cal/webhook') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/forge-logo.png' ||
    pathname === '/apple-icon.png' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  // Stateless check only (signature + expiry) — Edge cannot reach Postgres.
  // The Node layer (src/core/session.ts) re-checks the user row on every
  // request that acts: status, session_version, existence.
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySessionToken(token, process.env.AUTH_SECRET ?? '');
  if (!claims) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
