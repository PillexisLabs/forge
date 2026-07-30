import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { recordDeliveryFailure, recordInboundWhatsApp } from '@/lib/crm-whatsapp-inbound';
import { sendWhatsAppText } from '@/lib/whatsapp-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Meta's one-time subscription handshake.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    params.get('hub.mode') === 'subscribe'
    && params.get('hub.verify_token') === env.whatsappVerifyToken()
  ) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

async function validSignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = env.whatsappAppSecret();
  if (!secret) {
    // Sandbox convenience only — set WHATSAPP_APP_SECRET before any deploy.
    console.warn('whatsapp webhook: WHATSAPP_APP_SECRET not set, accepting unsigned request');
    return true;
  }
  if (!header?.startsWith('sha256=')) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return header.slice('sha256='.length) === expected;
}

type MetaWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { from?: string; id?: string; type?: string; text?: { body?: string } }[];
        statuses?: {
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string; message?: string }[];
        }[];
      };
    }[];
  }[];
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!(await validSignature(rawBody, request.headers.get('x-hub-signature-256')))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Meta retries on non-200, so failures are logged rather than surfaced.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const message of value.messages ?? []) {
        if (!message.from || !message.id) continue;
        const text = message.type === 'text'
          ? message.text?.body ?? ''
          : `[${message.type ?? 'unsupported'} message]`;
        try {
          const result = await recordInboundWhatsApp({
            from: message.from,
            text,
            messageId: message.id,
            profileName: value.contacts?.[0]?.profile?.name,
          });
          if (result.handled && result.ack) {
            const send = await sendWhatsAppText(message.from, result.ack);
            if (!send.ok) console.warn(`whatsapp ack to ${message.from} failed: ${send.error}`);
          }
        } catch (error) {
          console.error('whatsapp inbound processing failed:', error);
        }
      }

      for (const status of value.statuses ?? []) {
        if (status.status === 'failed' && status.id) {
          const detail = (status.errors ?? [])
            .map((item) => `${item.code ?? ''} ${item.title ?? ''} ${item.message ?? ''}`.trim())
            .join('; ') || 'Delivery failed';
          try {
            await recordDeliveryFailure({
              messageId: status.id,
              recipient: status.recipient_id ?? '',
              detail,
            });
          } catch (error) {
            console.error('whatsapp status processing failed:', error);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
