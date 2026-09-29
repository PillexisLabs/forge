import type { ChannelSender } from '@/core/channels';
import { env } from '@/core/env';
import { getIntegration } from '@/core/integrations';
import { recordInbound } from '@/core/intake';
import { toWaId } from './whatsapp-provider';

// WhatsApp as a job channel (src/core/channels.ts) and as an intake source.
// Settings → Integrations → WhatsApp switches both on. Test mode is set by
// the server, not by a person: on a local computer, without a number, or
// with WHATSAPP_DRY_RUN=1, Forge logs each message instead of sending it.
// A deployed server with a number sends for real.

/** Why this server is in test mode, or null when it sends for real. */
export function whatsappTestReason(): string | null {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return 'This server has no WhatsApp number set.';
  if (env.whatsappDryRun()) return 'WHATSAPP_DRY_RUN is on for this server.';
  if (process.env.NODE_ENV !== 'production') return 'Forge is running on a local computer.';
  return null;
}

async function settings() {
  const row = await getIntegration('whatsapp');
  const reason = whatsappTestReason();
  return { enabled: row.enabled, testMode: reason !== null, reason, hasCredentials: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) };
}

async function graph(path: string, init: RequestInit) {
  const response = await fetch(`https://graph.facebook.com/${env.whatsappGraphVersion()}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.whatsappToken()}`, ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `WhatsApp API HTTP ${response.status}`);
  return body;
}

export const whatsappChannel: ChannelSender = {
  id: 'whatsapp',
  async ready() {
    return (await settings()).enabled;
  },
  async mode() {
    const reason = whatsappTestReason();
    return { test: reason !== null, reason: reason ? `WhatsApp is in test mode. ${reason} Forge records messages but does not deliver them.` : null };
  },
  async send({ to, text, attachment }) {
    const mode = await settings();
    if (!mode.enabled) return { ok: false, error: 'WhatsApp is switched off in Settings → Integrations.' };
    if (mode.testMode) {
      console.log(`[whatsapp test mode] to=${to}${attachment ? ` attachment=${attachment.filename}` : ''}\n${text}`);
      return { ok: true, providerId: 'test-mode', test: true };
    }
    const phoneId = env.whatsappPhoneNumberId();
    try {
      if (attachment) {
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', attachment.mime);
        form.append('file', new Blob([new Uint8Array(attachment.bytes)], { type: attachment.mime }), attachment.filename);
        const media = await graph(`${phoneId}/media`, { method: 'POST', body: form });
        const sent = await graph(`${phoneId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toWaId(to),
            type: 'document',
            document: { id: media.id, filename: attachment.filename, caption: text.slice(0, 1024) },
          }),
        });
        return { ok: true, providerId: sent?.messages?.[0]?.id ?? 'unknown', test: false };
      }
      const sent = await graph(`${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: toWaId(to), type: 'text', text: { preview_url: false, body: text } }),
      });
      return { ok: true, providerId: sent?.messages?.[0]?.id ?? 'unknown', test: false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

/**
 * Called by the webhook for each inbound message. Only an instance that
 * switched WhatsApp intake on records it, so Pillexis's own CRM replies do
 * not become sales enquiries.
 */
export async function ingestWhatsAppMessage(input: { from: string; messageId: string; text: string; profileName?: string }) {
  const row = await getIntegration('whatsapp');
  if (!row.enabled) return null;
  return recordInbound({
    source: 'whatsapp',
    externalId: input.messageId,
    fromName: input.profileName ?? null,
    fromPhone: input.from,
    body: input.text,
  });
}

/** Settings → Integrations → WhatsApp → "Send a test message": the same path as a real webhook message. */
export async function recordTestWhatsAppMessage(input: { name: string; phone: string; text: string }) {
  return recordInbound({
    source: 'whatsapp',
    externalId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromName: input.name,
    fromPhone: input.phone,
    body: input.text,
    raw: { test: true },
  });
}

export async function whatsappStatus() {
  return settings();
}
