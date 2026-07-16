# Session state · marketing-analytics intelligent product

**Last updated:** 2026-07-04
**Resume by:** read this file, then open `intelligent-analytics-plan.html` in a browser for the visual plan.

---

## TL;DR — where we are

1. Consolidated plan drafted (Phases 0–6) and rendered as HTML at `intelligent-analytics-plan.html`.
2. North star locked: **₹ cost per booked call ↓** (business) + **Anurag opens dashboard before Ads Manager** (product).
3. Aha moment defined: **the second morning brief** — the one that shows the first brief's action actually moved CPL.
4. AI agent shape proposed: **Ad Ops Copilot** — one agent, three modes (brief / chat / act).
5. Native vs web: **web wins**, morning brief delivered via Forge/email — no parallel native app.
6. New discussion opened at end of session: user wants the agent to **handle a bunch of load and do tasks**, not just draft. Autonomy tier framework proposed (L1/L2/L3), awaiting user's answer on which load bucket to offload first.

---

## What was decided (durable — do not reopen without cause)

| # | Decision | Source |
|---|---|---|
| D1 | North star metric is `Schedule` cost (Cal.com booked call), target ₹800 from current ₹1,650. | Existing memory + confirmed today |
| D2 | The dashboard is a product, not a script. Every insight carries severity + category + reason + action + evidence. | Existing memory |
| D3 | Default recommendation is never "spend more" — always root-cause first. | Existing memory |
| D4 | Rule severity ranking: attribution/signal bugs > budget waste > creative underperformance. | Existing memory |
| D5 | Build phases in order 0 → 6, each one shippable. Not a big-bang. | Today's plan |
| D6 | Use web (Next.js at `localhost:3000`) for all new surfaces. Deliver morning brief via Forge or email, no parallel native app. | Today |
| D7 | AI agent reads the same typed `Insight` objects the UI reads — no parallel truth path. | Today |
| D8 | Two models: Haiku 4.5 for daily brief (fast, cheap), Opus for chat panel (reasoning). Gemini for creative visual analysis. | Today |
| D9 | Every agent-executed action writes to `insights_history` with `source: agent` so Phase 5's ΔCPL join can measure agent ROAS. | Today |

---

## What's on the table but not confirmed (proposed today)

### Autonomy tier framework (proposed 2026-07-04, awaiting user)

Three tiers for agent actions. Tasks move up as outcome history proves the agent.

| Tier | Trigger | Example load | Reversibility |
|---|---|---|---|
| **L1 auto** | rule fires + guardrails pass | exclude Audience Network after 3d of junk traffic; run debug sync when action_type drifts; retry failed CAPI events | fully reversible in one click |
| **L2 draft-and-notify** | rule fires, agent drafts, user accepts from phone | pause an ad; duplicate a winner into own set (with budget cap); write a "week in ads" client brief | reversible, but touches money/comms |
| **L3 confirm-modal** | any spend-limit change, creative write, client-facing send | raise campaign daily budget; write new ad copy; send follow-up to a booked lead | ambiguous outcome, needs judgement |

**If user confirms:** save this as a project memory so it applies to all future agent design decisions.

### The four load buckets — user needs to pick priority

Question posed to Anurag at end of session:

1. **Ad ops** — the campaign runs itself between weekly reviews (pause/fund/exclude, budget nudges within a ceiling)
2. **Creative production** — agent generates ad variants + landing page copy tests continuously, user approves on phone
3. **Content + distribution** — blog drafts, LinkedIn/Twitter posts, competitor tracking, cold outreach
4. **Client ops** — lead qualification from Cal.com bookings, proposal drafting, weekly client status briefs

Architecture differs by bucket: (1) is a *decision* engine, (2)/(3) is an *artifact* engine, (4) is a *coordination* engine.

**Blocking:** Phase 6 (Ad Ops Copilot) scope depends on this answer.

---

## Open questions (blocking specific phases)

| Q | Blocks | Recommendation | User answer |
|---|---|---|---|
| Which load bucket first (1/2/3/4)? | Phase 6 scope | — | pending |
| Confirm L1/L2/L3 autonomy framework? | Phase 6 design | yes, ship as project memory | pending |
| UI location for creative diagnostic — inline on `/` (A) or dedicated `/ads` route (B)? | Phase 4 | B | pending |
| Primary Gemini use case — visual creative analysis (1), hook-mismatch (2), insight summariser (3), rule-authoring copilot (4)? | Phase 4 | 1 | pending |
| Where does the morning brief land — email, Forge card, both? | Phase 6 | both (email as default, Forge card as bonus) | pending |
| Meta ads_management scope: apply for it now for L1/L2 writes, or start read-only? | Phase 6 | apply now — needed before agent can act | pending |

