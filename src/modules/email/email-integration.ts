import { randomBytes } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelSender } from '@/core/channels';
import { env } from '@/core/env';
import { getIntegration, integrationSecret, markIntegration, saveIntegration } from '@/core/integrations';
import { recordInbound } from '@/core/intake';
import { getSettings } from '@/core/settings';

// Email for one sales mailbox, in one of two modes:
//
//   forward  (recommended, any provider, no password): the client forwards
//            their sales@ to a Forge intake address. The inbound mail service
//            posts each email to /api/intake/email. Replies go out through
//            the Forge relay as "Business via Forge", Reply-To the client's
//            own address, with a copy to that address.
//   password (advanced): IMAP reads the mailbox and SMTP sends from it, with
//            the mailbox or app password. Works where the provider allows it.
//
// Only mail that arrives after connecting becomes an enquiry.

export type EmailMode = 'forward' | 'password';

export type EmailConfig = {
  mode: EmailMode;
  address: string;
  provider: string;
  forwardAddress: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  testMode: boolean;
};

export async function loadEmail() {
  const row = await getIntegration('email');
  const c = row.config as Partial<EmailConfig>;
  const config: EmailConfig = {
    mode: c.mode === 'password' || (!c.mode && c.imapHost) ? 'password' : 'forward',
    address: String(c.address ?? ''),
    provider: String(c.provider ?? ''),
    forwardAddress: String(c.forwardAddress ?? ''),
    imapHost: String(c.imapHost ?? ''),
    imapPort: Number(c.imapPort ?? 993),
    smtpHost: String(c.smtpHost ?? ''),
    smtpPort: Number(c.smtpPort ?? 465),
    testMode: c.testMode === true,
  };
  return { row, config, password: integrationSecret(row) };
}

/** The Forge intake address for this instance. Made once, then kept. */
export function makeForwardAddress(businessName: string): string {
  const domain = env.emailInboundDomain() || 'in.forge.local';
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'sales';
  return `${slug}-${randomBytes(3).toString('hex')}@${domain}`;
}

export function inboundConfigured(): boolean {
  return Boolean(env.emailInboundDomain() && env.emailInboundKey());
}

export function relayConfigured(): boolean {
  return Boolean(env.emailRelayHost() && env.emailRelayFrom());
}

/** Strip quoted history from a reply, so "confirm" is not buried under the quote text. */
export function latestReplyText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex((line) => /^On .+wrote:$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || line.startsWith('>'));
  return (cut === -1 ? lines : lines.slice(0, cut)).join('\n').trim();
}

// ---------- inbound: forwarded mail ----------

export type ParsedEmail = {
  messageId: string;
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  autoSubmitted: boolean;
};

/** Normalise a Postmark inbound JSON payload. Pure, for tests. */
export function fromPostmark(p: Record<string, unknown>): ParsedEmail {
  const headers = Array.isArray(p.Headers) ? p.Headers as { Name: string; Value: string }[] : [];
  const header = (name: string) => headers.find((h) => h.Name.toLowerCase() === name)?.Value ?? '';
  const full = (p.FromFull ?? {}) as { Email?: string; Name?: string };
  const toFull = Array.isArray(p.ToFull) ? (p.ToFull as { Email: string }[]).map((t) => t.Email) : [];
  return {
    messageId: String(p.MessageID ?? header('message-id') ?? ''),
    from: String(full.Email ?? p.From ?? '').toLowerCase(),
    fromName: (full.Name || p.FromName || null) as string | null,
    to: [...toFull, String(p.OriginalRecipient ?? ''), String(p.To ?? '')].join(',').toLowerCase().split(/[,\s<>]+/).filter((x) => x.includes('@')),
    subject: String(p.Subject ?? ''),
    text: String(p.StrippedTextReply || p.TextBody || ''),
    autoSubmitted: /auto-(replied|generated)/i.test(header('auto-submitted')),
  };
}

/** Normalise a raw MIME message (for example from a Cloudflare Email Worker). */
export async function fromRawMime(raw: string | Buffer): Promise<ParsedEmail> {
  const mail = await simpleParser(raw);
  const from = mail.from?.value?.[0];
  const lists = [mail.to, mail.cc].flat().filter(Boolean) as { value: { address?: string }[] }[];
  const to = lists.flatMap((a) => a.value.map((v) => v.address ?? ''));
  const deliveredTo = String(mail.headers.get('delivered-to') ?? mail.headers.get('x-original-to') ?? '');
  return {
    messageId: mail.messageId ?? '',
    from: (from?.address ?? '').toLowerCase(),
    fromName: from?.name || null,
    to: [...to, deliveredTo].map((a) => a.toLowerCase()).filter(Boolean),
    subject: mail.subject ?? '',
    text: mail.text ?? '',
    autoSubmitted: /auto-(replied|generated)/i.test(String(mail.headers.get('auto-submitted') ?? '')),
  };
}

