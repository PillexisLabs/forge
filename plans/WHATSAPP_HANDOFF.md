# WhatsApp automation handoff: tasks and access

Created 2026-08-10. This is the execution checklist for the person who completes the WhatsApp
automation end to end. Read these two documents first:

- [`WHATSAPP_PRODUCTION_SETUP.md`](WHATSAPP_PRODUCTION_SETUP.md) — account state, verified
  blockers, verification commands, and the demand evidence. Keep it current as items clear.
- [`ROADMAP.md`](ROADMAP.md) sections A to D — the reasoning behind each work item.

Do not rebuild what already works. The sender, queue worker, inbound webhook, reply
classification, consent enforcement, and audit trail all work on the test number today.
See "What already works" in the setup document.

---

## Part 1 — Task list, in execution order

### Phase 1: Production number goes live (ROADMAP A)

The gate on every live sales demo. Blockers verified on 2026-08-09.

- [x] 1. Assign the `forge-bot` system user to the production WABA (`Pillexis Labs`,
      id `4407182709496656`) with full control. Path: Business settings → Users → System
      users → `forge-bot` → Add assets → WhatsApp accounts.
- [x] 2. Move the production number **+91 63649 37775** from the WhatsApp Business phone app
      to the Cloud API. Deregister it in the phone app first. Then add it under WhatsApp
      Manager → API Setup. This step needs the SMS verification code sent to that number
      and sets a 6 digit two-step PIN. Record the PIN in `keys/`.
- [x] 3. Add a payment method to the production WABA. Template sends fail without it.
- [x] 4. Create and submit the five message templates. The bodies must match the copy the
      worker already sends, word for word: booking confirmation, silence nudge, 24 hour
      reminder, attendance check, reschedule offer. Wait for APPROVED status on all five.
- [x] 5. Extend the provider module to send template messages when the 24 hour customer
      window is closed, and free-form text when it is open. Today the code sends free-form
      only, which fails with error 131047 outside the window.
- [x] 6. Point production Forge at the production number: set `WHATSAPP_PHONE_NUMBER_ID`
      (and token if it changes) in Railway **production** variables and in `forge/.env`.
      Staging stays on the test number.
