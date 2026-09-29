import type { Sql, TransactionSql } from 'postgres';

// The product interface a job reads, regardless of which system owns the
// products. The inventory module provides it from Forge's own catalogue.
// A Tally or ERP connector later provides the same interface from the
// client's system, and the jobs do not change.
//
// Core defines the interface; the server composition root
// (src/modules/jobs.ts) registers the provider this instance uses.

export type Product = {
  sku: string;
  name: string;
  unit: string;
  ratePaise: number;
  gstRateBp: number;
  hsn: string | null;
  onHand: number;
  incomingLocal: number;
  incomingImport: number;
  /** Promised to confirmed orders, not yet dispatched. */
  committed: number;
  /** onHand minus committed. Negative means a shortfall. */
  available: number;
};

export type ProductSource = {
  /** Shown in the UI, e.g. "Forge catalogue" or "Tally". */
  label: string;
  list(): Promise<Product[]>;
  /** Read inside the caller's transaction when one is passed. */
  get(skus: string[], sql?: Sql | TransactionSql): Promise<Product[]>;
};

let source: ProductSource | null = null;

export function registerProductSource(next: ProductSource) {
  source = next;
}

export function productSource(): ProductSource {
  if (!source) throw new Error('No product source is registered. Enable the inventory module or a connector.');
  return source;
}