/**
 * A mail the salesperson forwarded by hand shows the salesperson as sender.
 * Read the original sender from the forwarded header block. Pure, for tests.
 */
export function unwrapManualForward(email: ParsedEmail, salesAddress: string): ParsedEmail {
  if (!salesAddress || email.from !== salesAddress.toLowerCase()) return email;
  const block = email.text.match(/-{5,}\s*Forwarded message\s*-{5,}[\s\S]*?From:\s*(?:"?([^"<\n]*)"?\s*)?<?([^\s<>@]+@[^\s<>]+)>?[\s\S]*?\n\n([\s\S]*)/i);
  if (!block) return email;
  return { ...email, from: block[2].toLowerCase(), fromName: block[1]?.trim() || null, text: block[3].trim() };
}

export type InboundOutcome = 'enquiry' | 'duplicate' | 'verification' | 'ignored';

/** Handle one forwarded email: a provider verification, a buyer email, or noise. */
export async function ingestForwardedEmail(parsed: ParsedEmail): Promise<InboundOutcome> {
  const { row, config } = await loadEmail();
  if (!config.forwardAddress) return 'ignored';
  const mine = config.forwardAddress.toLowerCase();
  // Mail to other addresses on the shared inbound domain is not for this instance.
  if (parsed.to.length && !parsed.to.includes(mine)) return 'ignored';

  // Gmail and Zoho confirm a new forwarding address with a message. Keep it
  // so the setup screen can show the code; never make it an enquiry.
  const isGmailCheck = parsed.from === 'forwarding-noreply@google.com';
  const isZohoCheck = /zoho/.test(parsed.from) && /(verif|confirm)/i.test(parsed.subject);
  if (isGmailCheck || isZohoCheck) {
    const code = parsed.subject.match(/#(\d{6,12})/)?.[1] ?? parsed.text.match(/Confirmation code:\s*(\d{6,12})/i)?.[1] ?? null;
    const link = parsed.text.match(/https:\/\/\S+(?:mail-settings|verif|confirm)\S*/i)?.[0] ?? null;
    await saveIntegration('email', { cursor: { ...row.cursor, verification: { provider: isGmailCheck ? 'Gmail' : 'Zoho', code, link, at: new Date().toISOString() } } }, 'Email rule');
    return 'verification';
  }

  if (parsed.autoSubmitted) return 'ignored';
  const relayFrom = env.emailRelayFrom().toLowerCase();
  if (relayFrom && parsed.from === relayFrom) return 'ignored';

  const email = unwrapManualForward(parsed, config.address);
  const body = latestReplyText(email.text) || email.subject;
  if (!email.from || !body) return 'ignored';
  const record = await recordInbound({
    source: 'email',
    externalId: email.messageId || `fw-${Date.now()}-${randomBytes(3).toString('hex')}`,
    fromName: email.fromName,
    fromEmail: email.from,
    subject: email.subject,
    body,
  });
  await saveIntegration('email', { cursor: { ...row.cursor, lastReceived: { from: email.from, subject: email.subject, at: new Date().toISOString() } }, status: 'connected', lastError: null }, 'Email rule');
  return record ? 'enquiry' : 'duplicate';
}

// ---------- password mode: IMAP polling ----------

export async function pollMailbox(opts: { force?: boolean } = {}): Promise<{ ok: boolean; created: number; error?: string }> {
  const { row, config, password } = await loadEmail();
  if (config.mode !== 'password') return { ok: true, created: 0 };
  if (!row.enabled && !opts.force) return { ok: true, created: 0 };
  if (!config.address || !config.imapHost || !password) return { ok: false, created: 0, error: 'Add the address, the servers and the password first.' };

  const client = new ImapFlow({
    host: config.imapHost, port: config.imapPort, secure: config.imapPort === 993,
    auth: { user: config.address, pass: password }, logger: false,
  });
  let created = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
      const uidNext = mailbox?.uidNext ?? 1;
      const lastUid = typeof row.cursor.lastUid === 'number' ? row.cursor.lastUid : null;
      if (lastUid === null) {
        // First connection: start from now, never import the old mailbox.
        await saveIntegration('email', { cursor: { ...row.cursor, lastUid: uidNext - 1 } }, 'Email rule');
      } else if (uidNext - 1 > lastUid) {
        let maxUid = lastUid;
        for await (const message of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (message.uid <= lastUid) continue;
          maxUid = Math.max(maxUid, message.uid);
          if (!message.source) continue;
          const parsed = await fromRawMime(message.source);
          if (!parsed.from || parsed.from === config.address.toLowerCase() || parsed.autoSubmitted) continue;
          const inserted = await recordInbound({
            source: 'email',
            externalId: parsed.messageId || `uid-${message.uid}`,
            fromName: parsed.fromName,
            fromEmail: parsed.from,
            subject: parsed.subject,
            body: latestReplyText(parsed.text) || parsed.subject || '(empty email)',
          });
          if (inserted) created += 1;
        }
        await saveIntegration('email', { cursor: { ...row.cursor, lastUid: maxUid } }, 'Email rule');
      }
    } finally {
      lock.release();
    }
    await client.logout();
    await markIntegration('email', { ok: true });
    return { ok: true, created };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markIntegration('email', { ok: false, error: message });
    try { await client.logout(); } catch { /* already closed */ }
    return { ok: false, created, error: message };
  }
}

