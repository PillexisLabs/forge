import { getSql } from './db';

// Outbound channels. The WhatsApp and email modules register a sender; a job
// sends through `sendOnChannel` without importing either module. Every send
// is logged in outbound_messages with the provider's answer.

export type ChannelId = 'whatsapp' | 'email';

export type OutboundAttachment = { filename: string; mime: string; bytes: Uint8Array };

export type ChannelSender = {
  id: ChannelId;
  /** False when the integration is not set up; the caller then leaves the step to a person. */
  ready(): Promise<boolean>;
  /** Test mode: Forge records each message but does not deliver it. `reason` says why, for the screens. */
  mode?(): Promise<{ test: boolean; reason: string | null }>;
  send(input: { to: string; subject?: string; text: string; attachment?: OutboundAttachment }): Promise<
    { ok: true; providerId: string; test: boolean } | { ok: false; error: string }
  >;
};

const senders = new Map<ChannelId, ChannelSender>();

export function registerChannel(sender: ChannelSender) {
  senders.set(sender.id, sender);
}

export async function channelReady(id: ChannelId): Promise<boolean> {
  const sender = senders.get(id);
  return sender ? sender.ready() : false;
}

/** Whether a channel delivers for real now. Screens show the reason before a person sends. */
export async function channelMode(id: ChannelId): Promise<{ test: boolean; reason: string | null }> {
  const sender = senders.get(id);
  if (!sender?.mode) return { test: false, reason: null };
  return sender.mode();
}

export async function sendOnChannel(
  id: ChannelId,
  input: { to: string; subject?: string; text: string; attachment?: OutboundAttachment; caseId?: number },
): Promise<{ ok: true; test: boolean } | { ok: false; error: string }> {
  const sender = senders.get(id);
  const sql = getSql();
  const result = sender
    ? await sender.send(input).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }))
    : { ok: false as const, error: `The ${id} channel is not set up.` };
  await sql`
    insert into outbound_messages (channel, recipient, body, attachment, case_id, status, provider_id, error)
    values (${id}, ${input.to}, ${input.text}, ${input.attachment?.filename ?? null}, ${input.caseId ?? null},
            ${result.ok ? (result.test ? 'test' : 'sent') : 'failed'}, ${result.ok ? result.providerId : null}, ${result.ok ? null : result.error})
  `;
  return result.ok ? { ok: true, test: result.test } : result;
}
