import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/core/permissions';
import { updateCustomer } from '@/modules/crm/crm-customers';

export const runtime = 'nodejs';

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Edit a customer: PATCH /api/crm/customers/12 { name, company, phone, email, gstin, pincode }
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission(request, 'crm:write');
  if (!auth.ok) return auth.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const input = {
    name: text(body.name, 120),
    company: text(body.company, 160),
    phone: text(body.phone, 20),
    email: text(body.email, 160),
    gstin: text(body.gstin, 15)?.toUpperCase() ?? null,
    pincode: text(body.pincode, 6),
  };
  if (!input.name) return NextResponse.json({ error: 'Enter the customer name.' }, { status: 400 });
  if (input.phone && input.phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Enter the phone with its country code, for example +91 98450 12345.' }, { status: 400 });
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (input.gstin && !/^\d{2}[A-Z0-9]{13}$/.test(input.gstin)) return NextResponse.json({ error: 'A GSTIN has 15 characters and starts with the 2-digit state code.' }, { status: 400 });
  if (input.pincode && !/^\d{6}$/.test(input.pincode)) return NextResponse.json({ error: 'The pincode must be 6 digits.' }, { status: 400 });
  try {
    await updateCustomer(id, { ...input, name: input.name });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The change failed.' }, { status: 400 });
  }
}
