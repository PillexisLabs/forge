import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/core/auth';
import { addCrmActivity } from '@/modules/crm/crm-data';
import { env } from '@/core/env';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authenticated = await verifyToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    env.authSecret(),
  );
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dealId = Number(params.id);
  const body = await request.json();
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (!Number.isInteger(dealId) || dealId < 1 || !subject) {
    return NextResponse.json({ error: 'A valid deal and subject are required' }, { status: 400 });
  }

  await addCrmActivity({
    dealId,
    actor: typeof body.actor === 'string' ? body.actor : 'Founder',
    type: typeof body.type === 'string' ? body.type : 'note',
    direction: body.direction === 'inbound' || body.direction === 'outbound' ? body.direction : undefined,
    subject,
    body: typeof body.body === 'string' ? body.body.trim() : undefined,
  });
  return NextResponse.json({ ok: true });
}
