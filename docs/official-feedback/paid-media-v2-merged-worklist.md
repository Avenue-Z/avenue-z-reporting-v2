# Paid Media v2 — Merged Work List

> **What this is.** The two source documents merged into one list of what actually
> gets built. Every row traces back to a specific element ID in one of the two
> scorecards, so any line here can be checked against the source document.
>
> **Sources**
> - Tab **Q&A** → [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) (IDs `D1-Bnn`, comments `[a]`–`[i]`)
> - Tab **Decisions for Approval** → [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) (IDs `D2-Bnn`, comments `[a]`–`[x]`, inline answers `IN-1`–`IN-5`)
>
> **This list is derived.** The scorecards are the 1:1 record of what was said.
> Where this list and a scorecard disagree, **the scorecard wins**.

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

# A. Blocked — must be resolved before the Overview can be built

## A1. Where does "Leads" come from? — **BLOCKED**

| | |
|---|---|
| **Trace** | Q&A: `D1-B26` (Greg, Jul 21) vs Decisions: comment `[f]` (Dianna, Jul 30) |
| **Conflict** | Greg: use the platform "leads" event, drop Conversions. Dianna: *"The number of leads should come from hubspot and not from the ad platforms... it should be spend across all platforms / hubspot leads attributed to AVZ"* |
| **Blocks** | Overview **Leads** and **Cost per lead** (2 of the 4 agreed metrics), plus Decisions items 1 and 3 which both assume platform leads |
| **Verified cost** | **(a)** Renaissance has **no HubSpot connection at all**: `scripts/seed.ts:77` sets `hubspotTokenEnvVar: null` and `hubspot-performance` is not in its `enabledReports`. Only `avenue-z` is wired. **(b)** **No paid-channel attribution exists for any client**: zero `hubspot` references in `lib/paid-search`, `lib/meta`, `lib/linkedin`, and `lib/hubspot` holds only `client.ts` + `rate-limit.ts`. |
| **So it is** | A client onboarding step **plus** a net-new attribution model. Not a field swap. |
| **Owner** | Dianna |

## A2. Does blended Clicks sum two definitions? — **BLOCKED**

| | |
|---|---|
| **Trace** | Decisions `D2-B11`–`D2-B14` (the ask), comment `[d]` (Dianna, Jul 30) |
| **Situation** | Doc proposed switching Meta to all clicks. Dianna: *"Keep link clicks and label it that way. Meta doesn't have a way to pull clicks (all) anymore"* |
| **The gap** | Fine on Meta's own tab. But the Overview shows **one combined Clicks number**, so it would add Meta's link clicks to Paid Search and LinkedIn's all clicks. A label does not fix a sum of two different things. **Nobody addressed this.** |
| **Blocks** | Overview **Clicks** (1 of the 4 metrics) |
| **Decision needed** | Sum with a footnote, or show Clicks per channel only and keep it out of the blended line |
| **Owner** | Dianna |

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
| **BLOCKED** | **2** (A1 leads source, A2 blended clicks) |
| **CONFIRM** (one word each) | **4** (C1, C2, C3, F2) |
| **READY to build** | **19** |
| Out of scope | 3 |

**Nothing in D (Paid Search) or E (Meta) is blocked.** Both blockers sit on the
Overview's metric values only. Paid Search table totals, the keyword filter, and the
Cost/LPV fix can all start immediately.

**Highest-value single item:** A1. It decides whether Leads is a platform metric or a
HubSpot-attributed one, which changes Req 1's data layer, Decisions items 1 and 3, and
whether Meta's lead gap matters at all.
