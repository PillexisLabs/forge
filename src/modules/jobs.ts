import type { JobDefinition } from '@/core/jobs';
import { isModuleEnabled } from '@/core/modules';
import { registerProductSource } from '@/core/products';
import { inventoryProductSource } from './inventory/inventory-data';
import { consumeOrderStockEvents } from './inventory/inventory-consumer';
import { orderJob } from './orders/order-job';
import { consumeQuoteAccepted } from './orders/order-consumer';
import { quoteJob } from './sales/quote-job';

// The server-side composition root for jobs. registry.ts lists manifests and
// is safe to bundle into client components; this file lists the job
// definitions, the product source and the event consumers, which hold
// server code. Only server code (pages, API routes, scripts) imports it.

const ALL_JOBS: JobDefinition[] = [quoteJob, orderJob];

// The product source this instance uses. A client on Tally registers the
// Tally connector's source here instead; the quote job does not change.
if (isModuleEnabled('inventory')) registerProductSource(inventoryProductSource);

export function enabledJobs(): JobDefinition[] {
  return ALL_JOBS.filter((job) => isModuleEnabled(job.module));
}

export function jobByName(name: string): JobDefinition | null {
  return enabledJobs().find((job) => job.job === name) ?? null;
}

/** Where a case's page lives, by job. */
export function casePath(job: string, ref: string): string {
  if (job === 'quote') return `/sales/${ref}`;
  if (job === 'order') return `/orders/${ref}`;
  return '/work';
}

/**
 * Run the job consumers once, in dependency order: an accepted quote creates
 * an order, and the new order commits stock. The step API calls this after
 * every step, so the demo needs no separate worker. `npm run jobs:worker`
 * runs the same passes on a loop for a production instance.
 */
export async function runJobConsumers(): Promise<void> {
  if (isModuleEnabled('orders')) await consumeQuoteAccepted();
  if (isModuleEnabled('inventory')) await consumeOrderStockEvents();
}
