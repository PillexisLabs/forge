import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getIntegration, integrationSecret } from '@/core/integrations';
import { recordInbound } from '@/core/intake';
import { runJobConsumers } from '@/modules/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generic intake for any tool that can POST: a website form, Zapier, Make,
// or an IndiaMART push. Authenticate with the token from Settings →
// Integrations → Webhook:  Authorization: Bearer <token>
//
//   { "id": "lead-123", "name": "Rahul", "phone": "9845011223",
//     "email": "r@x.in", "company": "Mehta Namkeen", "message": "Need 5000 ..." }
//
// IndiaMART field names (SENDER_NAME, SENDER_MOBILE, QUERY_MESSAGE, ...) work too.

function pick(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const row = await getIntegration('webhook');
  const token = integrationSecret(row);
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!row.enabled || !token) return NextResponse.json({ error: 'The webhook integration is switched off.' }, { status: 403 });
  if (!given || !sameToken(given, token)) return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 });
  const body = ((raw as Record<string, unknown>).RESPONSE ?? raw) as Record<string, unknown>;

  const product = pick(body, ['QUERY_PRODUCT_NAME', 'product']);
  const message = pick(body, ['message', 'requirement', 'enquiry', 'text', 'QUERY_MESSAGE']);
  const text = [message, product && !message?.includes(product) ? `Product: ${product}` : null].filter(Boolean).join('\n');
  if (!text) return NextResponse.json({ error: 'The "message" field is required.' }, { status: 400 });

  const record = await recordInbound({
    source: 'webhook',
    externalId: pick(body, ['id', 'UNIQUE_QUERY_ID', 'lead_id']) ?? `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromName: pick(body, ['name', 'SENDER_NAME', 'full_name']),
    fromPhone: pick(body, ['phone', 'mobile', 'SENDER_MOBILE', 'whatsapp']),
    fromEmail: pick(body, ['email', 'SENDER_EMAIL']),
    company: pick(body, ['company', 'SENDER_COMPANY', 'business']),
    body: text,
    raw,
  });
  await runJobConsumers().catch((error) => console.error('jobs: consumer pass after intake failed', error));
  return NextResponse.json({ ok: true, duplicate: record === null });
}