/** Password mode: prove reading and sending both work, in plain words. */
export async function testPasswordConnection(input: {
  address: string; password: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number;
}): Promise<{ ok: true } | { ok: false; step: 'reading' | 'sending'; error: string }> {
  const client = new ImapFlow({
    host: input.imapHost, port: input.imapPort, secure: input.imapPort === 993,
    auth: { user: input.address, pass: input.password }, logger: false, emitLogs: false,
  });
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const hint = /auth|login|credential|password|invalid/i.test(raw)
      ? 'The address or password is wrong, or this provider needs an app password.'
      : /ENOTFOUND|getaddrinfo/i.test(raw) ? `The server ${input.imapHost} does not exist. Check the server name.`
        : /ETIMEDOUT|ECONNREFUSED|timeout/i.test(raw) ? 'The server did not answer. Check the server name and port.'
          : raw;
    return { ok: false, step: 'reading', error: hint };
  }
  try {
    const transport = nodemailer.createTransport({
      host: input.smtpHost, port: input.smtpPort, secure: input.smtpPort === 465,
      auth: { user: input.address, pass: input.password },
    });
    await transport.verify();
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, step: 'sending', error: /auth|535|credential/i.test(raw) ? 'Reading works, but sending was refused. The provider may need an app password for sending.' : raw };
  }
  return { ok: true };
}

// ---------- outbound ----------

export const emailChannel: ChannelSender = {
  id: 'email',
  async ready() {
    const { row, config, password } = await loadEmail();
    if (!row.enabled || !config.address) return false;
    return config.mode === 'forward' ? true : Boolean(config.testMode || (config.smtpHost && password));
  },
  async send({ to, subject, text, attachment }) {
    const { config, password } = await loadEmail();
    const sales = await getSettings<{ businessName: string }>('sales', { businessName: '' }).catch(() => ({ businessName: '' }));
    const business = sales.businessName || config.address;
    // Forward mode without a relay (for example on a laptop) records the reply instead.
    const test = config.testMode || (config.mode === 'forward' && !relayConfigured());
    if (test) {
      console.log(`[email test mode] to=${to} subject=${subject ?? ''}${attachment ? ` attachment=${attachment.filename}` : ''}\n${text}`);
      return { ok: true, providerId: 'test-mode', test: true };
    }
    try {
      const attachments = attachment ? [{ filename: attachment.filename, content: Buffer.from(attachment.bytes), contentType: attachment.mime }] : [];
      if (config.mode === 'forward') {
        const transport = nodemailer.createTransport({
          host: env.emailRelayHost(), port: env.emailRelayPort(), secure: env.emailRelayPort() === 465,
          auth: env.emailRelayUser() ? { user: env.emailRelayUser(), pass: env.emailRelayPassword() } : undefined,
        });
        const info = await transport.sendMail({
          from: { name: `${business} via Forge`, address: env.emailRelayFrom() },
          replyTo: config.address,
          bcc: config.address,
          to, subject: subject ?? 'Your enquiry', text, attachments,
          headers: { 'X-Forge': 'reply' },
        });
        return { ok: true, providerId: info.messageId, test: false };
      }
      const transport = nodemailer.createTransport({
        host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
        auth: { user: config.address, pass: password ?? '' },
      });
      const info = await transport.sendMail({ from: config.address, to, subject: subject ?? 'Your enquiry', text, attachments, headers: { 'X-Forge': 'reply' } });
      return { ok: true, providerId: info.messageId, test: false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
