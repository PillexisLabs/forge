// Node-only boot hook, loaded by instrumentation.ts. With
// WHATSAPP_WORKER_INLINE=1 the WhatsApp queue worker runs inside the app
// process — no separate cron service or terminal needed.
import { startInlineWorker } from './modules/whatsapp/whatsapp-worker-core';

if (process.env.WHATSAPP_WORKER_INLINE === '1') {
  startInlineWorker();
}
