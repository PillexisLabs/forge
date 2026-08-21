import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from '@/core/auth';
import { env } from '@/core/env';
import {
  emailDomainAllowed,
  getUserByEmail,
  recordLogin,
  seedAdminIfEmpty,
  verifyPassword,
} from '@/core/users';

export const runtime = 'nodejs';

// 5 attempts per 15 minutes per IP (plans/RBAC.md section 7). In-memory is
// right at this scale; a redeploy resetting the counters is acceptable.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  // The domain check shares the generic message: an off-domain address is
  // simply an address that can never sign in.
  if (!email || !password || !emailDomainAllowed(email)) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await seedAdminIfEmpty();

  // One generic message for every failure mode — unknown email, wrong
  // password, disabled account — so the form doesn't confirm which emails exist.
  const user = await getUserByEmail(email);
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !passwordOk || user.status !== 'active') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await recordLogin(user.id);
  attempts.delete(ip);

  const token = await createSessionToken(env.authSecret(), {
    id: user.id,
    sessionVersion: user.sessionVersion,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
