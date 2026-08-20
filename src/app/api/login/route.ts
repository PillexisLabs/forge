import { NextResponse } from 'next/server';
import { createToken, SESSION_COOKIE } from '@/core/auth';
import { env } from '@/core/env';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = body?.password;

  if (!password || password !== env.dashboardPassword()) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createToken(env.authSecret());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
