import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@/core/auth';
import { isCrmOwner, isCrmStage, updateCrmDeal } from '@/modules/crm/crm-data';
import { env } from '@/core/env';

async function isAuthenticated(request: NextRequest) {
  return verifyToken(request.cookies.get(SESSION_COOKIE)?.value, env.authSecret());
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number(params.id);
  const body = await request.json();
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid deal' }, { status: 400 });
  }
  if (body.owner !== undefined && !isCrmOwner(body.owner)) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 });
  }
  if (body.stage !== undefined && !isCrmStage(body.stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }

  try {
    await updateCrmDeal({
      id,
      owner: body.owner,
      stage: body.stage,
      nextAction: body.nextAction === undefined ? undefined : String(body.nextAction).trim() || null,
      nextActionDueAt: body.nextActionDueAt === undefined ? undefined : String(body.nextActionDueAt).trim() || null,
      primaryPhone: body.primaryPhone === undefined ? undefined : String(body.primaryPhone).trim() || null,
      actor: typeof body.actor === 'string' ? body.actor : 'Founder',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === 'deal_not_found' ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? 'Deal not found' : 'Update failed' }, { status });
  }
}
