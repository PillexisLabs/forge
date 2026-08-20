# Forge Platform Specification

Status: working spec, v1 (2026-08-19)
Owner: Anurag
Companion page: `plans/forge-platform-architecture.html` (visual explainer for the team)

This document is the contract for all platform work. Review every PR against it.

## 1. Purpose

Forge is the Pillexis delivery platform. It holds reusable modules that we
sell, demo live on sales calls, and copy into client repositories. Clients
own their copy. We keep the upstream templates and improve them with each
engagement.

Decisions locked on 2026-08-18:

- The existing forge repo evolves into the platform. No new repo.
- Audience: internal delivery backbone plus live sales demos. No SaaS, no
  multi-tenancy. One deployment serves one workspace.
- IP model: modules are templates. Each engagement gets a full copy in the
  client's GitHub on day 1.
- Launch modules: whatsapp, lead-qual (from crm), analytics, voice.

## 2. Layers

- **Core** (`src/core/`): auth, config, Postgres access, logging, audit,
  worker runtime, the data spine, and the event bus. Every module plugs
  into core.
- **Modules** (`src/modules/<name>/`): self-contained capabilities. Each
  module owns its own tables, API routes, screens, and workers.
- **Foundry** (later): the scaffolder that copies core plus selected modules
  into a client repository and writes `forge.lock`.

## 3. Data spine (core tables)

Core owns these tables. Modules extend them by reference. A module must not
create its own copy of a lead, contact, or conversation.

- `contacts` — one row per person.
- `leads` — one row per sales opportunity. Points at a contact.
- `conversations` — one row per thread (WhatsApp, voice, email).
- `events` — the outbox for the event bus.
- `knowledge` — the knowledge pack (see section 3a).

Rules:

- Module tables use a prefix (`wa_`, `lq_`, `vc_`, `an_`) and reference core
  IDs (`wa_messages.lead_id -> leads.id`).
- Only core migrations may change core tables. Additive columns only.
- Review each core migration against every module manifest.

## 3a. Knowledge pack

The knowledge pack holds everything the AI agents are allowed to say. Core
owns it, next to the data spine. One pack per workspace.

Contents:

- Business profile: what the business sells and to whom.
- Offer and product facts, including prices where approved.
- The qualification script and the scoring rubric.
- FAQ answers and objection responses.
- Tone rules and banned claims.

Storage: structured records plus markdown chunks in Postgres (`knowledge`
tables). Packs are small. Load the full pack into the prompt at first. Add
retrieval only when a pack grows too large for the context window.

Rules:

- **Agent prompts must be built from the knowledge pack. Never hardcode
  business facts, scripts, or answers in module code.** This is the same
  rule as config: client identity lives in data, not in code.
- Voice builds its call prompt from the pack. WhatsApp builds its flow
  replies from the pack. Lead-qual takes its scoring rubric from the pack.
- The team edits the pack through a dashboard screen. Filling the pack is
  a core part of every client engagement (discovery output).
- The demo workspace's fake businesses are three pre-filled packs.
- The pack travels with the client copy: their repo, their database, their
  facts. Nothing stays with us after handover.

## 4. Event bus

One Postgres `events` table used as an outbox. A module emits an event.
Other modules subscribe by event type. No Kafka, no external queue.

Module communication rules:

- Modules must not import code from other modules. An ESLint boundary rule
  enforces this.
- Modules communicate only through events and the data spine.
- New event types are safe to add. New payload fields are safe to add.
- Do not rename or remove an event. Do not change the meaning of a field.
  Ship `name.v2` beside the old event, migrate consumers, then retire v1.

### Event catalog v1

| Event | Emitter | Consumers | Payload (minimum) |
|---|---|---|---|
| `lead.created` | core (Cal intake, Meta click) | whatsapp, analytics | lead_id, source, created_at |
| `lead.replied` | whatsapp | lead-qual, analytics | lead_id, message_id, intent |
| `lead.qualified` | lead-qual | voice, crm, analytics | lead_id, score, answers |
| `call.completed` | voice | crm, analytics | lead_id, call_id, outcome, transcript_ref, duration_s |
| `booking.created` | core (Cal webhook) | whatsapp, analytics | lead_id, booking_uid, start_at |
| `followup.requested` | voice, lead-qual | whatsapp | lead_id, reason, template_hint |
| `booking.created` (extra field) | — | — | phone_provided: the consent signal for the WhatsApp workflow |
| `sync.completed` | analytics | (none yet) | status, trigger, days, error_count, duration_ms |

