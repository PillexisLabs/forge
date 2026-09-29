# Jobs: the manual delivery flow and the AI employee seam

_Status: built on `feature/manual-jobs`, 29 September 2026. Not yet on staging._

## What this adds

The manual delivery model for a manufacturer: enquiry → quote → approval → sent → accepted → order → dispatch, with one stock view. People do the steps. Rules calculate prices, GST, freight and the approval limit.

| Part | Where | What it does |
| --- | --- | --- |
| Job engine | `src/core/jobs.ts` | Cases, named steps, actors, permission checks, the step record, events in the same transaction |
| Product interface | `src/core/products.ts` | The product and stock reads a job uses. The inventory module provides it today. A Tally connector can provide it later. |
| Instance modules | `src/core/modules.ts` | `FORGE_MODULES` lists the modules one instance runs. Unset means all. |
| Sales module | `src/modules/sales/` | The quote job and its fixed price rules |
| Orders module | `src/modules/orders/` | The order job. A rule makes the order from `quote.accepted`. |
| Inventory module | `src/modules/inventory/` | The catalogue, stock, and commitments from order events |
| Job root | `src/modules/jobs.ts` | The server composition root for job definitions, the product source and consumers |
| Screens | `/work`, `/sales`, `/orders`, `/inventory` | My work inbox, quotes, orders, stock, and a printable quote |

## Rules that keep the AI employee model possible

1. A screen never writes case data. Every button runs a step through `POST /api/jobs/<job>/cases/<id>/steps`.
2. Each step has a typed input parser, a list of start states and a list of end states.
3. Each step records its actor: `user`, `rule` or `employee`. No step accepts `employee` yet.
4. Prices, tax, freight and the approval limit are pure functions. An actor chooses items and quantities. It never calculates a price.
5. An approval applies to one exact quote version. A new draft cancels it.
6. Cases wait on a role (`sales`, `approver`, `operations`). An AI employee becomes one more assignee.

To add AI employees later: add an employee record with its roles and limits, let chosen steps accept `employee`, check the employee's limits in `checkStep`, and run the employee on the same job engine. The tables do not change.

## Operation

- `npm run db:migrate` applies `0005_jobs_and_inventory.sql`.
- `npm run jobs:seed-demo` loads sample data (localhost only; `--allow-remote` for staging; never production).
- `npm run jobs:worker` runs the event consumers on a loop. The step API also runs one pass after each step.
- Policy settings: `SALES_APPROVAL_LIMIT_RUPEES`, `SALES_FREIGHT_LOCAL_RUPEES`, `SALES_FREIGHT_OUTSTATION_RUPEES`, `SALES_LOCAL_PIN_PREFIXES`, `SALES_QUOTE_VALID_DAYS`, `BUSINESS_NAME`, `BUSINESS_ADDRESS`, `BUSINESS_GSTIN`.

## Not built yet

- WhatsApp inbound does not create enquiries. Staff record them. The step accepts a `rule` actor for this.
- The quote goes out by staff through "Open in WhatsApp" and the PDF view. Forge does not send it.
- No stock receipts or adjustments screen. Stock numbers come from the catalogue data.
- Module tables still share one migrations folder. Per-module migrations come with the monorepo move.
