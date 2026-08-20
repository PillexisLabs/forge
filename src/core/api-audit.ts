import { getSql } from './db';

export async function recordApiRequest(entry: {
  requestId: string;
  clientId: string | null;
  route: string;
  scope: string;
  statusCode: number;
  from?: string;
  to?: string;
  userAgent?: string | null;
}) {
  try {
    const sql = getSql();
    await sql`
      insert into api_request_log
        (request_id, client_id, route, scope, status_code, from_date, to_date, user_agent)
      values
        (${entry.requestId}, ${entry.clientId}, ${entry.route}, ${entry.scope}, ${entry.statusCode},
         ${entry.from ?? null}, ${entry.to ?? null}, ${entry.userAgent ?? null})
    `;
  } catch (error) {
    // Audit failures are visible in service logs but never take down analytics reads.
    console.error('Failed to record API request', error);
  }
}
