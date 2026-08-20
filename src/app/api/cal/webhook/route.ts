import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/core/env';
import { recordCalBooking } from '@/modules/crm/crm-cal-intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cal.com BOOKING_CREATED intake for the CRM. Separate from the website's
// Netlify function (Meta CAPI); Cal.com is configured with two webhooks.
// Cal signs with a plain hex HMAC-SHA256 of the raw body, no `sha256=` prefix.

type CalAttendee = { name?: string; email?: string; phoneNumber?: string };
type CalWebhookBody = {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    startTime?: string;
    attendees?: CalAttendee[];
    metadata?: Record<string, unknown>;
    responses?: Record<string, { label?: string; value?: unknown }>;
  };
};

async function validSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = env.calWebhookSecret();
  if (!secret || !header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return header === expected;
}

// The attendee field is authoritative; booking-form answers whose key or
// label mentions phone/whatsapp are the fallback.
function extractPhone(payload: NonNullable<CalWebhookBody['payload']>): string | null {
  const direct = payload.attendees?.[0]?.phoneNumber;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  for (const [key, response] of Object.entries(payload.responses ?? {})) {
    const haystack = `${key} ${response?.label ?? ''}`.toLowerCase();
    if (!/phone|whatsapp|mobile|number/.test(haystack)) continue;
    if (typeof response?.value === 'string' && response.value.replace(/\D/g, '').length >= 10) {
      return response.value.trim();
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!(await validSignature(rawBody, request.headers.get('x-cal-signature-256')))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: CalWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.triggerEvent !== 'BOOKING_CREATED') {
    return NextResponse.json({ skipped: body.triggerEvent ?? 'unknown' });
  }

  const payload = body.payload ?? {};
  const attendee = payload.attendees?.[0];
  if (!payload.uid || !payload.startTime || !attendee?.email) {
    return NextResponse.json({ error: 'Missing uid, startTime, or attendee' }, { status: 400 });
  }

  try {
    const result = await recordCalBooking({
      bookingUid: payload.uid,
      attendeeName: attendee.name?.trim() || attendee.email,
      attendeeEmail: attendee.email,
      phone: extractPhone(payload),
      startsAt: new Date(payload.startTime).toISOString(),
      qualification: payload.responses ?? {},
    });
    console.log(
      `cal intake: booking ${payload.uid} → deal ${result.dealId}`
      + ` (${result.duplicate ? 'duplicate' : result.createdDeal ? 'new deal' : 'existing deal'}`
      + `${result.whatsappQueued ? ', confirmation queued' : ''})`,
    );
    return NextResponse.json({ ok: true, dealId: result.dealId, duplicate: result.duplicate });
  } catch (error) {
    console.error('cal intake failed:', error);
    // Non-200 makes Cal retry, which is what we want for transient failures.
    return NextResponse.json({ error: 'Intake failed' }, { status: 500 });
  }
}
