import type { TransactionSql } from 'postgres';
import type { CustomerDirectory, CustomerFacts, CustomerRecord } from '@/core/customers';
import { getSql } from '@/core/db';
import { consumeEvents } from '@/core/events';

// Customers: every buyer on a quote or order has one CRM contact (and a
// company when they gave one). The job engine emits customer.updated when a
// case's buyer details change; this consumer finds the contact by phone,
// then email, and writes the newest details. Details the buyer did not give
// again (an email, a GSTIN) stay as they were. The name on file changes only
// when a person edits it in the CRM.

type ContactRow = { id: number; company_id: number | null; primary_email: string | null };

const digits = (phone: string | null) => (phone ?? '').replace(/\D/g, '') || null;

async function findContact(tx: TransactionSql, facts: CustomerFacts): Promise<ContactRow | null> {
  const phone = digits(facts.phone);
  if (phone) {
    const [row] = await tx<ContactRow[]>`
      select id, company_id, primary_email from crm_contacts
      where regexp_replace(primary_phone, '\\D', '', 'g') = ${phone}
      order by last_case_at desc nulls last, id limit 1
    `;
    if (row) return row;
  }
  if (facts.email) {
    const [row] = await tx<ContactRow[]>`select id, company_id, primary_email from crm_contacts where lower(primary_email) = lower(${facts.email}) limit 1`;
    if (row) return row;
  }
  return null;
}

async function companyFor(tx: TransactionSql, facts: CustomerFacts, current: number | null): Promise<number | null> {
  if (!facts.company && !facts.gstin) return current;
  let id: number | null = null;
  if (facts.gstin) {
    const [row] = await tx<{ id: number }[]>`select id from crm_companies where upper(gst_number) = upper(${facts.gstin}) limit 1`;
    id = row?.id ?? null;
  }
  if (!id && facts.company) {
    const [row] = await tx<{ id: number }[]>`select id from crm_companies where lower(display_name) = lower(${facts.company}) order by id limit 1`;
    id = row?.id ?? null;
  }
  if (!id && !facts.company) id = current;
  if (!id) {
    const [row] = await tx<{ id: number }[]>`insert into crm_companies (display_name) values (${facts.company!}) returning id`;
    id = row.id;
  }
  if (facts.gstin) await tx`update crm_companies set gst_number = ${facts.gstin.toUpperCase()}, updated_at = now() where id = ${id}`;
  return id;
}

/** Write one case's buyer details to the CRM and link the case to the customer. */
export async function upsertCustomer(facts: CustomerFacts, link: { caseId: number; job: string }): Promise<number> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const found = await findContact(tx, facts);
    const companyId = await companyFor(tx, facts, found?.company_id ?? null);
    // The email index is unique: take the email only when no other contact holds it.
    let email: string | null = facts.email;
    if (email) {
      const [taken] = await tx<{ id: number }[]>`select id from crm_contacts where lower(primary_email) = lower(${email}) and id <> ${found?.id ?? 0} limit 1`;
      if (taken) email = null;
    }
    let contactId: number;
    if (found) {
      await tx`
        update crm_contacts set
          primary_phone = coalesce(${digits(facts.phone)}, primary_phone),
          primary_email = coalesce(${email}, primary_email),
          delivery_pincode = coalesce(${facts.pincode}, delivery_pincode),
          company_id = ${companyId},
          last_case_at = now(),
          updated_at = now()
        where id = ${found.id}
      `;
      contactId = found.id;
    } else {
      const [row] = await tx<{ id: number }[]>`
        insert into crm_contacts (name, primary_phone, primary_email, delivery_pincode, company_id, last_case_at)
        values (${facts.name}, ${digits(facts.phone)}, ${email}, ${facts.pincode}, ${companyId}, now())
        returning id
      `;
      contactId = row.id;
    }
    await tx`
      insert into crm_customer_cases (case_id, contact_id, company_id, job)
      values (${link.caseId}, ${contactId}, ${companyId}, ${link.job})
      on conflict (case_id) do update set contact_id = excluded.contact_id, company_id = excluded.company_id
    `;
    return contactId;
  }) as Promise<number>;
}

export async function consumeCustomerUpdates(): Promise<number> {
  return consumeEvents('crm.customers', ['customer.updated'], async (event) => {
    const facts = event.payload.facts as CustomerFacts | undefined;
    const caseId = Number(event.payload.case_id);
    if (!facts?.name || !Number.isInteger(caseId)) return;
    // The case may be gone (a sample-data reset); skip rather than fail the pass.
    const [exists] = await getSql()<{ id: number }[]>`select id from cases where id = ${caseId}`;
    if (!exists) return;
    await upsertCustomer(facts, { caseId, job: String(event.payload.job ?? '') });
  });
}

