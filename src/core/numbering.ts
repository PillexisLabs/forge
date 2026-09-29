import type { Sql, TransactionSql } from 'postgres';
import { getSql } from './db';

// Running document numbers per series. Indian financial years run from
// 1 April to 31 March, and tax invoice numbers restart each year.

export function financialYear(at: Date = new Date()): string {
  const ist = new Date(at.getTime() + 5.5 * 3600000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Next number in a series, e.g. nextNumber('INV/2026-27/') → 'INV/2026-27/0001'. */
export async function nextNumber(series: string, sql: Sql | TransactionSql = getSql(), width = 4): Promise<string> {
  const [row] = await sql<{ last: number }[]>`
    insert into doc_counters (series, last) values (${series}, 1)
    on conflict (series) do update set last = doc_counters.last + 1
    returning last
  `;
  return `${series}${String(row.last).padStart(width, '0')}`;
}
