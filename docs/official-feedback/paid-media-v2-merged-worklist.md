# Paid Media v2 — Merged Work List

> **What this is.** The two source documents merged into one list of what actually
> gets built. Every row traces back to a specific element ID in one of the two
> scorecards, so any line here can be checked against the source document.
>
> **Sources**
> - Tab **Q&A** → [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) (IDs `D1-Bnn`, comments `[a]`–`[i]`)
> - Tab **Decisions for Approval — Paid Media** → [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) (IDs `D2-Bnn`, comments `[a]`–`[x]`, inline answers `IN-1`–`IN-5`)
>
> **This list is derived.** The scorecards are the 1:1 record of what was said.
> Where this list and a scorecard disagree, **the scorecard wins**.

## Prior work: there is already a technical design, and it is unreviewed

**[PR #164 "Paid media v2 → dev"](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/164)**
is open in draft on branch `ave-z-reporting-paid-media-v2`. It holds a **1,296-line
technical design** (`docs/superpowers/specs/2026-07-22-paid-media-v2-design.md`, **on
that branch, not this one**) plus an earlier approval doc. Created 2026-07-22, untouched since.

**Paul reviewed this design, and the "Decisions for Approval — Paid Media" tab was
written as a result.** The review happened **off GitHub**, so the PR carries no review
artifact (verified via the GitHub API on 2026-07-30: zero formal reviews, zero inline
comments). The absence on GitHub is a missing paper trail, not a missing review.

**That design and this work list are two halves of the same thing, not duplicates.**

| | Technical design (PR #164) | This work list (PR #175) |
|---|---|---|
| Dated | 2026-07-22 | 2026-07-30 |
| Answers | **How** to build it | **What** was decided |
| Ends with | 11 open decisions `D1`–`D11` | The answers to 9 of those 11 |

The design was written **before** the stakeholder answers landed (Jul 28–30). It asks
the questions; the scorecards behind this list contain the replies. Neither is
complete alone.

### The design's open decisions, now answered

| Design | Decision | Answered by | Row here |
|---|---|---|---|
| `D1` | Overview as default landing | Dianna `[j]` Jul 30 | **B6** |
| `D2` | How a Meta "lead" is defined | Greg `[x]` Jul 29, then Dianna `[f]` Jul 30 | **A1 — still blocked** |
| `D3` | Blended Clicks: link vs all clicks | Dianna `[d]` Jul 30, then **Paul verbally Jul 30** | **A2 — resolved** |
| `D4` | Unconfigured or erroring channel | Dianna `[h]` Jul 30 | **B4** |
| `D5` | Overview commentary block and owner | Dianna `[l]` Jul 30 | **B7 / C1** |
| `D6` | Totals on all tables or only two | Amir `IN-1` | **D1** |
| `D7` | Region total: top 10 or all regions | Amir `IN-2` | **D4 / C2** |
| `D8` | Total Leads: plain sum or de-duplicated | Amir `IN-3` | **D5** |
| `D9` | Keyword filter adjustable or fixed | `D2-B80` ("can be cleared") | **D6** |
| `D10` | Blended CPL when a channel has spend but no leads | partly Dianna `[f]` | folded into **A1** |
| `D11` | Rollup reuses channel KPI fns, or fetches raw totals | **unanswered, engineering** | **§E3 constraints, still open** |

**9 of 11 answered.** The design named `D2` "the highest-value one to resolve first" on
Jul 22. It is still the only true blocker, reached independently by both passes.

## The six original requirements

The design doc records these verbatim as the root source. **The Q&A tab covers Reqs 1–4
only. Reqs 5 and 6 have no stakeholder input at all**, which is why neither scorecard
mentions them.

| # | As given |
|---|---|
| 1 | Add an Overview subpage for Paid Media that shows a rollup of performance across Paid Search, Meta & LinkedIn subpages. |
| 2 | On Paid Search subpage, add "Total Leads" to the top of the "Leads by Action" table and at the bottom of the "Region → DMA Breakdown" table. These values should be a sum of the subtotals in the tables. |
| 3 | On Paid Search subpage, add a default filter view to the keyword table at the bottom for the column "Clicks" and filter to 10 clicks or more. |
| 4 | On Meta Advertising subpage, investigate the calculation of "Cost / LPV" and verify it's correctly displaying. |
| 5 | On Meta Advertising subpage, the "Top Regions by Spend" chart's "Spend" value formatting should be $X,XXX.XX. |
| 6 | Take a look at LinkedIn subpage - if there are any API issues. |

## The merge rule

Verified against timestamps, not assumed:

```
Q&A body (Req 1-4, the asks)
  -> Q&A answers .............. Jul 21        (all 9 events, one day, closed)
    -> Decisions body ......... Jul 23        (written FROM those answers, cites them 7x)
      -> Decisions answers .... Jul 28-30     <- AUTHORITATIVE, newest input
```

**Latest dated answer wins.** Two consequences:

1. The **Decisions doc body is not the decision.** Its own answers reversed three of
   its proposals (items 2, 4, 10). Building from that body would be wrong three times.
2. Dianna's Jul 30 batch is the newest input anywhere and **overrides Q&A answers**
   where they conflict. That is the source of BLOCKER 1.

## Status legend

| Mark | Meaning |
|---|---|
| **READY** | Decided, unambiguous, can be built now |
| **CONFIRM** | Decided, but one word from a named person removes all doubt |
| **BLOCKED** | Cannot be built until a decision lands |

---

# A. Blockers

**A1 is the only remaining blocker.** A2 was resolved verbally by Paul on 2026-07-30
and is kept here with its full history rather than moved, so the reasoning stays
visible.

## A1. Where does "Leads" come from? — **BLOCKED**

| | |
|---|---|
| **Trace** | Q&A: `D1-B26` (Greg, Jul 21) vs Decisions: comment `[f]` (Dianna, Jul 30) |
| **Conflict** | Greg: use the platform "leads" event, drop Conversions. Dianna: *"The number of leads should come from hubspot and not from the ad platforms... it should be spend across all platforms / hubspot leads attributed to AVZ"* |
| **Blocks** | Overview **Leads** and **Cost per lead** (2 of the 4 agreed metrics), plus Decisions items 1 and 3 which both assume platform leads |
| **Verified cost** | **(a)** Renaissance has **no HubSpot connection at all**: `scripts/seed.ts:78` sets `hubspotTokenEnvVar: null` and `hubspot-performance` is not in its `enabledReports`. Only `avenue-z` is wired. **(b)** **No paid-channel attribution exists for any client**: zero `hubspot` references in `lib/paid-search`, `lib/meta`, `lib/linkedin`, and `lib/hubspot` holds only `client.ts` + `rate-limit.ts`. |
| **So it is** | A client onboarding step **plus** a net-new attribution model. Not a field swap. |
| **Owner** | Dianna |

## A2. Does blended Clicks sum two definitions? — **RESOLVED, pending one detail**

> ### ⚠️ Provenance: this decision is NOT from either source document
>
> **Source: Paul, verbally, relayed by Thomas, 2026-07-30.** Every other row in this
> file cites a document element ID. This one cannot, because it was decided in
> conversation. It is recorded here so the build is not blocked, and it is flagged
> so nobody later mistakes it for something traced to the docs. **Paul to confirm it
> in his review of PR #175.**

| | |
|---|---|
| **Trace** | Decisions `D2-B11`–`D2-B14` (the ask), comment `[d]` (Dianna, Jul 30) |
| **Situation** | Doc proposed switching Meta to all clicks. Dianna: *"Keep link clicks and label it that way. Meta doesn't have a way to pull clicks (all) anymore"* |
| **The gap that blocked it** | Fine on Meta's own tab. But the Overview shows **one combined Clicks number**, so it would add Meta's link clicks to Paid Search and LinkedIn's all clicks. Neither document addressed this. |
| **DECISION (Paul, verbal)** | **Paid Search and LinkedIn aggregate. Meta is its own metric.** Both Paid Search and LinkedIn count all clicks, so they are the same unit and blend safely. Meta counts link clicks and stays out of that number. |
| **What this means concretely** | Blended **Clicks** = Paid Search + LinkedIn only. **Spend still blends across all three**, since spend is the same unit everywhere. Leads and Cost per lead remain blocked by A1. |
| **Still open (for Paul)** | **1.** Does "its own metric" mean Meta gets its **own card** on the Overview (e.g. "Link Clicks (Meta)"), or is it simply **excluded from the blend** and shown only in the per-channel breakdown already planned in B2? This changes the layout. **2.** Should the blended Clicks number be **labelled** as covering 2 of 3 channels? Dianna's own rule (B4, B5) is to never show a number that implies completeness we do not have, so a footnote looks consistent with her posture, but no document says it. |
| **Owner** | Paul (decision made), Dianna (aware, her `[d]` answer stands unchanged) |

---

# B. The Overview (Req 1) — everything else is ready

Source: Q&A `D1-B02`/`D1-B03`. All rows below are decided.

| # | What | Decision | Trace | Status |
|---|---|---|---|---|
| B1 | **Metric set and order** | **Spend, Clicks, Leads, Cost per lead**, in that order. CTR dropped, Conversions dropped as duplicative of Leads. | `D1-B12`, `D1-B14`, `D1-B26` → restated `D2-B78` | **READY** (values blocked by A1/A2) |
| B2 | **Layout** | **Both** a blended top line **and** a per-channel breakdown. Unanimous across Amir, Greg, Dianna. | `D1-B16`, `D1-B18`, `D1-B19` → `D2-B79` | **READY** |
| B3 | **Fallback if both is not feasible** | Blended is the default, per Greg. **Moot: both is feasible.** Dianna challenged the premise (`[t]`, unanswered) and she is right, nothing prevents both. | `D1-B20` → `D2-B79`, comment `[t]` | **READY** — answer Dianna |
| B4 | **Missing channel behavior** | **A missing channel makes the whole total unavailable.** This reverses the doc's own proposal (`D2-B28`). | `[h]` (Dianna, Jul 30) beats `D2-B28` | **READY** |
| B5 | **Broken metric feeding a formula** | Show the final metric as NA or erroring, never a partial number that looks complete. | `D1-B30` (Dianna) → cited `D2-B27` | **READY** |
| B6 | **Default landing** | **Overview becomes the Paid Media landing page.** | `[i]` + `[j]` (Tina, Dianna) | **READY** |
| B7 | **Commentary box on Overview** | **No box.** Dianna: *"remove the commentary from this page."* | `D2-B39` + `[l]` | **CONFIRM** — see C1 |
| B8 | **Applies to both audiences** | Internal view **and** client portal. | `D2-B82` | **READY** |

**Build note (verified).** Paid Media already renders as one section with subsections
driven by `PAID_MEDIA_SUBSECTIONS` (`lib/constants.ts:174`), currently
`[{id: null, 'Paid Search'}, {id: 'meta'}, {id: 'linkedin'}]`. **AEO and GA4 already use
the exact shape B6 asks for**, with `{id: null, label: 'Overview'}` first
(`AEO_SUBSECTIONS`, `lib/constants.ts:159`). So nav and routing follow existing
precedent. The genuinely new work is the **cross-channel aggregation layer**, which has
no equivalent in the codebase.

---

# C. Needs one word to be certain

| # | Item | What was said | Why it is not fully settled | Ask |
|---|---|---|---|---|
| C1 | **Commentary scope** (`[l]`) | *"remove the commentary from this page"* | Could mean no box on the new Overview only, or strip commentary from all of Paid Media. All three existing tabs render `SharedPartsHeader` (`paid-search`, `meta-ads`, `linkedin-ads` `index.tsx`), so the wider reading is 3 more edits. | **Dianna** |
| C2 | **Region total scope** (`IN-2`) | *"You can kept this as is - just asking or there to be a total for all fields at the bottom"* | The doc offered three options (10 shown / all regions / both, `D2-B58`) and he picked none explicitly. Reads as "total everything". Comment `[o]` still has no reply. | **Amir** |
| C3 | **DMA de-duplication** (`IN-5`) | *"it should only define one DMA per conversion, so a little confused there"* | This is what makes the plain-sum total safe (`D2-B66`). Answered, but hedged. He separately approved the plain sum (`IN-3`), so we build it and verify against live data. | **Amir** |

---

# D. Paid Search changes — all ready

| # | What | Decision | Trace | Current code | Status |
|---|---|---|---|---|---|
| D1 | **Totals on every table** | **All tables on the Paid Search tab**, not just the two originally named. | `D1-B37` → `D2-B46` → `IN-1` | Campaign table **has** a totals row (`campaign-table.tsx:43,60`). Leads by Action, Region → DMA and Keywords have **none**. | **READY** |
| D2 | **Total Leads on Leads by Action** | Grand total at the **top** of the table, above the three category subtotals. | `D1-B31`, `D1-B32`, `D1-B36` | Renders 3 subtotals, no grand total (`leads-section.tsx:70-72`). `totalLeads` **already exists** in the data layer as a plain sum (`lib/paid-search/leads.ts:19`), so no new query. | **READY** |
| D3 | **Total on Region → DMA** | Total at the **bottom** of the table. | `D1-B31`, `D1-B32` | No totals row at all. The only "Total" in the file is the *Total Regions* KPI card (`geo-section.tsx:33`). | **READY** |
| D4 | **Region total covers what** | Total **all regions**, while the table keeps displaying the top 10. | `IN-2` + the pattern in `IN-4` | UI slices to `rows.slice(0, 10)` (`geo-section.tsx:14`); the card already shows the true count from the full array, so both numbers are available. | **CONFIRM** (C2) |
| D5 | **Total Leads math** | **Plain sum.** | `D1-B34` (asked) → `IN-3` (Amir: yes) | Already a plain sum (`lib/paid-search/leads.ts:19`). | **READY** |
| D6 | **Keyword table default filter** | Default to **clicks ≥ 10**, and it can be cleared. | `D1-B42`, `D1-B43` → `D2-B80` | **No filter exists.** Table is capped at top 50 sorted by leads then cost (`lib/paid-search/keywords.ts:29`). New filter must interact with that existing cap. | **READY** |
| D7 | **If no keyword reaches 10 clicks** | **Show a message.** Dianna's call. Amir's 50-impression fallback was conditional on being easier to build, and it is not. | `D1-B46`, `D1-B48`, `D1-B49` → resolved `D2-B80` | No empty state for this case. | **READY** |
| D8 | **Keyword table total scope** | **Total over all keywords**, table displays only the top 10. This reverses the doc's proposal (`D2-B72`). | `IN-4` beats `D2-B72` | No total, and display cap is currently 50 not 10. Note `IN-4` says "top 10" while the code caps at 50. | **READY** — flag the 10 vs 50 mismatch |
| D9 | **Does the click filter affect Leads by Action?** | **No.** The filter is keyword-table only; Leads by Action carries no click data. | `D1-B38`, `D1-B40`, `D1-B41` | Independent components already. | **READY** |

---

# E. Meta changes

| # | What | Decision | Trace | Current code | Status |
|---|---|---|---|---|---|
| E1 | **Cost / LPV correctness** | Expected formula is **spend ÷ landing page views**. | Q&A `D1-B52` + comment `[i]` (Greg) | **Not computed that way.** Reads Meta's native `cost_per_landing_page_view` and wraps it in `Math.round()` (`lib/meta/kpis.ts:53`, `lib/meta/creative.ts:23`), so ~$0.70 renders `$1` on the card and `$0.00` on sub-dollar rows. Both the source field and the whole-dollar rounding are in question. | **READY** |
| E2 | **Meta Leads / Cost per lead** | **Hold both.** Greg: this channel is not focusing on lead generation for now. | `D2-B08` + `[b]` (Greg, Jul 28) | Meta has **no** lead or conversion metric at all (0 matches in `lib/meta/kpis.ts`), so there is nothing to hold. Consistent with the decision. | **READY** — but see A1 |
| E3 | **Meta clicks label** | Keep **link clicks**, labelled as link clicks. | `[d]` (Dianna) | Already `inline_link_clicks` labelled "Link Clicks" (`lib/meta/kpis.ts:37`). **No change needed on the Meta tab.** | **READY** (no-op) |
| E4 | **Meta bidding events** | Meta bids toward a **single optimization event set at ad-set level**, not all lead actions, and what counts as a Lead **varies per client**. | Q1 `D2-B87` + `[x]` (Greg, Jul 29) | Informational. Directly feeds A1: a single per-client event means platform leads are not comparable across clients. | **READY** as input |

---

# E2. Requirements 5 and 6 — no stakeholder input

Neither appears in the Q&A or Decisions tabs, so neither scorecard covers them. Both
come from the original six requirements and are designed in PR #164.

| # | What | Status | Detail |
|---|---|---|---|
| E5 | **Req 5 — Top Regions by Spend formats as `$X,XXX.XX`** | **READY** | Same root cause as F1. Meta's chart renders `BarChart` with **no** `valueFormat` (`meta-ads/geo-section.tsx:52`), and **no two-decimal currency formatter exists** in the codebase. Design's implementation map is 3 files: add a two-decimal helper to `lib/supermetrics/format.ts`, extend the `valueFormat` union in `bar-chart.tsx:21`, pass the descriptor. |
| E6 | **Req 6 — LinkedIn API investigation** | **RESOLVED 2026-07-22** | Not a code defect. The LinkedIn connection on Supermetrics had **de-authed** and was re-authenticated. Nothing in `lib/linkedin/` changes. |

---

# E3. Build constraints from the technical design

Not decisions, but they shape every row above and this work list was previously silent
on all three. Full detail in PR #164.

> **Heads up on IDs.** These are **PR #164's** identifiers and are prefixed `#164` to
> avoid collision. This work list also has rows called `C1`, `C2`, `C3` in section C
> above, which mean something entirely different (items needing one word of
> confirmation). `#164 C1` and `C1` are not the same thing.

| Design ID | Constraint | Why it matters here |
|---|---|---|
| **#164 `C1`** | **Every Paid Media change lands twice.** `app/dashboard/[clientSlug]/reports/page.tsx` (internal) and `app/portal/[clientSlug]/reports/page.tsx` (client-facing) both dispatch on `activeSection === 'paid-media'`. | Applying a change to one route only produces a section that behaves differently for staff and clients. Affects **every** row in B, D and E. |
| **#164 `C2`** | **The RSC boundary is CI-enforced.** `npm run check:rsc` is a required check and fails when a function prop crosses from a Server to a Client Component. **Meta's geo-section is a Server Component; Paid Search's is a Client Component.** | **Directly constrains F1 and E5.** The currency formatter must be passed as a **string descriptor**, never a function, or CI fails. `BarChart`'s `valueFormat?: 'currency'` was written as a string specifically for this. |
| **#164 `C3`** | **Only Renaissance is configured.** 1 of 7 clients has all three channels; the other six have none. | "A channel has no data" is the **normal** case, not an edge case. This is the evidence behind B4. |
| **#164 `D11`** | **The rollup cannot reuse `getPaidSearchKpis` / `getMetaKpis` / `getLinkedInKpis`.** They return `Kpi[]` with values already rounded and prior-period absolutes consumed internally by `delta()`, so blended deltas cannot be derived from them. | It must call the query wrappers (`awQuery`, `metaQuery`, `linkedinQuery`) and the pure `transform*` functions directly, or each channel must export a raw-totals accessor. **Still an open engineering decision.** |

---

# E4. Monitoring gaps surfaced by Req 6

Recorded in the design as follow-ups, not part of this work. Both are worth knowing
before the Overview ships.

| Gap | Detail |
|---|---|
| **The health sweep never probes Meta or LinkedIn** | `app/api/health/sweep/route.ts` iterates `enabledReports` and never passes a subsection, so `paid-media` always resolves to the default subsection. A fault confined to Meta or LinkedIn is silent on both surfaces. **When Overview takes `id: null` (B6), the sweep's coverage silently changes**: it starts probing the Overview and stops probing Paid Search. |
| **The Connections page cannot report a broken paid channel** | `app/dashboard/connections/page.tsx` hardcodes `META`, `GOOGLE_ADS` and `LINKEDIN` to `false`, so all three render `NOT_CONFIGURED` permanently, including for Renaissance where all three are live. |

---

# F. Cross-cutting

| # | What | Decision | Trace | Current code | Status |
|---|---|---|---|---|---|
| F1 | **Currency precision** | *"they should match. Make them all with cents so it's exact"* | `[u]` (Dianna, Jul 30) on `D2-B81` | **Root cause confirmed.** `usd()` is `'$' + Math.round(n)`, so it **never** shows cents (`lib/supermetrics/format.ts:1`). **Meta's Top Regions chart charts `spend` without `valueFormat="currency"`** (`meta-ads/geo-section.tsx:52`), so Recharts prints raw decimals, while the card above uses `usd()`. **LinkedIn's identical chart does pass the prop** (`linkedin-ads/geo-section.tsx:26`). Dianna's observation is exactly right and it is a Meta-vs-LinkedIn inconsistency. | **READY** |
| F2 | **Scope of F1** | Her wording is "make them **all** with cents". | `[u]` | `usd()` is shared across every section, so changing it in place is a **platform-wide** visual change well beyond Paid Media. Safer: add a cents-capable formatter and apply it to Paid Media only. **Worth confirming she means Paid Media, not the whole product.** | **CONFIRM** |

---

# G. Explicitly out of scope

| Item | Why |
|---|---|
| Whitney and all other clients | Q&A and Decisions are both scoped to this work; Renaissance is the only client with all three channels connected (`D2-B27`) |
| Tabs 2, 4, 5, 6 of the Google Doc (PRD, Technical Feedback, Stakeholder QA, Handoff) | Not part of the two tabs under review. The PRD tab carries 1 comment, unrelated. |
| Meta tracking different events for lead magnets | Explicitly deferred to channel-specific sections, not the Overview (`D2-B27` / `D1-B27`) |

---

# Summary

| Bucket | Count |
|---|---|
| **BLOCKED** | **1** (A1 leads source) |
| **CONFIRM** (one answer each) | **5** (A2 layout detail, C1, C2, C3, F2) |
| **READY to build** | **21** (19 from the two tabs + E5, E6 from the original requirements) |
| **Open engineering decision** | **1** (`D11` rollup architecture, PR #164) |
| Out of scope | 3 |

## Suggested build order

From the design doc's sequencing, updated for the answers that have since landed.
Each its own PR against `dev` per the Stage 1 gate.

| Order | Req | Why here | Gated on |
|---|---|---|---|
| 1 | **Req 4** — Cost / LPV (E1) | One line plus a test. Confirmed defect, formula confirmed by Greg, zero open decisions. **Currently shows clients `$0` for real costs.** Highest value per unit of effort. | nothing |
| 2 | **Req 5** — Spend formatting (E5, F1) | Three files. Watch **C2**: string descriptor only. | F2 (cents scope) |
| 3 | **Req 3** — keyword filter (D6, D7, D8) | | nothing, `D9` answered |
| 4 | **Req 2** — table totals (D1–D5) | | C2 (region scope) |
| 5 | **Req 1** — Overview | Largest by a wide margin | **A1**, plus `D11` |
| — | ~~Req 6~~ — LinkedIn | Resolved 2026-07-22 | done |

**Nothing in D (Paid Search) or E (Meta) is blocked.** The one remaining blocker sits
on the Overview's Leads and Cost per lead only. Paid Search table totals, the keyword
filter, and the Cost/LPV fix can all start immediately.

**Highest-value single item:** A1. It decides whether Leads is a platform metric or a
HubSpot-attributed one, which changes Req 1's data layer, Decisions items 1 and 3, and
whether Meta's lead gap matters at all.

## Decisions taken outside the source documents

Anything here was decided in conversation, not in the Q&A or Decisions tabs, so it
carries no element ID. Kept in one place so the distinction never blurs.

| # | Decision | Source | Status |
|---|---|---|---|
| A2 | Blended Clicks aggregates **Paid Search + LinkedIn**. **Meta is its own metric**, kept out of that number. | **Paul, verbal, relayed by Thomas, 2026-07-30** | Recorded, **awaiting Paul's confirmation in PR #175**, plus the two open details listed in A2 |
