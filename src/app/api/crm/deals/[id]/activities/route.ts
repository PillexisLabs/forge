import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { addCrmActivity } from '@/modules/crm/crm-data';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requirePermission(request, 'crm:write');
  if (!auth.ok) return auth.response;
  const { user } = auth;

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
