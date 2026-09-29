import { NextRequest, NextResponse } from 'next/server';
import { getCaseById } from '@/core/jobs';
import { hasPermission } from '@/core/permissions';
import { getSessionUser } from '@/core/session';
import { quotePdfFor } from '@/modules/sales/quote-automation';
import type { QuoteCase } from '@/modules/sales/quote-job';

export const runtime = 'nodejs';

// The same PDF Forge attaches on WhatsApp and email.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(request);
  if (!user || !hasPermission(user, 'sales:read')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const found = await getCaseById(Number(params.id)) as QuoteCase | null;
  if (!found || found.job !== 'quote') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pdf = await quotePdfFor(found);
  if (!pdf) return NextResponse.json({ error: 'This case has no quote yet.' }, { status: 404 });
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${found.ref}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