/** Lets a new enquiry start with the details the CRM already has. */
export const crmCustomerDirectory: CustomerDirectory = {
  async find({ phone, email }) {
    const sql = getSql();
    const p = digits(phone ?? null);
    const rows = await sql<(Omit<CustomerRecord, 'contactId'> & { contact_id: number })[]>`
      select c.id as contact_id, c.name, co.display_name as company, c.primary_phone as phone, c.primary_email as email,
             co.gst_number as gstin, c.delivery_pincode as pincode
      from crm_contacts c
      left join crm_companies co on co.id = c.company_id
      where (${p}::text is not null and regexp_replace(c.primary_phone, '\\D', '', 'g') = ${p})
         or (${email ?? null}::text is not null and lower(c.primary_email) = lower(${email ?? null}))
      order by (${p}::text is not null and regexp_replace(c.primary_phone, '\\D', '', 'g') = ${p}) desc, c.last_case_at desc nulls last
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return { contactId: Number(row.contact_id), name: row.name, company: row.company, phone: row.phone, email: row.email, gstin: row.gstin, pincode: row.pincode };
  },
};

export type CustomerRow = {
  id: number; name: string; company: string | null; phone: string | null; email: string | null;
  gstin: string | null; pincode: string | null; quotes: number; orders: number; orderValuePaise: number; lastActivityAt: string | null;
};

/** Contacts with at least one quote or order, newest activity first. */
export async function listCustomers(q: string | null = null): Promise<CustomerRow[]> {
  const sql = getSql();
  const like = q ? `%${q.replace(/[%_]/g, '')}%` : null;
  const rows = await sql<(Omit<CustomerRow, 'orderValuePaise' | 'lastActivityAt'> & { order_value: string | null; last_activity_at: string | null })[]>`
    select c.id, c.name, co.display_name as company, c.primary_phone as phone, c.primary_email as email,
           co.gst_number as gstin, c.delivery_pincode as pincode,
           count(*) filter (where l.job = 'quote')::int as quotes,
           count(*) filter (where l.job = 'order')::int as orders,
           sum((k.data->>'totalPaise')::bigint) filter (where l.job = 'order' and k.state <> 'cancelled') as order_value,
           max(k.updated_at) as last_activity_at
    from crm_customer_cases l
    join cases k on k.id = l.case_id
    join crm_contacts c on c.id = l.contact_id
    left join crm_companies co on co.id = c.company_id
    where (${like}::text is null or c.name ilike ${like} or co.display_name ilike ${like} or c.primary_phone ilike ${like} or c.primary_email ilike ${like} or co.gst_number ilike ${like})
    group by c.id, co.id
    order by max(k.updated_at) desc
  `;
  return rows.map((r) => ({
    id: Number(r.id), name: r.name, company: r.company, phone: r.phone, email: r.email, gstin: r.gstin, pincode: r.pincode,
    quotes: r.quotes, orders: r.orders, orderValuePaise: Number(r.order_value ?? 0), lastActivityAt: r.last_activity_at,
  }));
}

export type CustomerCase = { id: number; job: string; ref: string; state: string; title: string; data: Record<string, unknown>; updatedAt: string };

/** One customer's quotes and orders, newest first. */
export async function customerCases(contactId: number): Promise<CustomerCase[]> {
  const sql = getSql();
  const rows = await sql<{ id: number; job: string; ref: string; state: string; title: string; data: Record<string, unknown>; updated_at: string }[]>`
    select k.id, k.job, k.ref, k.state, k.title, k.data, k.updated_at
    from crm_customer_cases l join cases k on k.id = l.case_id
    where l.contact_id = ${contactId}
    order by k.created_at desc
  `;
  return rows.map((r) => ({ id: Number(r.id), job: r.job, ref: r.ref, state: r.state, title: r.title, data: r.data, updatedAt: r.updated_at }));
}

/** A person edits a customer in the CRM. New enquiries and orders use these details. */
export async function updateCustomer(contactId: number, input: { name: string; company: string | null; phone: string | null; email: string | null; gstin: string | null; pincode: string | null }) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const [contact] = await tx<ContactRow[]>`select id, company_id, primary_email from crm_contacts where id = ${contactId} for update`;
    if (!contact) throw new Error('Customer not found.');
    if (input.email) {
      const [taken] = await tx<{ id: number }[]>`select id from crm_contacts where lower(primary_email) = lower(${input.email}) and id <> ${contactId} limit 1`;
      if (taken) throw new Error('Another contact already uses this email.');
    }
    let companyId = contact.company_id;
    if (input.company) {
      if (companyId) await tx`update crm_companies set display_name = ${input.company}, gst_number = ${input.gstin}, updated_at = now() where id = ${companyId}`;
      else companyId = await companyFor(tx, { ...input, name: input.name }, null);
    } else if (input.gstin) {
      companyId = companyId ?? (await tx<{ id: number }[]>`insert into crm_companies (display_name, gst_number) values (${input.name}, ${input.gstin}) returning id`)[0].id;
      await tx`update crm_companies set gst_number = ${input.gstin}, updated_at = now() where id = ${companyId}`;
    } else {
      companyId = null;
    }
    await tx`
      update crm_contacts set name = ${input.name}, primary_phone = ${digits(input.phone)}, primary_email = ${input.email},
        delivery_pincode = ${input.pincode}, company_id = ${companyId}, updated_at = now()
      where id = ${contactId}
    `;
  });
}
