import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { parseOrderRules, saveOrderRules } from '@/modules/orders/order-settings';
import { parsePaymentRules, savePaymentRules } from '@/modules/orders/payment-settings';

export const runtime = 'nodejs';

// Settings → Orders & payments: POST { orders: {...}, payments: {...} }.
// New orders use the new rules; an existing order keeps the terms it started with.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'core:config');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  try {
    const orders = parseOrderRules(body.orders ?? {});
    const payments = parsePaymentRules(body.payments ?? {});
    await saveOrderRules(orders, auth.user.name);
    await savePaymentRules(payments, auth.user.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The settings were not saved.' }, { status: 400 });
  }
}
