import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/core/session';
import { addCrmActivity } from '@/modules/crm/crm-data';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser(request);
  if (!user) {
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
    actor: user.name,
    type: typeof body.type === 'string' ? body.type : 'note',
    direction: body.direction === 'inbound' || body.direction === 'outbound' ? body.direction : undefined,
    subject,
    body: typeof body.body === 'string' ? body.body.trim() : undefined,
  });
  return NextResponse.json({ ok: true });
}
