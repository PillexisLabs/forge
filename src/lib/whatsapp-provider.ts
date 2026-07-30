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

export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  if (env.whatsappDryRun()) {
    console.log(`[whatsapp dry-run] to=${to}\n${body}`);
    return { ok: true, messageId: 'dry-run', dryRun: true };
  }

  const url = `https://graph.facebook.com/${env.whatsappGraphVersion()}/${env.whatsappPhoneNumberId()}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsappToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toWaId(to),
      type: 'text',
      text: { preview_url: false, body },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: detail };
  }
  const messageId = payload?.messages?.[0]?.id ?? 'unknown';
  return { ok: true, messageId, dryRun: false };
}