- [x] 7. Configure the inbound webhook on the Meta app (`1057833646896359`): callback
      `https://forge.pillexislabs.com/api/whatsapp/webhook`, subscribe to
      `messages`, set the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`
      in Railway production. Then subscribe the WABA to the app:
      `POST /{waba-id}/subscribed_apps`. Without this call, inbound events do not arrive.
- [ ] 8. (outbound leg passed 2026-08-12 via send-test; inbound reply + full loop pending) End to end test: send a confirmation to a founder number, reply "confirm", reply
      free-form, reply "stop". Verify each transition and audit row. Only then use the
      number on a sales call.

### Phase 2: Cal.com intake (part of ROADMAP B)

- [x] 9. Build the Cal.com `BOOKING_CREATED` webhook receiver in Forge. When a booking
      arrives, create or match the CRM lead, store phone and call time, set consent from
      the booking form, and queue the confirmation. Today every lead is entered by hand.
      Note: the website already has a separate Cal webhook for Meta CAPI
      (`website/netlify/functions/cal-booking.ts`). Do not reuse or break it. Cal.com
      supports multiple webhooks; add a second one that points at Forge.
- [ ] 10. Configure the webhook in Cal.com: URL = the new Forge endpoint, trigger =
      `BOOKING_CREATED`, secret = a new random hex stored in Railway production.

### Phase 3: Inbound lead capture (ROADMAP B)

- [ ] 11. Let the workflow start from an inbound WhatsApp message from an unknown number.
      Six sales accounts describe this exact entry: an ad click lands in WhatsApp with no
      booking object. Create the lead from the first inbound message, greet, qualify, and
      offer the booking link. Scope and design notes are in ROADMAP section B.

### Phase 4: Demo surface (ROADMAP C)

- [ ] 12. Demo scope in production, so sales demos never depend on staging. Design notes
      in ROADMAP section C.
- [ ] 13. Add a "Reset demo data" button in the CRM that reruns the seed fixtures. Today
      this needs a CLI command with the database URL. The seeded time-relative dates go
      stale within days and hide the send button (`next_message_at` empty), which broke a
      demo rehearsal on 2026-08-10.

### Phase 5: Attribution (ROADMAP D)

- [ ] 14. Deal amount and source attribution, so Forge can answer what a closed deal cost
      and which ad produced it. Design notes in ROADMAP section D.

**The target demo** (setup document, "The demo that sells"): mid call, the prospect messages
the production number and watches themselves get greeted, qualified, and booked in the thread
they are looking at. Phases 1 + 3 produce that demo. Phases 2, 4, 5 complete the pipeline.

---

## Part 2 — Access the person needs

Grant scoped access under the person's own accounts. Do not share founder passwords. Do not
hand over `keys/` wholesale; give individual values only when a task needs them, per the
workspace secrecy rule in root `HERMES.md`.

### Meta (business.facebook.com and developers.facebook.com)

| What | Level | Needed for |
|---|---|---|
| Business portfolio `PILLEXIS LABS PRIVATE LIMITED` | **Business admin** (task 1 needs it; downgrade to Employee after) | Assign system-user assets, manage WhatsApp accounts |
| WhatsApp account asset: production WABA `4407182709496656` | Full control | API Setup, number migration, templates (tasks 2, 4) |
| WhatsApp account asset: Test WABA | Full control | Keep staging working while production is set up |
| Billing / payment settings on the business | Finance editor | Add the payment method (task 3) |
| Meta app `1057833646896359` | **Developer** role on the app (Admin only if webhook fields need creating) | Webhook config, read App Secret (task 7) |

Note: assigning assets to a system user is restricted to Business admins. If full admin is
not acceptable, Anurag performs task 1 himself (two minutes) and the rest works with the
lower roles above.

### The production phone number

- Physical or forwarded access to SMS on **+91 63649 37775** during task 2 (one-time
  verification code), and access to the phone that currently runs the WhatsApp Business app,
  to deregister it. This is coordination with Anurag, not a permission grant.

### Cal.com

| What | Level | Needed for |
|---|---|---|
| `pillexislabs` team | **Admin** (webhook management requires it) | Add the Forge `BOOKING_CREATED` webhook (task 10) |
| `CAL_API_KEY` from `keys/.env` | Share only if they script event changes | Optional; UI covers the webhook work |

### Railway

| What | Level | Needed for |
|---|---|---|
| Project `forge` | Member with variable + deploy rights on **staging and production** | Set `WHATSAPP_*`, `CAL_WEBHOOK_SECRET` vars; read logs; redeploy (tasks 5–10) |
| Postgres service | Comes with project access | Seed and inspect data |

### GitHub

| What | Level | Needed for |
|---|---|---|
| `anurag619/forge` | Collaborator, **write** | All code work. They push branches; production deploys from `master`, staging from `staging` |

Workspace rule: every GitHub operation for this repo runs under an account authorised for
the Pillexis org. The person uses their own GitHub account as a collaborator.

### Secrets to hand over individually (not the whole `keys/` folder)

- `WHATSAPP_ACCESS_TOKEN` — the `forge-bot` system-user token (never expires). Alternative:
  create a second system-user token scoped the same way, so it can be revoked independently.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and, after task 7, `WHATSAPP_APP_SECRET`.
- The new `CAL_WEBHOOK_SECRET` they generate for task 10.
- Staging `DATABASE_PUBLIC_URL` comes from Railway once they are a member; no separate grant.

### Explicitly not needed

- GA4 service account, Meta **ads** access, Ad account, Pixel, Events Manager — the ads
  and analytics side of Forge is untouched by this work.
- Netlify / website repo — the website Cal webhook stays as it is.
- Production Meta ads tokens on staging — forbidden by ROADMAP Priority 0.
