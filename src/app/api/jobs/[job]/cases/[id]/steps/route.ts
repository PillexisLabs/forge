import { NextRequest, NextResponse } from 'next/server';
import { runStep, StepError, userActor } from '@/core/jobs';
import { getSessionUser } from '@/core/session';
import { jobByName, runJobConsumers } from '@/modules/jobs';

export const runtime = 'nodejs';

// Run one step on a case:
//   POST /api/jobs/quote/cases/12/steps  { step: 'approveQuote', input: { version: 2 }, version: 5 }
// `version` is the case version the screen showed; a stale screen gets 409.
export async function POST(
  request: NextRequest,
  { params }: { params: { job: string; id: string } },
) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const def = jobByName(params.job);
  const caseId = Number(params.id);
  if (!def || !Number.isInteger(caseId) || caseId < 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.step !== 'string') {
    return NextResponse.json({ error: 'Name the step to run.' }, { status: 400 });
  }
  const expectedVersion = Number.isInteger(body.version) ? body.version : undefined;

  try {
    const updated = await runStep(def, caseId, body.step, body.input ?? {}, userActor(user), expectedVersion);
    // The step has committed. A consumer failure is logged and retried on
    // the next pass; it does not fail the step the user ran.
    await runJobConsumers().catch((error) => console.error('jobs: consumer pass failed', error));
    return NextResponse.json({ ref: updated.ref, state: updated.state, version: updated.version });
  } catch (error) {
    if (error instanceof StepError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`jobs: step ${params.job}/${body.step} on case ${caseId} failed`, error);
    return NextResponse.json({ error: 'The step failed. Try again.' }, { status: 500 });
  }
}
