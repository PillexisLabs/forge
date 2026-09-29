import { NextRequest, NextResponse } from 'next/server';
import { sendOnChannel } from '@/core/channels';
import { checkStep, getCaseById, runStep, StepError, userActor } from '@/core/jobs';
import { replyOptionFor } from '@/core/replies';
import { getSessionUser } from '@/core/session';
import { jobByName, runJobConsumers } from '@/modules/jobs';

export const runtime = 'nodejs';

// Send a person's reply to the buyer from a case screen, then record it:
//   POST /api/jobs/quote/cases/12/reply  { text: '…', version: 5 }
// Forge sends on WhatsApp inside the 24-hour window, otherwise by email.
export async function POST(request: NextRequest, { params }: { params: { job: string; id: string } }) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const def = jobByName(params.job);
  const caseId = Number(params.id);
  if (!def || !def.steps.sendReply || !Number.isInteger(caseId) || caseId < 1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write the reply first.' }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: 'The reply is too long. Keep it under 4,000 characters.' }, { status: 400 });

  try {
    const current = await getCaseById(caseId);
    if (!current || current.job !== def.job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const actor = userActor(user);
    checkStep(def, current.state, 'sendReply', actor);
    if (Number.isInteger(body.version) && body.version !== current.version) {
      return NextResponse.json({ error: 'This record changed. Reload it and try again.' }, { status: 409 });
    }
    const subject = current.subject as { phone?: string | null; email?: string | null };
    const option = await replyOptionFor(subject);
    if (!option.ok) return NextResponse.json({ error: option.reason }, { status: 409 });

    const sent = await sendOnChannel(option.channel, { to: option.to, subject: `Re: ${current.ref} ${current.title}`, text, caseId });
    if (!sent.ok) return NextResponse.json({ error: `Not sent: ${sent.error}` }, { status: 502 });

    const updated = await runStep(def, caseId, 'sendReply', { text, via: option.channel }, actor);
    await runJobConsumers().catch((error) => console.error('jobs: consumer pass failed', error));
    return NextResponse.json({ ref: updated.ref, version: updated.version, channel: option.channel, test: sent.test });
  } catch (error) {
    if (error instanceof StepError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`jobs: reply on ${params.job} case ${caseId} failed`, error);
    return NextResponse.json({ error: 'The reply failed. Try again.' }, { status: 500 });
  }
}
