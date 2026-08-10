import { env } from './env';

// Thin client for the WhatsApp Cloud API. Free-form text sends work with the
// Meta test number to registered recipients; production numbers need approved
// templates for business-initiated messages (that swap happens at cutover).

export type WhatsAppSendResult =
  | { ok: true; messageId: string; dryRun: false }
  | { ok: true; messageId: 'dry-run'; dryRun: true }
  | { ok: false; error: string };

// The Cloud API wants E.164 digits without '+', spaces, or dashes.
export function toWaId(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

async function postMessage(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/${env.whatsappGraphVersion()}/${env.whatsappPhoneNumberId()}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: detail };
  }
  const messageId = body?.messages?.[0]?.id ?? 'unknown';
  return { ok: true, messageId, dryRun: false };
}

export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  if (env.whatsappDryRun()) {
    console.log(`[whatsapp dry-run] to=${to}\n${body}`);
    return { ok: true, messageId: 'dry-run', dryRun: true };
  }
  return postMessage({
    messaging_product: 'whatsapp',
    to: toWaId(to),
    type: 'text',
    text: { preview_url: false, body },
  });
}

// Business-initiated messages outside the 24-hour customer window only
// deliver as approved templates; free-form text fails with error 131047.
export async function sendWhatsAppTemplate(
  to: string,
  name: string,
  params: string[],
): Promise<WhatsAppSendResult> {
  if (env.whatsappDryRun()) {
    console.log(`[whatsapp dry-run] to=${to} template=${name} params=${JSON.stringify(params)}`);
    return { ok: true, messageId: 'dry-run', dryRun: true };
  }
  return postMessage({
    messaging_product: 'whatsapp',
    to: toWaId(to),
    type: 'template',
    template: {
      name,
      language: { code: 'en' },
      components: params.length
        ? [{
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text })),
          }]
        : [],
    },
  });
}