---

## Files created / touched today

| Path | What |
|---|---|
| `marketing-analytics/plans/intelligent-analytics-plan.html` | Full visual plan with 5 SVG diagrams, north star, aha moment, phases, agent architecture, web-vs-native verdict, timeline |
| `marketing-analytics/plans/SESSION_STATE.md` | This file |
| `keys/.env` | (created earlier this week) `GOOGLE_AI_API_KEY` for Gemini, mode 600, folder mode 700 |
| `keys/.gitignore` | whitelists `.gitignore` + `README.md` only |
| Tasks #1–#7 | Phases 0–5 + product decisions, all pending |

---

## The plan at a glance (from HTML preview)

Phases in order:

- **Phase 0** (30 min) — Confirm SCHEDULE_ACTION alias via debug pull. Gate for Phase 1.
- **Phase 1** (3–4 h) — Signal integrity: multi-alias support, `debug_meta_actions` table, 14-day lookback, target_cpl schema.
- **Phase 2** (4–6 h) — Insight engine v2: typed `Insight` schema, migrate 7 existing rules, add 7 Bucket A rules, `insights_history` table.
- **Phase 3** (1 day) — Bucket C data pulls: quality/engagement/conversion rankings, placement + demographic breakdowns, EMQ from Datasets API.
- **Phase 4** (1–2 days) — Creative intelligence: per-ad 4-level diagnostic (Attention/Persuasion/Book/Sustainability) with weakest-link + Gemini visual analysis.
- **Phase 5** (half day) — Outcome tracking: Did this / Ignored / Snooze buttons, weekly ΔCPL join, self-retiring rules.
- **Phase 6** (1–2 days) — Ad Ops Copilot: brief mode (Haiku 4.5 at 07:05), chat mode (Opus in dashboard), act mode (guarded write tools).

**Total:** ~7 working days full arc. First value ships end of Day 1.

---

## AI agent — Ad Ops Copilot (spec so far)

**Modes:**
- `brief` — daily 07:05, Haiku 4.5, ranks the day's insights into a scannable card, delivered via email + Forge
- `chat` — in-dashboard panel, Opus, answers "why" with cited evidence rows
- `act` — guarded writes via Meta Marketing API

**Read tools (open):**
- `sql_query(sql)` — read-only Postgres
- `meta_live_insights(params)` — fresh /insights pull
- `gemini_analyze(image_url, prompt)` — creative visual + copy analysis (cached per creative_hash)
- `recall_insight_history(rule_id | date)` — "did this action work last time?"

**Write tools (guarded — confirm-modal, always logged):**
- `pause_ad(ad_id)`
- `exclude_placement(campaign_id, placement)`
- `duplicate_ad_set(ad_set_id, config)`
- `note_outcome(insight_id, outcome)` — closes the ROAS loop

**Never autonomous by default.** Autonomy tiers (L1/L2/L3) let some actions move to L1 once history proves the agent — this is the framework the user asked to explore today.

---

## Where to resume

1. Read this doc.
2. Open `intelligent-analytics-plan.html` for visual context.
3. Check the "Open questions" table above — anything answered since last session?
4. If user has picked a load bucket (Q1) and confirmed autonomy tiers (Q2), start Phase 6 design.
5. If not, resume with the four-bucket question. Suggested opening: *"Before I refine the agent, tell me which of these four buckets is eating the most hours today: ad ops, creative production, content/distribution, or client ops?"*
6. Phase 0 debug pull is a 30-minute independent task — can be run in parallel any time; doesn't block the discussion above.

---

## Not saved to memory yet (waiting for confirmation)

These are candidates for durable memory once user confirms — recorded here so future me remembers to save them:

- **Autonomy tier framework (L1/L2/L3)** — save as feedback-type memory when confirmed.
- **Web-not-native verdict** for marketing-analytics — save as project memory once user confirms in next turn.
- **Ad Ops Copilot as canonical name** for the AI agent inside marketing-analytics — save as project memory if we ship it.
- **North-star duality (business metric + product metric)** — save as project memory. Product metric is a leading indicator of business metric.