The bus itself (shipped in PR 2): the `events` table plus `event_cursors`.
`emitEvent()` accepts the caller's transaction, so an event commits with the
data it describes. `consumeEvents()` delivers at least once — handlers must
be idempotent — and advances one cursor per consumer under a row lock.

## 5. Module contract

Each module is one folder with this shape:

```
src/modules/<name>/
├── manifest.ts      # name, version, config schema, events in/out, nav entries
├── migrations/      # its own tables, prefixed
├── api/             # route handlers, mounted by core
├── ui/              # pages, mounted under /m/<name>
├── workers/         # crons and queue consumers
└── providers/       # adapters for outside services
```

Rules:

- Every outside service sits behind a provider adapter. The module speaks
  one interface. The adapter converts for the concrete vendor.
- No Pillexis-specific or client-specific values in module code. Identity
  and secrets live in config only.
- Each capability has exactly one owning module. Example: only whatsapp
  sends WhatsApp messages. Other modules request it with
  `followup.requested`.
- `src/modules/registry.ts` is the composition root: the one file that
  imports every manifest (shipped in PR 3). App-level code that needs
  "all modules" — the nav, a status page, the Foundry — reads this
  list. Core never imports it. A client copy with fewer modules edits
  exactly this file.

## 6. Code placement

Answer these questions in order:

1. Do two or more modules need this code? Put it in `src/core/`.
2. Is it glue for one outside service? Write a provider adapter inside the
   module.
3. Is it for one specific client only? Build it in the client's repo, never
   in upstream.
4. Otherwise, put it inside the owning module. If it needs another module,
   emit an event.

## 7. Client copies and updates

- The Foundry copies core plus purchased modules into the client's GitHub.
  `forge.lock` records the module versions of the copy.
- Updates never flow automatically.
- **Forward flow** (upstream to client): diff the module folder since their
  cut, cherry-pick the wanted commits into their repo, test, open a PR
  there. Do this on the next engagement, or at once for a security fix.
- **Reverse flow** (client to upstream): cherry-pick the feature into an
  upstream branch, strip client-specific values into config, delete client
  data, land with a version bump and a changelog line.
- Prefer to avoid reverse flow: when a feature is generic, build it in
  upstream first and forward-port it to the client at once.
- Do not use npm packages or git submodules for module delivery. They
  create a dependency on our infrastructure and break the ownership
  promise.

## 8. Voice module (first new build)

Purpose: call a qualified lead, run the qualification script by voice, and
write the result back.

Default providers (decided 2026-08-19):

- Telephony: **Twilio** Programmable Voice with Media Streams
  (~USD 0.0075/min to Indian mobiles, USD 2/month per number).
- Speech pipeline: **Sarvam** — Saarika STT (INR 30/hour), sarvam-m LLM
  (INR 29 in / 73 out per 1M tokens), Bulbul v3 TTS (INR 30 per 10k
  characters). Chosen for Hinglish quality.
- Working cost: about INR 2 per call minute, about INR 10 per 5-minute
  call. Sarvam rates are beta pricing; the stack still wins if they double.

Flow:

1. Consume `lead.qualified`. Check consent and the calling window.
2. Build the call prompt from the knowledge pack plus the lead's record.
3. Dial through the telephony adapter.
4. Stream audio both ways: Twilio Media Streams ↔ Saarika → sarvam-m →
   Bulbul → Twilio.
5. Target turn latency: under 1.2 seconds. This is the spike's pass/fail
   test, not cost.
6. On hangup: write transcript and outcome to `conversations`, emit
   `call.completed`, and emit `followup.requested` when the script asks
   for it.

Compliance: call only leads who gave consent in the WhatsApp step. Capture
consent there. Respect TRAI/DND rules.

