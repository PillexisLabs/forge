// Runs the job event consumers on a loop: accepted quotes become orders, and
// order events keep stock commitments correct. The step API also runs one
// pass after every step, so this worker is the safety net for anything a
// request did not finish (a crash between the step and its consumer pass).
//
//   npm run jobs:worker            # loop every 15 seconds
//   npm run jobs:worker -- --once  # one pass, then exit

import { getSql } from '../src/core/db';
import { runJobConsumers } from '../src/modules/jobs';

const INTERVAL_MS = 15_000;

async function main() {
  const once = process.argv.includes('--once');
  do {
    try {
      await runJobConsumers();
    } catch (error) {
      console.error('jobs worker: pass failed, retrying next pass', error);
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  } while (true);
  await getSql().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
