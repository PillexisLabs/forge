// Manual sync from the terminal: `npm run sync` (loads .env).
// Optional: `npm run sync -- 7` to backfill the last 7 days.
import { runSync } from '../src/modules/analytics/sync';

const days = Number(process.argv[2] ?? '8');

runSync({ days: Number.isFinite(days) ? days : 8, trigger: 'cli' })
  .then((res) => {
    console.log('Synced days:', res.synced.join(', '));
    for (const r of res.results) {
      console.log(
        `  ${r.date}: spend ₹${r.spend}, bookings ${r.bookings}, ` +
          `cost/booking ${r.costPerBooking == null ? '—' : '₹' + r.costPerBooking.toFixed(0)}, ` +
          `sessions ${r.sessions}, ads ${r.adCount}`,
      );
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error('Sync failed:', e);
    process.exit(1);
  });
