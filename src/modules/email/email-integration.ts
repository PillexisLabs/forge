import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ChannelSender } from '@/core/channels';
import { getIntegration, integrationSecret, markIntegration, saveIntegration } from '@/core/integrations';
import { recordInbound } from '@/core/intake';

// Email intake and replies for one mailbox, for example sales@ the client's
// domain. IMAP reads new mail; SMTP sends replies and quote PDFs. One app
// password serves both (Gmail and Zoho both issue them). Only mail that
// arrives after the mailbox is connected becomes an enquiry.

type EmailConfig = {
  address: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  testMode: boolean;
};

async function load() {
  const row = await getIntegration('email');
  const c = row.config as Partial<EmailConfig>;
  const config: EmailConfig = {
    address: String(c.address ?? ''),
    imapHost: String(c.imapHost ?? ''),
    imapPort: Number(c.imapPort ?? 993),
    smtpHost: String(c.smtpHost ?? ''),
    smtpPort: Number(c.smtpPort ?? 465),
    testMode: c.testMode === true,
  };
  return { row, config, password: integrationSecret(row) };
}

/** Strip quoted history from a reply, so "confirm" is not buried under the quote text. */
export function latestReplyText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex((line) => /^On .+wrote:$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || line.startsWith('>'));
  return (cut === -1 ? lines : lines.slice(0, cut)).join('\n').trim();
}

export async function pollMailbox(opts: { force?: boolean } = {}): Promise<{ ok: boolean; created: number; error?: string }> {
  const { row, config, password } = await load();
  if (!row.enabled && !opts.force) return { ok: true, created: 0 };
  if (!config.address || !config.imapHost || !password) return { ok: false, created: 0, error: 'Add the address, IMAP server and app password first.' };

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
        await saveIntegration('email', { cursor: { lastUid: uidNext - 1 } }, 'Email rule');
      } else if (uidNext - 1 > lastUid) {
        let maxUid = lastUid;
        for await (const message of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (message.uid <= lastUid) continue;
          maxUid = Math.max(maxUid, message.uid);
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const from = parsed.from?.value?.[0];
          if (!from?.address || from.address.toLowerCase() === config.address.toLowerCase()) continue;
          const body = latestReplyText(parsed.text ?? '');
          const inserted = await recordInbound({
            source: 'email',
            externalId: parsed.messageId ?? `uid-${message.uid}`,
            fromName: from.name || null,
            fromEmail: from.address,
            subject: parsed.subject ?? null,
            body: body || parsed.subject || '(empty email)',
          });
          if (inserted) created += 1;
        }
        await saveIntegration('email', { cursor: { lastUid: maxUid } }, 'Email rule');
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

export const emailChannel: ChannelSender = {
  id: 'email',
  async ready() {
    const { row, config, password } = await load();
    return row.enabled && Boolean(config.address && (config.testMode || (config.smtpHost && password)));
  },
  async send({ to, subject, text, attachment }) {
    const { config, password } = await load();
    if (config.testMode) {
      console.log(`[email test mode] to=${to} subject=${subject ?? ''}${attachment ? ` attachment=${attachment.filename}` : ''}\n${text}`);
      return { ok: true, providerId: 'test-mode', test: true };
    }
    try {
      const transport = nodemailer.createTransport({
        host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
        auth: { user: config.address, pass: password ?? '' },
      });
      const info = await transport.sendMail({
        from: config.address, to, subject: subject ?? 'Your enquiry', text,
        attachments: attachment ? [{ filename: attachment.filename, content: Buffer.from(attachment.bytes), contentType: attachment.mime }] : [],
      });
      return { ok: true, providerId: info.messageId, test: false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
