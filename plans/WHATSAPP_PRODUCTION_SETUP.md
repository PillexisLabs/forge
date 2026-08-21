# WhatsApp production setup and the demand behind it

**Last verified: 2026-08-16** against the Meta Graph API with the `forge-bot` token.

> **STATUS (2026-08-16): the production number sends.** All Meta-side setup is
> complete and the code is live in production. Two Cal.com steps remain before
> the pipeline runs end to end. See "Progress log" at the bottom of this file
> for the full record and the exact remaining commands.

Two things in one document: **why** Pillexis is building WhatsApp automation, and **exactly where
the production number setup stands**. The second half is a live checklist, so update it as items
clear.

---

## Part 1, the demand evidence

### How often it comes up

Across the Fireflies corpus (21 transcripts with sentence level text, 17 distinct accounts):

- **WhatsApp is spoken in 11 of 17 accounts, and raised by the prospect in 10 of 17.**
  123 mentions total, 63 of them by the prospect. The eleventh account, APT Khorda College, has
  3 mentions, all of them Anurag's, so it does not count as prospect demand.
- Ranked by prospect mentions: Propbotics 33, SuperReply 6, SS EduTech 6, BitlaSoft 5, Jitsy 4,
  Rajesh Anand 4, B. U. Bhandari 2, Sneakinn 2, Kristeel 2, Sukh Aur Shanti 1

From the Cal.com booking form field *"if we could fix one thing in your ops or AI setup in 30
days"*, 25 leads gave a real answer, of which 2 were internal test bookings:

- **5 of 23 name WhatsApp explicitly**, about 22%: Aarav Singh, Achal Parekh, Omkar Sonawane,
  Sachit Pathella, Kishan Trivedi
- **8 of 23 fall in the wider lead response cluster**, about 35%, adding Gami Narendra, Sachit
  Yadav and JC Reddy

It is the single most repeated **specific** ask. Everything else is generic (automation,
streamlining, social media).

### It is not one problem, it is five jobs on one channel

| Job | Accounts |
|---|---|
| **Meta ads to click to WhatsApp to lead response** | Sneak In, Jitsy, SuperReply, SS EduTech, Propbotics, Aarav Singh |
| Post sale status and support | B. U. Bhandari, BitlaSoft, Sukh Aur Shanti |
| Reselling WhatsApp API to their own clients | Propbotics, BitlaSoft |
| Follow up and chasing | Kristeel |
| Order taking | Rajesh Anand |

The first cluster is six accounts describing the same install.

### The selection effect, stated honestly

**22 of 34 Meta Schedules came from Ad 04 WhatsApp. With BSP Switch it is 23, about 68% of every
booking the account has produced.** Pillexis advertises on Meta, about WhatsApp, to people who run
Meta ads. Part of this signal is a mirror, not a market. It does not make the demand fake, but it
means the corpus over represents WhatsApp relative to the wider D2C population.

### Price sensitivity

**4 of the 5 explicit WhatsApp askers are under ₹1Cr ARR.** The ₹10Cr plus band asks for
completely different things: end to end ops, customer journey, accounting analytics, sales
reporting, owning the stack. WhatsApp demand and the ability to pay ₹80,000 a month are inversely
correlated.

### Why they do not just buy Gallabox, Interakt, AiSensy or Wati

The competitive claim "they cannot customise" is **false and must not be used**. Interakt ships
visual workflow builders and CRM integrations for Zoho, HubSpot and Freshworks. Gallabox has drag
and drop bot flows. Wati and AiSensy expose full API and webhook access. A prospect who has
demoed any of them will end the conversation.

The real gaps, all evidenced:

1. **Nobody has the bandwidth to set it up.** SS EduTech: *"WhatsApp lead nurturing is something I
   have been looking at for a while but sort of not had the bandwidth to get into and set up"* and
   *"I know WhatsApp automation comes in over there… but that's not something we've implemented
   yet."* He knew exactly what the tool does and still had not done it after a year. Jitsy: *"We
   don't have the bandwidth."* SuperReply: *"We are a lean team of three people."*
2. **No connector for what they actually run.** Omkar wants *"a custom WhatsApp automation
   solution that works with our internal dashboard."* Jitsy: *"We have our own admin panels which
   has got CRM and all already built in there."* Kristeel, BitlaSoft and Propbotics all run
   bespoke systems. There is no Gallabox connector for an in house panel.
3. **They do not know what to automate.** SS EduTech: *"I'm not sure how much improvement we see
   in the efficiency"* and *"I think we have not implemented it in a way where ROI seems to be
   very fruitful."*

**Cost is not the reason.** Jitsy said building their own would cost more: *"building our own
stack will obviously have a little more cost than what we are already paying on a subscription
basis… but if the ROI is there we are happy to go with our own stack."* Do not pitch on price.

**The positioning that follows:** not "we customise and they cannot", but *"You could use AiSensy.
Someone on your team then has to design the flow, build it, connect it to your dashboard, and fix
it when it breaks. If you have that person, use AiSensy. If you don't, that's us."*

### Who to walk away from

