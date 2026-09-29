import { registerChannel } from '@/core/channels';
import type { JobDefinition } from '@/core/jobs';
import { isModuleEnabled } from '@/core/modules';
import { registerProductSource } from '@/core/products';
import { emailChannel, pollMailbox } from './email/email-integration';
import { inventoryProductSource } from './inventory/inventory-data';
import { consumeOrderStockEvents, consumePurchaseStockEvents } from './inventory/inventory-consumer';
import { orderJob } from './orders/order-job';
import { consumeQuoteAccepted } from './orders/order-consumer';
import { consumeOrderDocuments, consumeOrderMessages, runPaymentReminders } from './orders/payment-reminders';
import { consumeApprovedQuotes, consumeInboundMessages, consumeRecordedEnquiries } from './sales/quote-automation';
import { quoteJob } from './sales/quote-job';
import { consumeOrderShortages } from './purchasing/purchase-consumer';
import { purchaseJob } from './purchasing/purchase-job';
import { pollSheet } from './sheets/sheets-intake';
import { whatsappChannel } from './whatsapp/whatsapp-channel';

// The server-side composition root for jobs. registry.ts lists manifests and
// is safe to bundle into client components; this file lists the job
// definitions, the product source, the channels, the intake pollers and the
// event consumers, which hold server code. Only server code (pages, API
// routes, scripts, the background loop) imports it.

const ALL_JOBS: JobDefinition[] = [quoteJob, orderJob, purchaseJob];

// The product source this instance uses. A client on Tally registers the
// Tally connector's source here instead; the quote job does not change.
if (isModuleEnabled('inventory')) registerProductSource(inventoryProductSource);
if (isModuleEnabled('whatsapp')) registerChannel(whatsappChannel);
if (isModuleEnabled('email')) registerChannel(emailChannel);

export function enabledJobs(): JobDefinition[] {
  return ALL_JOBS.filter((job) => isModuleEnabled(job.module));
}

export function jobByName(name: string): JobDefinition | null {
  return enabledJobs().find((job) => job.job === name) ?? null;
}

/** Where a case lives, by job. Cases open as a side panel over their list. */
export function casePath(job: string, ref: string): string {
  if (job === 'quote') return `/sales?open=${ref}`;
  if (job === 'order') return `/orders?open=${ref}`;
  if (job === 'purchase') return `/purchasing?open=${ref}`;
  return '/work';
}

/**
 * Run the job consumers once, in dependency order: a message becomes or
 * updates an enquiry, an approved quote is sent, an accepted quote becomes
 * an order, and the order commits stock. The step API and the webhook call
 * this after each request; the background loop runs it on a timer.
 */
export async function runJobConsumers(): Promise<void> {
  if (isModuleEnabled('sales')) {
    await consumeInboundMessages();
    await consumeRecordedEnquiries();
    await consumeApprovedQuotes();
  }
  if (isModuleEnabled('orders')) {
    await consumeQuoteAccepted();
    await consumeOrderMessages();
  }
  if (isModuleEnabled('inventory')) await consumeOrderStockEvents();
  if (isModuleEnabled('orders')) await consumeOrderDocuments();
  if (isModuleEnabled('purchasing')) await consumeOrderShortages();
  if (isModuleEnabled('inventory')) await consumePurchaseStockEvents();
}

const POLL_EVERY_MS = 60_000;
let lastPoll = 0;

/** Read the polled integrations (Google Sheets, email) at most once a minute. */
export async function runIntakePolls(force = false): Promise<void> {
  if (!force && Date.now() - lastPoll < POLL_EVERY_MS) return;
  lastPoll = Date.now();
  if (isModuleEnabled('sheets')) await pollSheet().catch((error) => console.error('sheets poll failed', error));
  if (isModuleEnabled('email')) await pollMailbox().catch((error) => console.error('email poll failed', error));
}

declare global {
  // eslint-disable-next-line no-var
  var __forge_jobs_loop: NodeJS.Timeout | undefined;
}

/** The in-process worker: polls and consumers every 15 seconds. */
export function startJobsLoop() {
  if (globalThis.__forge_jobs_loop) return;
  let running = false;
  globalThis.__forge_jobs_loop = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runIntakePolls();
      await runJobConsumers();
      if (isModuleEnabled('orders')) await runPaymentReminders();
    } catch (error) {
      console.error('jobs loop pass failed', error);
    } finally {
      running = false;
    }
  }, 15_000);
  console.log('jobs loop started (intake polls every 60 s, consumers every 15 s)');
}
