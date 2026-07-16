import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { runSync } from '@/lib/sync';
import { verifyToken, SESSION_COOKIE } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<'manual' | 'cron' | null> {
  // 1) Logged-in dashboard user (manual "Refresh now" button).
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyToken(token, env.authSecret())) return 'manual';

  // 2) Cron / GitHub Action via shared secret.
  const secret = env.syncSecret();
  if (secret) {
    const header = req.headers.get('x-sync-secret');
    const auth = req.headers.get('authorization');
    if (header === secret || auth === `Bearer ${secret}`) return 'cron';
  }
  return null;
}

async function handle(req: NextRequest) {
  const trigger = await authorize(req);
  if (!trigger) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const days = Number(new URL(req.url).searchParams.get('days') ?? '8');
  try {
    const result = await runSync({ days: Number.isFinite(days) ? days : 8, trigger });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
