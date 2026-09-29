// Links every existing quote and order to a CRM customer. New cases link
// themselves through the customer.updated event; run this once after the
// 0009 migration so older cases appear on the Customers page.
//
//   npm run crm:backfill-customers

import { getSql } from '../src/core/db';
import type { CaseRecord } from '../src/core/jobs';
import { upsertCustomer } from '../src/modules/crm/crm-customers';
import { enabledJobs } from '../src/modules/jobs';

async function main() {
  const sql = getSql();
  let linked = 0;
  for (const def of enabledJobs()) {
    if (!def.customerOf) continue;
    const rows = await sql<CaseRecord[]>`select * from cases where job = ${def.job} order by created_at`;
    for (const row of rows) {
      const facts = def.customerOf(row);
      if (!facts) continue;
      await upsertCustomer(facts, { caseId: row.id, job: def.job });
      linked += 1;
    }
  }
  console.log(`Linked ${linked} cases to CRM customers.`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
