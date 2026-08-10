# WhatsApp production setup and the demand behind it

**Last verified: 2026-08-09** against the Meta Graph API with the `forge-bot` token.

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

### Blockers, in order

**1. `forge-bot` has no access to the production WABA.** Confirmed: a Graph call to
`4407182709496656` returns `GraphMethodException` code 100 subcode 33. The system user is only
assigned to the Test WABA. Until this is fixed nothing about the production number can be read or
managed programmatically.

Fix: Business settings, Users, System users, `forge-bot`, Add assets, WhatsApp accounts, Pillexis
Labs, full control.

**2. The WABA is listed as `WhatsApp Business App`, not Cloud API.** The number is attached to the
WhatsApp Business phone app. A number lives in one place at a time, so it cannot serve the Cloud
API until it is deregistered from the app and added under WhatsApp Manager, API Setup, with SMS
verification and a 6 digit PIN.

**3. No payment method on the WABA.** Meta bills per message. Template sends will fail without it.

**4. No templates yet.** Five are needed to match what the worker already sends: booking
confirmation, silence nudge, 24 hour reminder, attendance check, reschedule offer. Template bodies
must match the implemented copy exactly, so approval does not silently change what the code sends.

**5. Forge still points at the test number.** `WHATSAPP_PHONE_NUMBER_ID` in `forge/.env` is
`1157420147464982`. Must change in `.env` **and** in Railway production.

**6. Webhook.** Point at `https://forge-production-fc70.up.railway.app/api/whatsapp/webhook` and
subscribe to `messages`. Signature verification is already implemented.

**7. Send one test message** to a founder number before using it on a call.

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
