// CLI wrapper around the WhatsApp queue worker — for local testing and
// diagnostics. Deployments run the same passes inline via instrumentation.ts
// (WHATSAPP_WORKER_INLINE=1), so no terminal is needed in production.
//
//   npm run crm:whatsapp-worker             # one pass: send everything due now
//   npm run crm:whatsapp-worker -- --watch  # keep running, check every 60s
//   WHATSAPP_DRY_RUN=1 npm run crm:whatsapp-worker   # log instead of sending

import { getSql } from '../src/lib/db';
import { processDueRows } from '../src/lib/whatsapp-worker-core';

async function main() {
  const watch = process.argv.includes('--watch');
  do {
    const started = new Date().toISOString();
    try {
      const sent = await processDueRows();
      console.log(`[${started}] pass complete — ${sent} message(s) sent`);
    } catch (error) {
      console.error(`[${started}] pass failed:`, error);
    }
    if (watch) await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (watch);
  if (!watch) {
    const sql = getSql();
    await sql.end();
  }
}

main();
