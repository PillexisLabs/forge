# Jobs: the manual delivery flow and the AI employee seam

_Status: built on `feature/manual-jobs`, 29 September 2026. Not yet on staging. Revised the same day: intake and routine steps are automatic, people only check and approve._

## What this adds

A manufacturer's enquiry-to-order flow where integrations and rules do the routine work and people only decide:

1. A buyer message arrives from WhatsApp, Google Sheets, the webhook (website form, Zapier, IndiaMART push) or email. It is stored once in `inbound_messages` and emitted as `message.received`.
2. The intake rule makes a quote case, or adds the message to the buyer's open case.
3. The matching rule (`src/modules/sales/enquiry-match.ts`) reads items, quantities and the pincode from the message and drafts the quote. If something is missing, it asks the buyer on the same channel.
4. A person checks the draft. Above the approval limit, an approver approves it.
5. The send rule sends the quote and its PDF on WhatsApp (inside the 24-hour window) or email.
6. The reply rule reads "confirm" and accepts the quote. The order rule makes the order, and inventory commits the stock.

Manual entry stays as a fallback in the "New enquiry" modal.

| Part | Where | What it does |
| --- | --- | --- |
| Job engine | `src/core/jobs.ts` | Cases, named steps, actors, permission checks, the step record, events in the same transaction |
| Product interface | `src/core/products.ts` | The product and stock reads a job uses. The inventory module provides it today. A Tally connector can provide it later. |
| Instance modules | `src/core/modules.ts` | `FORGE_MODULES` lists the modules one instance runs. Unset means all. |
| Sales module | `src/modules/sales/` | The quote job and its fixed price rules |
| Orders module | `src/modules/orders/` | The order job. A rule makes the order from `quote.accepted`. |
| Inventory module | `src/modules/inventory/` | The catalogue, stock, and commitments from order events |
| Job root | `src/modules/jobs.ts` | The server composition root for job definitions, the product source and consumers |
| Intake | `src/core/intake.ts` | One stored, deduplicated inbound message per source message |
| Channels | `src/core/channels.ts` | Outbound WhatsApp and email senders, every send logged in `outbound_messages` |
| Integrations | `src/core/integrations.ts`, `src/modules/{whatsapp,sheets,email}/`, `/api/intake/webhook` | Settings → Integrations; secrets encrypted with `AUTH_SECRET` |
| Settings | `src/core/settings.ts`, `src/modules/sales/sales-settings.ts` | Settings → Sales rules: approval mode and limit, freight, validity, automation switches, quote header |
| Screens | `/work`, `/sales`, `/orders`, `/inventory`, `/settings/*` | Up next, quotes and orders with record sheets, stock and catalogue, settings (Lightfield-style) |

## Rules that keep the AI employee model possible

1. A screen never writes case data. Every button runs a step through `POST /api/jobs/<job>/cases/<id>/steps`.
2. Each step has a typed input parser, a list of start states and a list of end states.
3. Each step records its actor: `user`, `rule` or `employee`. No step accepts `employee` yet.
4. Prices, tax, freight and the approval limit are pure functions. An actor chooses items and quantities. It never calculates a price.
7. Rules may draft, send and accept. No rule may check or approve a quote (`submitQuote` and `approveQuote` accept users only; a test enforces it).
5. An approval applies to one exact quote version. A new draft cancels it.
6. Cases wait on a role (`sales`, `approver`, `operations`). An AI employee becomes one more assignee.

To add AI employees later: add an employee record with its roles and limits, let chosen steps accept `employee`, check the employee's limits in `checkStep`, and run the employee on the same job engine. The tables do not change.

## Operation

- `npm run db:migrate` applies `0005_jobs_and_inventory.sql`.
- `npm run jobs:seed-demo` loads sample data (localhost only; `--allow-remote` for staging; never production).
- The web process runs the jobs loop (intake polls every 60 s, consumers every 15 s) unless `JOBS_WORKER_INLINE=0`. `npm run jobs:worker` runs the same passes on its own.
- `FORGE_MODULES` chooses the instance's modules. A client instance: `sales,orders,inventory,whatsapp,sheets,email`.
- The `SALES_*` and `BUSINESS_*` env vars are only first defaults; Settings → Sales rules overrides them.
- WhatsApp intake runs only when Settings → Integrations has WhatsApp on, so the Pillexis CRM number never creates sales enquiries.

## Not built yet

- WhatsApp outside the 24-hour window needs an approved template; until then a person sends those quotes.
- The matching rule is keyword-based. An AI employee replaces it behind the same review step.
- Stock changes are edits on the item; there is no receipt history yet.
- Module tables still share one migrations folder. Per-module migrations come with the monorepo move.
