import { NextRequest, NextResponse } from 'next/server';
import { createCase, StepError, userActor } from '@/core/jobs';
import { getSessionUser } from '@/core/session';
import { casePath, jobByName, runJobConsumers } from '@/modules/jobs';

export const runtime = 'nodejs';

// Create a case by running a job's creating step:
//   POST /api/jobs/quote/cases  { step: 'recordEnquiry', input: {...} }
// The step checks the user's permission; this route only authenticates.
export async function POST(request: NextRequest, { params }: { params: { job: string } }) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const def = jobByName(params.job);
  if (!def) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.step !== 'string') {
    return NextResponse.json({ error: 'Name the step to run.' }, { status: 400 });
  }

  try {
    const created = await createCase(def, body.step, body.input, userActor(user));
    // The step has committed. A consumer failure is logged and retried on
    // the next pass; it does not fail the step the user ran.
    await runJobConsumers().catch((error) => console.error('jobs: consumer pass failed', error));
    return NextResponse.json({ ref: created.ref, path: casePath(def.job, created.ref) });
  } catch (error) {
    if (error instanceof StepError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`jobs: create ${params.job} failed`, error);
    return NextResponse.json({ error: 'The step failed. Try again.' }, { status: 500 });
  }
}
