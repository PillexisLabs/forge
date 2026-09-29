import { getSql } from '@/core/db';

export type Supplier = { id: number; name: string; email: string | null; phone: string | null; skus: string[]; lead_days: number; active: boolean };

export async function listSuppliers(): Promise<Supplier[]> {
  const sql = getSql();
  return sql<Supplier[]>`select id, name, email, phone, skus, lead_days, active from pur_suppliers where active order by name`;
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const sql = getSql();
  const rows = await sql<Supplier[]>`select id, name, email, phone, skus, lead_days, active from pur_suppliers where id = ${id}`;
  return rows[0] ?? null;
}

export function parseSupplier(raw: Record<string, unknown>) {
  const name = String(raw.name ?? '').trim();
  if (!name) throw new Error('Enter the supplier name.');
  const email = String(raw.email ?? '').trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Check the supplier email address.');
  const skus = (Array.isArray(raw.skus) ? raw.skus : String(raw.skus ?? '').split(/[,\s]+/)).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const lead = Number(raw.leadDays ?? raw.lead_days ?? 7);
  if (!Number.isInteger(lead) || lead < 0 || lead > 180) throw new Error('Lead time must be 0 to 180 days.');
  return { name, email, phone: String(raw.phone ?? '').trim() || null, skus, leadDays: lead };
}

export async function saveSupplier(id: number | null, s: ReturnType<typeof parseSupplier>) {
  const sql = getSql();
  if (id) {
    await sql`update pur_suppliers set name = ${s.name}, email = ${s.email}, phone = ${s.phone}, skus = ${s.skus}, lead_days = ${s.leadDays}, updated_at = now() where id = ${id}`;
    return id;
  }
  const [row] = await sql<{ id: number }[]>`insert into pur_suppliers (name, email, phone, skus, lead_days) values (${s.name}, ${s.email}, ${s.phone}, ${s.skus}, ${s.leadDays}) returning id`;
  return Number(row.id);
}

export async function archiveSupplier(id: number) {
  const sql = getSql();
  await sql`update pur_suppliers set active = false, updated_at = now() where id = ${id}`;
}

/** The first supplier that supplies each SKU. */
export function supplierFor(sku: string, suppliers: Supplier[]): Supplier | null {
  return suppliers.find((s) => s.skus.includes(sku)) ?? null;
}
