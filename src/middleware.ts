import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, SESSION_COOKIE } from './lib/auth';

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
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-icon.png' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifyToken(token, process.env.AUTH_SECRET ?? '');
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
