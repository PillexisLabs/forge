// Node-only boot hook, loaded by instrumentation.ts.
// - WHATSAPP_WORKER_INLINE=1 runs the CRM WhatsApp queue worker in-process.
// - The jobs loop (intake polls and job consumers) runs in-process unless
//   JOBS_WORKER_INLINE=0, so an instance needs no separate worker service.
import { startInlineWorker } from './modules/whatsapp/whatsapp-worker-core';

if (process.env.WHATSAPP_WORKER_INLINE === '1') {
  startInlineWorker();
}

if (process.env.JOBS_WORKER_INLINE !== '0' && process.env.DATABASE_URL) {
  import('./modules/jobs').then(({ startJobsLoop }) => startJobsLoop()).catch((error) => {
    console.error('jobs loop failed to start', error);
  });
}