## 9. CRM module: the lead pipeline (live on staging)

The crm module already runs on staging. Its center is the pipeline board
at `/crm/pipeline`: one card per deal, one column per stage.

Stages, in order: `new_lead` → `contacted` → `intro_call_booked` →
`qualified` → `discovery_proposed` → `discovery_won` →
`implementation_proposed` → `won`. Two side stages catch the rest:
`nurture` (keep warm) and `lost`.

What the board holds today:

- One deal per open opportunity, with an owner (Anurag or Priyanka), an
  estimated value, and a next action with a due date.
- Cal.com intake: a booking finds or creates the contact, reuses the
  contact's open deal, and moves it to `intro_call_booked`. A rebooked
  lead never forks into two deals.
- The WhatsApp workflow state and consent status sit on each deal.
- Fireflies meeting summaries attach to the deal.

How the platform work changes it:

- PR 1 moves the code to `src/modules/crm/` with zero behavior change.
- After PR 2, events move the cards: `booking.created` sets
  `intro_call_booked`, `lead.qualified` sets `qualified`, and
  `call.completed` writes an activity on the deal.
- The lead-qual split (checklist step 6) takes the scoring logic out of
  crm. The board stays in crm: crm shows state, lead-qual decides it.
- Stages `discovery_proposed` through `won` are human sales work. The
  modules support these stages but never move them automatically.

## 10. Migration checklist

1. [x] PR 1 — the carve. Create `src/core/` and
   `src/modules/{analytics,whatsapp,crm}/`. Move files, fix imports, add
   the ESLint boundary rule. Zero behavior change.
2. [x] PR 2 — the event spine. `events` table, `emitEvent()` helper.
   Emit `booking.created`, `lead.replied` (inbound WhatsApp), and sync
   completion.
3. [x] PR 3 — manifests per module. Build nav from manifests.
4. [ ] Voice spike (throwaway): one AI call to our own phone on the
   Twilio + Sarvam stack. Pass: latency under 1.2 s and demo quality.
5. [ ] `src/modules/voice/` on the event spine.
6. [ ] Split lead-qual out of crm.
7. [ ] `/docs` route (decided 2026-08-20, resequenced 2026-08-20 to
   after the module work). Forge renders the repo's `docs/` folder
   behind the existing login. Docs get changed on GitHub and read in
   Forge; every client copy ships with the docs viewer.
8. [ ] Demo workspace: seed data for three fake businesses, reset button,
   own staging deployment.
9. [ ] Foundry scaffolder, only after one or two client copies were cut by
   hand.

### File moves for PR 1

| Today (`src/lib/`) | Target |
|---|---|
| `auth.ts`, `db.ts`, `env.ts`, `logger.ts`, `api-audit.ts`, `api-auth.ts`, `forge-nav.ts`, `crm-types.ts` | `src/core/` |
| `ga.ts`, `meta.ts`, `sync.ts`, `insights.ts`, `analytics-data.ts`, `types.ts` | `src/modules/analytics/` |
| `whatsapp-provider.ts`, `whatsapp-worker-core.ts`, `crm-whatsapp-*.ts` | `src/modules/whatsapp/` |
| `crm-data.ts`, `crm-routes.ts`, `crm-cal-intake.ts` | `src/modules/crm/` |

Notes from the carve (2026-08-20):

- `crm-types.ts` went to core, not to the crm module. It holds the
  shared deal, stage, and WhatsApp workflow types that both crm and
  whatsapp need — data spine types. Keeping it in crm would force a
  cross-module import.
- `forge-nav.ts` (dashboard shell nav) and `types.ts` (analytics
  domain types) were not in the original table; they moved to core and
  analytics.
- The one temporary boundary exception (crm-cal-intake calling the
  whatsapp module directly) was resolved in PR 2: the intake now emits
  `booking.created` and the whatsapp worker consumes it. Zero
  cross-module imports remain.

## 11. Demo workspace

A second deployment of the same repo. Seed data for three fake businesses
(D2C food, coaching institute, manufacturer) and a reset button. Used live
on sales calls: trigger the WhatsApp flow on the prospect's number, let the
voice module call them, show the events land in analytics.