A business with a standard funnel, running on Shopify or Zoho, with someone who will own the
setup. Gallabox is genuinely the right answer there and the deal will be lost. Pillexis wins where
there is a bespoke system to connect to, or nobody to do the work.

---

## Part 2, production number setup

### Verified state

**Business verification: passed.** `PILLEXIS LABS PRIVATE LIMITED`, originally verified
**30 July 2026**.

| Asset | Value | State |
|---|---|---|
| Production WABA | `Pillexis Labs`, id **4407182709496656** | Account status **Approved**, business verification **Verified** |
| Production number | **+91 63649 37775**, display name `Pillexis Labs` | **Connected** |
| Test WABA | `Test WhatsApp Business Account` | in use today |
| Test number | `+1 555-198-9011`, phone_number_id **1157420147464982** | `CLOUD_API`, `CONNECTED`, quality `GREEN`, `code_verification_status: NOT_VERIFIED` |
| Token | system user **`forge-bot`**, app id `1057833646896359` | never expires. Scopes: `whatsapp_business_management`, `whatsapp_business_messaging` |
| Graph version | `v23.0` (`META_GRAPH_VERSION` in `forge/.env`) | |

### Blockers — ALL CLEARED (2026-08-10 to 2026-08-12)

The seven blockers from the 2026-08-09 audit are resolved. Kept for the record:

1. ~~`forge-bot` has no access to the production WABA~~ — **cleared 2026-08-10.** Assigned
   full control on both WABAs in Business settings.
2. ~~Number attached to the WhatsApp Business phone app~~ — **moot.** By 2026-08-10 the
   number already showed `platform_type: CLOUD_API` and turned out to be registered and
   able to send. The `code_verification_status: NOT_VERIFIED` flag persists but does not
   block sending; `request_code` returns error 136024 permanently, which is what Meta
   returns for an already-registered number. Do not chase verification again.
3. ~~No payment method~~ — **cleared 2026-08-12.** Added on the `Pillexis Labs` WABA row.
4. ~~No templates~~ — **cleared 2026-08-10.** All five approved within minutes:
   `pillexis_booking_confirmation`, `pillexis_silence_nudge`, `pillexis_call_reminder_24h`,
   `pillexis_attendance_check`, `pillexis_no_show_reschedule` (category UTILITY, language `en`).
5. ~~Forge points at the test number~~ — **cleared 2026-08-10.** Production Railway has the
   full env block: `WHATSAPP_PHONE_NUMBER_ID=1242052502320950`, `WHATSAPP_USE_TEMPLATES=1`,
   `WHATSAPP_WORKER_INLINE=1`, `WHATSAPP_APP_SECRET`, `CAL_WEBHOOK_SECRET`, token, verify
   token, graph version. Staging keeps the test number and free-form sends.
6. ~~Webhook~~ — **cleared 2026-08-12.** App callback verified at
   `https://forge.pillexislabs.com/api/whatsapp/webhook` with the `messages` field
   subscribed (plus template-status fields), the WABA subscribed to the app
   (`subscribed_apps` returned success), and the app **published (Live mode)** — required
   for production webhook delivery. Privacy and terms pages were shipped to the website
   for the publish requirements (`pillexislabs.com/privacy`, `/terms`).
7. ~~Send one test message~~ — **cleared 2026-08-12.** `send-test` delivered the reminder
   template from +91 63649 37775 to the founder's phone (918967265150), confirmed on screen.

### Verification commands

**Use `curl`, not Python.** Meta and Cal.com both sit behind Cloudflare, which blocks the default
`python-urllib` user agent with **error 1010**. That looks like an auth failure and is not. This
cost real time on 2026-08-08.

```bash
cd forge
TOK=$(grep '^WHATSAPP_ACCESS_TOKEN=' .env | cut -d= -f2- | tr -d '"')

# the number: want platform_type CLOUD_API and code_verification_status VERIFIED
curl -s "https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>?fields=display_phone_number,verified_name,code_verification_status,name_status,quality_rating,status,platform_type,throughput" \
  -H "Authorization: Bearer $TOK" | python3 -m json.tool

# every template and its status: want all APPROVED
curl -s "https://graph.facebook.com/v23.0/4407182709496656/message_templates?fields=name,status,category,language&limit=50" \
  -H "Authorization: Bearer $TOK" | python3 -m json.tool

# token scopes and identity
curl -s "https://graph.facebook.com/v23.0/debug_token?input_token=$TOK&access_token=$TOK" | python3 -m json.tool
```

`forge-bot` cannot enumerate businesses (that needs `business_management`), so WABA and phone
number ids have to come from the UI.

### What already works

Do not rebuild any of this. Per `PROGRESS.md`, the automation **sends for real** on the test
number today: a Cloud API provider module and queue worker (`npm run crm:whatsapp-worker`,
`--watch` for continuous) draining `next_message_at` through confirmation, one silence nudge, the
24 hour reminder and the 2 hour attendance check, all audited with Meta message ids. The inbound
webhook is signature verified, records replies, classifies confirm, reschedule and stop, escalates
free form to a founder, moves state and acknowledges. Consent is enforced on every send enabling
transition, opt out is a one way latch, and closing a deal stops its queue.

