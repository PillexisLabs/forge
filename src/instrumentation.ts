// Next.js runs register() once when the server boots. With
// WHATSAPP_WORKER_INLINE=1 the WhatsApp queue worker runs inside the app
// process — no separate cron service or terminal needed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WHATSAPP_WORKER_INLINE !== '1') return;
  const { startInlineWorker } = await import('./lib/whatsapp-worker-core');
  startInlineWorker();
}
