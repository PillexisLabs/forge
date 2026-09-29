import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/core/env';
import { fromPostmark, fromRawMime, ingestForwardedEmail } from '@/modules/email/email-integration';
import { runJobConsumers } from '@/modules/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Forwarded email intake. The inbound mail service for EMAIL_INBOUND_DOMAIN
// posts each message here:
//   - Postmark inbound: JSON, set the webhook to /api/intake/email?key=<EMAIL_INBOUND_KEY>
//   - a Cloudflare Email Worker or any relay: the raw message (message/rfc822)
// Always answers 200 for a valid key, so the service does not retry mail we
// chose to ignore.

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const key = env.emailInboundKey();
  const given = request.nextUrl.searchParams.get('key') ?? request.headers.get('x-forge-key') ?? '';
  if (!key || !given || !sameKey(given, key)) return NextResponse.json({ error: 'Invalid key.' }, { status: 401 });

  const type = request.headers.get('content-type') ?? '';
  try {
    const parsed = type.includes('application/json')
      ? fromPostmark(await request.json())
      : await fromRawMime(Buffer.from(await request.arrayBuffer()));
    const outcome = await ingestForwardedEmail(parsed);
    if (outcome === 'enquiry') await runJobConsumers().catch((error) => console.error('jobs: consumer pass after email failed', error));
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error('email intake failed', error);
    return NextResponse.json({ error: 'The email could not be read.' }, { status: 400 });
  }
}