**The only missing piece is the production number.** It is the gate on the live sales demo.

### Related roadmap items

`ROADMAP.md` sections A to D, added 2026-08-07:

- **A. Production WhatsApp sender**, this document
- **B. Trigger abstraction and inbound lead capture.** The built workflow starts from a Cal
  booking. Six accounts start from an ad click landing in WhatsApp with no booking object
- **C. Demo scope in production**, so sales has a stable surface without giving staging sales duty
- **D. Deal amount and source attribution**, because Forge measures cost per booked call and 52
  bookings have produced one closed deal

### The demo that sells

Not a dashboard. Mid call: *"message this number right now."* The prospect WhatsApps the line and
watches themselves get greeted, qualified and booked in the thread they are already looking at.
That needs zero fixture data and no screenshot competes with it. It is also the reason the
production number is the top priority rather than the fifth.

---

## Progress log (2026-08-10 → 2026-08-16)

### What shipped in code (commit `909a6ff`, on `master`, deployed)

- **Template sending.** Every automated send carries its approved template name and
  parameters (`DueSend.template` in `crm-whatsapp-rules.ts`). With `WHATSAPP_USE_TEMPLATES=1`
  (production) the worker sends templates, so messages deliver outside the 24 hour window.
  Staging keeps free-form text on the test number. A test pins each workflow state to its
  template name so code and Meta cannot drift.
- **Cal.com intake.** New public endpoint `POST /api/cal/webhook` (`crm-cal-intake.ts`):
  verifies the Cal HMAC signature, matches or creates the contact by email, reuses an open
  deal or creates one (`intro_call_booked`, owner anurag), records the booking in
  `crm_bookings` (idempotent on the Cal uid), stores form answers as qualification data,
  and when the form includes a phone number it grants consent and queues the WhatsApp
  confirmation automatically.
- **Ops scripts.** `scripts/whatsapp-production-setup.sh` (status, templates, verify,
  subscribe-app, send-test) and `scripts/whatsapp-production-cutover.sh` (railway-vars,
  cal-webhook, test-booking). Legal pages committed to the website repo (`e2653f1`).

### Decisions made along the way

- **Production URL is `https://forge.pillexislabs.com`** everywhere (custom domain), not
  the Railway-generated URL.
- **Display name / username / profile picture** on the number are unpolished. The Edit
  buttons appeared dead in the founder's browser — likely the ad blocker; retry in
  incognito. Display name changes go through Meta review; the profile picture and
  description can be set via the business profile API instead.
- **Cal booking limits** set on the intro-call event: max 2 bookings per day, 2 hours
  minimum notice. Cal enforces the daily cap on all future dates, including days that
  already exceed it.
- **Do not hard-block leads who answer "No" to paid discovery.** Cal booking questions
  have no branching. The chosen approach: keep the required select, let Forge flag "No"
  answers via the qualification data, decide per lead. Revisit a Cal Routing Form or an
  in-house pre-qualification form only if data shows wasted calls (decision 2026-08-12,
  full trade-off discussion in the session; in-house form impacts Pixel events,
  fbc/fbp forwarding, CAPI dedup, and this intake webhook).

### Remaining to go live end to end (as of 2026-08-16)

1. **Cal booking form: WhatsApp number field.** Enable the built-in Phone field on the
   intro-call event: label `WhatsApp number`, required, helper text saying confirmations
   and reminders arrive there. The intake reads `attendee.phoneNumber` first. (May already
   be done in the UI — the API key could not read the event's fields to confirm.)
2. **Register the Cal → Forge webhook** (confirmed NOT registered as of 2026-08-16):
   `scripts/whatsapp-production-cutover.sh cal-webhook https://forge.pillexislabs.com/api/cal/webhook`
3. **End-to-end test:**
   `scripts/whatsapp-production-cutover.sh test-booking https://forge.pillexislabs.com "$(cat ../keys/cal-webhook-secret-forge.txt)" 918967265150`
   Expected: `ok:true` + lead in the production CRM + confirmation template on the phone.
   Then reply "confirm" to test the inbound leg (webhook → classify → state move → ack).
   Delete the Test Founder lead afterwards.
4. **Optional polish:** number profile picture (brand logomark) and description; footer
   links to /privacy and /terms on the website; Meta review of a display-name change if
   the current name needs changing.

### Gotchas worth remembering

- `request_code` error **136024** on this number = already registered. Not a throttle. Stop.
- Sending **to the production number itself** returns `(#100) Invalid parameter`.
- The **WABA-level** `subscribed_apps` call is separate from the app-dashboard webhook
  config; both are required for inbound delivery, plus the app must be **published**.
- Cal.com signs webhooks with a plain hex HMAC (no `sha256=` prefix), header
  `x-cal-signature-256`.
- The Cal API key in `keys/.env` cannot list webhooks created in the Cal UI (scope) — a
  "none" listing does not prove the website CAPI webhook is gone.
