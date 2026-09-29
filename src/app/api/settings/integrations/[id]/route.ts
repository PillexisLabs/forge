import { NextRequest, NextResponse } from 'next/server';
import { getIntegration, saveIntegration, type IntegrationId } from '@/core/integrations';
import { getInbound } from '@/core/intake';
import { getCaseById } from '@/core/jobs';
import { requirePermission } from '@/core/permissions';
import { newToken } from '@/core/secrets';
import { pollMailbox } from '@/modules/email/email-integration';
import { runJobConsumers } from '@/modules/jobs';
import { pollSheet } from '@/modules/sheets/sheets-intake';
import { recordTestWhatsAppMessage } from '@/modules/whatsapp/whatsapp-channel';

export const runtime = 'nodejs';

const IDS: IntegrationId[] = ['whatsapp', 'sheets', 'webhook', 'email'];

function bool(value: unknown): boolean {
  return value === true || value === 'on' || value === 'true';
}

// Settings → Integrations. One POST per action: save, sync, test, token.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const id = params.id as IntegrationId;
  if (!IDS.includes(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const actor = auth.user.name;
  const current = await getIntegration(id);

  try {
    if (body.action === 'save') {
      if (id === 'whatsapp') {
        await saveIntegration(id, { enabled: bool(body.enabled), config: { ...current.config, testMode: bool(body.testMode) }, status: bool(body.enabled) ? 'connected' : 'not_connected', lastError: null }, actor);
      } else if (id === 'sheets') {
        const url = String(body.url ?? '').trim();
        if (bool(body.enabled) && !/^https:\/\//.test(url)) throw new Error('Paste the full https:// link to the sheet.');
        const changed = url !== current.config.url;
        await saveIntegration(id, {
          enabled: bool(body.enabled),
          config: { url, importExisting: bool(body.importExisting) },
          cursor: changed ? {} : current.cursor,
          status: bool(body.enabled) ? current.status : 'not_connected',
        }, actor);
        if (bool(body.enabled)) {
          const result = await pollSheet({ force: true });
          await runJobConsumers();
          if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
          return NextResponse.json({ ok: true, message: `Connected. Forge read ${result.seen} rows and created ${result.created} enquiries.` });
        }
      } else if (id === 'webhook') {
        await saveIntegration(id, { enabled: bool(body.enabled), status: bool(body.enabled) && current.secret ? 'connected' : 'not_connected' }, actor);
      } else if (id === 'email') {
        const config = {
          address: String(body.address ?? '').trim(),
          imapHost: String(body.imapHost ?? '').trim(),
          imapPort: Number(body.imapPort ?? 993) || 993,
          smtpHost: String(body.smtpHost ?? '').trim(),
          smtpPort: Number(body.smtpPort ?? 465) || 465,
          testMode: bool(body.testMode),
        };
        if (bool(body.enabled) && !config.address.includes('@')) throw new Error('Enter the mailbox address.');
        const password = typeof body.password === 'string' && body.password ? body.password : undefined;
        await saveIntegration(id, {
          enabled: bool(body.enabled), config, ...(password ? { secret: password } : {}),
          cursor: config.address !== current.config.address ? {} : current.cursor,
          status: bool(body.enabled) ? current.status : 'not_connected',
        }, actor);
        if (bool(body.enabled) && !config.testMode) {
          const result = await pollMailbox({ force: true });
          if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
          return NextResponse.json({ ok: true, message: 'Connected. New emails to this address now become enquiries.' });
        }
      }
      return NextResponse.json({ ok: true, message: 'Saved.' });
    }

    if (body.action === 'sync') {
      const result = id === 'sheets' ? await pollSheet({ force: true }) : id === 'email' ? await pollMailbox({ force: true }) : null;
      if (!result) return NextResponse.json({ error: 'This integration has nothing to read.' }, { status: 400 });
      await runJobConsumers();
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, message: `Read now. ${result.created} new ${result.created === 1 ? 'enquiry' : 'enquiries'}.` });
    }

    if (body.action === 'token' && id === 'webhook') {
      const token = newToken();
      await saveIntegration(id, { enabled: true, secret: token, status: 'connected' }, actor);
      return NextResponse.json({ ok: true, token, message: 'New token made. Copy it now; Forge shows it only once.' });
    }

    if (body.action === 'test' && id === 'whatsapp') {
      if (!current.enabled) throw new Error('Switch WhatsApp on first.');
      const name = String(body.name ?? '').trim() || 'Test buyer';
      const phone = String(body.phone ?? '').trim();
      const text = String(body.text ?? '').trim();
      if (!/\d{10}/.test(phone.replace(/\D/g, ''))) throw new Error('Enter a 10-digit phone number.');
      if (!text) throw new Error('Type the message the buyer sends.');
      const inbound = await recordTestWhatsAppMessage({ name, phone, text });
      await runJobConsumers();
      const linked = inbound ? await getInbound(inbound.id) : null;
      const found = linked?.case_id ? await getCaseById(linked.case_id) : null;
      return NextResponse.json({ ok: true, ref: found?.ref ?? null, message: found ? `Received. It went to ${found.ref}.` : 'Received.' });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'That did not work.' }, { status: 400 });
  }
}
