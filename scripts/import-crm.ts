import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSql } from '../src/core/db';

function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) return [];
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ''])),
  );
}

function istDate(value: string) {
  if (!value) return null;
  return `${value.replace(' ', 'T')}:00+05:30`;
}

async function main() {
  const sourcePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), '..', 'clients', 'client-database.csv');
  const records = parseCsv(await readFile(sourcePath, 'utf8'));
  const sql = getSql();
  let imported = 0;

  try {
    for (const record of records) {
      if (!record.client_name || !record.fireflies_transcript_id) continue;
      await sql.begin(async (tx) => {
        const domain = record.company_domain.toLowerCase() || null;
        let companyId: number | null = null;

        if (domain) {
          const companies = await tx<{ id: number }[]>`
            select id from crm_companies where lower(domain) = ${domain} limit 1
          `;
          if (companies[0]) {
            companyId = companies[0].id;
          } else {
            const inserted = await tx<{ id: number }[]>`
              insert into crm_companies (display_name, domain)
              values (${domain.split('.')[0]}, ${domain})
              returning id
            `;
            companyId = inserted[0].id;
          }
        }

        const email = record.client_email.toLowerCase() || null;
        let contactId: number;
        const contacts = email
          ? await tx<{ id: number }[]>`select id from crm_contacts where lower(primary_email) = ${email} limit 1`
          : [];
        if (contacts[0]) {
          contactId = contacts[0].id;
          await tx`
            update crm_contacts
            set name = ${record.client_name}, company_id = coalesce(company_id, ${companyId}), updated_at = now()
            where id = ${contactId}
          `;
        } else {
          const inserted = await tx<{ id: number }[]>`
            insert into crm_contacts (company_id, name, primary_email)
            values (${companyId}, ${record.client_name}, ${email})
            returning id
          `;
          contactId = inserted[0].id;
        }

        const existingDeals = await tx<{ id: number }[]>`
          select id from crm_deals where contact_id = ${contactId} order by created_at asc limit 1
        `;
        let dealId: number;
        if (existingDeals[0]) {
          dealId = existingDeals[0].id;
          await tx`
            update crm_deals
            set company_id = coalesce(company_id, ${companyId}),
                problem_statement = coalesce(problem_statement, ${record.short_summary || null}),
                last_interaction_at = greatest(
                  coalesce(last_interaction_at, '-infinity'::timestamptz),
                  coalesce(${istDate(record.meeting_date_ist)}, '-infinity'::timestamptz)
                ),
                updated_at = now()
            where id = ${dealId}
          `;
        } else {
          const deals = await tx<{ id: number }[]>`
            insert into crm_deals (
              contact_id, company_id, title, problem_statement, lead_source, stage, last_interaction_at
            )
            values (
              ${contactId}, ${companyId}, ${`${record.client_name} opportunity`},
              ${record.short_summary || null}, 'fireflies', 'qualified', ${istDate(record.meeting_date_ist)}
            )
            returning id
          `;
          dealId = deals[0].id;
        }

        await tx`
          insert into crm_meetings (
            deal_id, fireflies_transcript_id, title, meeting_at, duration_minutes,
            transcript_url, summary_status, short_summary, action_items
          )
          values (
            ${dealId}, ${record.fireflies_transcript_id}, ${record.meeting_title},
            ${istDate(record.meeting_date_ist)}, ${record.duration_minutes ? Number(record.duration_minutes) : null},
            ${record.fireflies_url || null}, ${record.summary_status === 'available' ? 'available' : 'unavailable'},
            ${record.short_summary || null}, ${record.action_items || null}
          )
          on conflict (fireflies_transcript_id) do update set
            deal_id = excluded.deal_id,
            title = excluded.title,
            meeting_at = excluded.meeting_at,
            duration_minutes = excluded.duration_minutes,
            transcript_url = excluded.transcript_url,
            summary_status = excluded.summary_status,
            short_summary = excluded.short_summary,
            action_items = excluded.action_items,
            synced_at = now()
        `;

        await tx`
          insert into crm_activities (
            deal_id, contact_id, actor, type, occurred_at, subject, body, source, source_id
          )
          values (
            ${dealId}, ${contactId}, 'Fireflies', 'meeting', ${istDate(record.meeting_date_ist)},
            ${record.meeting_title}, ${record.short_summary || null}, 'fireflies', ${record.fireflies_transcript_id}
          )
          on conflict (source, source_id) where source_id is not null and source_id <> ''
          do update set subject = excluded.subject, body = excluded.body, occurred_at = excluded.occurred_at
        `;
      });
      imported += 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`Imported ${imported} Fireflies meetings into the CRM.`);
}

main().catch((error) => {
  console.error('CRM import failed:', error);
  process.exit(1);
});
