import { getSql } from './db';
import { assigneeRolesFor } from './jobs';
import { isModuleOn } from './modules';
import type { SessionUser } from './users';

/**
 * How many open cases wait for this user now: cases assigned to one of
 * their roles, except enquiries and sent quotes that wait on the buyer, plus cases with a
 * buyer message that needs an answer. Shown as the "Up next" count.
 */
export async function attentionCount(user: SessionUser): Promise<number> {
  if (!(await isModuleOn('sales')) && !(await isModuleOn('orders'))) return 0;
  const roles = assigneeRolesFor(user);
  if (!roles.length) return 0;
  const sql = getSql();
  const [row] = await sql<{ n: string }[]>`
    select count(*) as n from cases
    where closed_at is null
      and (
        (assignee_role = any(${roles}) and state <> 'sent' and not (state = 'enquiry' and jsonb_array_length(coalesce(data->'awaiting', '[]'::jsonb)) > 0))
        or (data->'attention') is not null and data->'attention' <> 'null'::jsonb
      )
  `;
  return Number(row?.n ?? 0);
}
