// CLI wrapper around the voice queue worker — same shape as the WhatsApp one.
//
//   npm run voice:worker             # one pass: queue from events, dial due calls
//   npm run voice:worker -- --watch  # keep running, check every 60s
//   VOICE_DRY_RUN=1 npm run voice:worker   # stub provider: no phone rings

import { getSql } from '../src/core/db';
import { runVoicePass } from '../src/modules/voice/voice-worker-core';

async function main() {
  const watch = process.argv.includes('--watch');
  do {
    const started = new Date().toISOString();
    try {
      const { queued, dialed, settled } = await runVoicePass();
      console.log(`[${started}] pass complete — ${queued} event(s) consumed, ${dialed} call(s) dialed, ${settled} settled`);
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
