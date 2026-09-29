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
7. At dispatch the payment falls due after the terms in Settings → Sales rules → Payments. The reminder rule sends one reminder per step (before the due date, on it, then every N days while overdue) on email, or on WhatsApp inside the 24-hour window; otherwise it hands the reminder to a person. A person records each payment; the order closes when paid in full.
8. A buyer with an open order who writes about payment or delivery reaches that order, not a new enquiry.

Each draft carries stock availability per line (in stock, ships after the next arrival date, or short), and the buyer's message and PDF state it. The Dashboard sums sales, collections, pending and overdue payments, open quote value and the win rate.

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

## Orders & payments settings

Settings → Orders & payments holds every choice about the order after the buyer confirms:

- **Order confirmation** to the buyer, with the order PDF (on or off).
- **Purchase orders to suppliers** for the shortfall after free and incoming stock (on or off). One draft PO per supplier; a person approves each; Forge emails it with the PDF; "received" moves the stock from incoming to on hand. Suppliers and the items they supply are on the Purchase orders page.
- **Invoices:** none (Tally or another system issues them), payment requests (proforma) when each payment falls due, or GST tax invoices at dispatch with a per-year number series (`INV/2026-27/0001`), CGST+SGST inside the seller's state and IGST across states. The buyer's state comes from their GSTIN, else from the delivery pincode, and the invoice says which.
- **Payment terms:** pay after dispatch, advance and balance, or full advance, with day counts; **customer-specific terms** matched by phone, email or company name. Each order keeps the terms it started with, as instalments.
- **Reminders** per instalment.

Known gaps on the tax invoice before a client relies on it: no HSN column (the order does not carry HSN yet), freight carries no GST, and no e-invoice (IRN) or e-way bill. Check the format with the client's accountant.

## Email

Two modes, chosen in Settings → Integrations → Email. The user types the sales address; Forge reads the domain's MX records and recognises Google, Zoho, Microsoft, GoDaddy, Hostinger, Yahoo, Rediffmail or another host, then shows that provider's own steps.

- **Forward (recommended, any provider, no password).** Forge gives a personal intake address. The client forwards sales@ to it. The inbound mail service for `EMAIL_INBOUND_DOMAIN` posts each mail to `POST /api/intake/email?key=EMAIL_INBOUND_KEY` (Postmark inbound JSON, or a raw message from a Cloudflare Email Worker). Gmail's forwarding code is captured and shown on the setup screen. Replies go through the relay (`EMAIL_RELAY_*`) as "Business via Forge", Reply-To and a copy to sales@. Without a relay, replies stay in test mode.
- **Password (advanced).** IMAP reads and SMTP sends with the mailbox or app password, with the servers filled in per provider and a "Test connection" check. Microsoft does not allow it; forwarding covers Microsoft until OAuth is added.

To go live with forwarding: pick the inbound and relay provider, point the inbound domain's MX at it, and set the `EMAIL_*` variables on the instance.

## Not built yet

- WhatsApp outside the 24-hour window needs an approved template; until then a person sends those quotes.
- The matching rule is keyword-based. An AI employee replaces it behind the same review step.
- Stock changes are edits on the item; there is no receipt history yet.
- Module tables still share one migrations folder. Per-module migrations come with the monorepo move.
