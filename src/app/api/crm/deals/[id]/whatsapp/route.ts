import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/core/auth';
import {
  configureCrmWhatsApp,
  isWhatsAppConsentStatus,
  markWhatsAppDueNow,
  transitionCrmWhatsApp,
} from '@/modules/whatsapp/crm-whatsapp-data';
import { processDueRows } from '@/modules/whatsapp/whatsapp-worker-core';

export const runtime = 'nodejs';
import type { WhatsAppWorkflowAction } from '@/modules/whatsapp/crm-whatsapp-rules';
import { updateCrmDeal } from '@/modules/crm/crm-data';
import { env } from '@/core/env';

const ACTIONS: WhatsAppWorkflowAction[] = [
  'start',
  'confirm',
  'reschedule',
  'handoff',
  'opt_out',
  'attended',
  'no_show',
  'pause',
];

async function isAuthenticated(request: NextRequest) {
  return verifyToken(request.cookies.get(SESSION_COOKIE)?.value, env.authSecret());
}

function validDealId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function workflowError(error: unknown) {
  const code = error instanceof Error ? error.message : 'update_failed';
  const errors: Record<string, { status: number; message: string }> = {
    deal_not_found: { status: 404, message: 'Deal not found' },
    workflow_not_configured: { status: 400, message: 'Configure the workflow first' },
    phone_required: { status: 400, message: 'Add a WhatsApp phone number first' },
    consent_required: { status: 400, message: 'Record consent before starting automation' },
    appointment_required: { status: 400, message: 'Add the call date and time first' },
    opted_out_locked: { status: 409, message: 'This lead opted out. Automation cannot be re-enabled.' },
  };
  return errors[code] ?? { status: 500, message: 'WhatsApp workflow update failed' };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dealId = validDealId(params.id);
  const body = await request.json().catch(() => null);
  if (!dealId || !body || !isWhatsAppConsentStatus(body.consentStatus)) {
    return NextResponse.json({ error: 'A valid deal and consent status are required' }, { status: 400 });
  }

  const appointmentDate = body.appointmentAt ? new Date(String(body.appointmentAt)) : null;
  if (appointmentDate && Number.isNaN(appointmentDate.getTime())) {
    return NextResponse.json({ error: 'Enter a valid call date and time' }, { status: 400 });
  }
  const appointmentAt = appointmentDate?.toISOString() ?? null;
  // An absent field means "leave the stored phone alone" — never wipe it.
  const primaryPhone = body.primaryPhone === undefined
    ? undefined
    : typeof body.primaryPhone === 'string'
      ? body.primaryPhone.trim() || null
      : null;
  const actor = typeof body.actor === 'string' ? body.actor : 'Founder';

  try {
    await updateCrmDeal({ id: dealId, primaryPhone, actor });
    await configureCrmWhatsApp({
      dealId,
      consentStatus: body.consentStatus,
      appointmentAt,
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = workflowError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dealId = validDealId(params.id);
  const body = await request.json().catch(() => null);
  if (!dealId || !body) {
    return NextResponse.json({ error: 'A valid workflow action is required' }, { status: 400 });
  }

  // Demo/testing helper: pull the queued message forward and send immediately
  // instead of waiting for the worker's next minute tick.
  if (body.action === 'send_now') {
    const queued = await markWhatsAppDueNow(dealId);
    if (!queued) {
      return NextResponse.json({ error: 'Nothing is queued for this lead' }, { status: 400 });
    }
    const sent = await processDueRows();
    return NextResponse.json({ ok: true, sent });
  }

  if (!ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: 'A valid workflow action is required' }, { status: 400 });
  }

  try {
    await transitionCrmWhatsApp({
      dealId,
      action: body.action,
      actor: typeof body.actor === 'string' ? body.actor : 'Founder',
      handoffReason: typeof body.handoffReason === 'string' ? body.handoffReason : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resolved = workflowError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
