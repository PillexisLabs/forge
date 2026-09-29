import { channelMode, channelReady, type ChannelId } from './channels';
import { lastWhatsAppFrom } from './intake';

// How a person can answer a buyer from a case screen. WhatsApp allows a
// free-form message only within 24 hours of the buyer's last message;
// outside that window an approved template is needed, which Forge does
// not send yet. Email has no window.

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReplyOption =
  | { ok: true; channel: ChannelId; to: string; closesAt: string | null; testReason: string | null }
  | { ok: false; reason: string };

export async function replyOptionFor(subject: { phone?: string | null; email?: string | null }, now = new Date()): Promise<ReplyOption> {
  const { phone, email } = subject;
  let whatsappReason: string | null = null;
  if (phone) {
    if (!(await channelReady('whatsapp'))) whatsappReason = 'WhatsApp is not connected in Settings → Integrations.';
    else {
      const last = await lastWhatsAppFrom(phone);
      if (last && now.getTime() - last.getTime() < WHATSAPP_WINDOW_MS) {
        return { ok: true, channel: 'whatsapp', to: phone, closesAt: new Date(last.getTime() + WHATSAPP_WINDOW_MS).toISOString(), testReason: (await channelMode('whatsapp')).reason };
      }
      whatsappReason = last
        ? 'The buyer last wrote on WhatsApp more than 24 hours ago, so WhatsApp allows only an approved template message.'
        : 'The buyer has not written on WhatsApp, so WhatsApp allows only an approved template message.';
    }
  }
  if (email && await channelReady('email')) return { ok: true, channel: 'email', to: email, closesAt: null, testReason: (await channelMode('email')).reason };
  return { ok: false, reason: whatsappReason ?? (email ? 'Email is not connected in Settings → Integrations.' : 'This buyer has no phone number or email.') };
}
