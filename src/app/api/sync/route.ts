import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { runSync } from '@/modules/analytics/sync';
import { getSessionUser } from '@/core/session';
import { hasPermission } from '@/core/permissions';
import { authorizeApiClient } from '@/core/api-auth';
import { env } from '@/core/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorize(req: NextRequest): Promise<
  | { ok: true; trigger: string }
  | { ok: false; status: 401 | 403 | 500; error: string }
> {
  // 1) Logged-in dashboard user (manual "Refresh now" button). The trigger
  //    names the acting user so sync_runs rows are attributable. Sync is the
  //    analytics module's declared special action — viewers cannot trigger it.
  const user = await getSessionUser(req);
  if (user) {
    if (!hasPermission(user, 'analytics:sync')) {
      return { ok: false, status: 403, error: 'Your account does not have analytics:sync access.' };
    }
    return { ok: true, trigger: `manual:${user.email}` };
  }

  // 2) Identified machine client with the explicit sync scope.
  if (req.headers.has('x-pillexis-client-id')) {
    const auth = authorizeApiClient(req, 'analytics:sync');
    if (!auth.ok) return auth;
    return { ok: true, trigger: `api:${auth.client.id}` };
  }

  // 3) Legacy shared secret. Retained during migration; prefer API_CLIENTS_JSON.
  const secret = env.syncSecret();
  if (secret) {
    const header = req.headers.get('x-sync-secret');
    const auth = req.headers.get('authorization');
    if (header === secret || auth === `Bearer ${secret}`) return { ok: true, trigger: 'cron' };
  }
  return { ok: false, status: 401, error: 'unauthorized' };
}

async function handle(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Number(new URL(req.url).searchParams.get('days') ?? '8');
  const from = new URL(req.url).searchParams.get('from') ?? undefined;
  const to = new URL(req.url).searchParams.get('to') ?? undefined;
  try {
    const result = await runSync({ days: Number.isFinite(days) ? days : 8, from, to, trigger: auth.trigger });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
