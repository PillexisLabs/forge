import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { parsePaymentRules, savePaymentRules } from '@/modules/orders/payment-settings';
import { parseSalesRules, saveSalesRules } from '@/modules/sales/sales-settings';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    const rules = parseSalesRules(body);
    const payments = parsePaymentRules(body.payments ?? {});
    await saveSalesRules(rules, auth.user.name);
    await savePaymentRules(payments, auth.user.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The rules were not saved.' }, { status: 400 });
  }
}
