import { NextRequest, NextResponse } from 'next/server';
import { getCaseById } from '@/core/jobs';
import { hasPermission } from '@/core/permissions';
import { getSessionUser } from '@/core/session';
import { getSettings } from '@/core/settings';
import { instalmentsOf, type OrderCase } from '@/modules/orders/order-job';
import { renderOrderPdf } from '@/modules/orders/order-pdf';

export const runtime = 'nodejs';

// GET /api/jobs/order/cases/<id>/documents?number=<document number>: the PDF of one document Forge issued.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser(request);
  if (!user || !hasPermission(user, 'orders:read')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const order = await getCaseById(Number(params.id)) as OrderCase | null;
  if (!order || order.job !== 'order') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const number = request.nextUrl.searchParams.get('number') ?? '';
  const doc = (order.data.documents ?? []).find((d) => d.number === number);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const biz = await getSettings<{ businessName: string; businessAddress: string; businessGstin: string }>('sales', { businessName: '', businessAddress: '', businessGstin: '' });
  const instalments = instalmentsOf(order.data);
  const pdf = await renderOrderPdf({
    kind: doc.kind, number: doc.number, issuedAt: doc.at, orderRef: order.ref, data: order.data, subject: order.subject,
    business: { name: biz.businessName, address: biz.businessAddress, gstin: biz.businessGstin },
    instalments, instalment: instalments.find((i) => i.key === doc.instalment) ?? null,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${doc.number.replace(/[\\/]/g, '-')}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
