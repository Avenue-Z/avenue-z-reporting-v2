# Review Request — Paid Media v2 requirements capture

**For:** Paul
**From:** Thomas
**Branch:** `feat/paid-media-v2-feedback` · **PR:** #175
**Date:** 2026-07-30
**Status:** No code written yet. This is a requirements-capture review, not a code review.

---

## What we need from you

Three things, in priority order:

1. **Review each scorecard on its own.** There are two, one per source tab. They are
   the single source of truth for this overhaul, so if either is a bad read of the
   source, everything downstream is wrong.
   - [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) — tab **Q&A**
   - [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) — tab **Decisions for Approval — Paid Media**
2. **Then review the merged work list**, which is the two scorecards combined into what
   actually gets built: [`paid-media-v2-merged-worklist.md`](./paid-media-v2-merged-worklist.md).
   **Merging them was our call, not something either document told us to do.** The merge
   rule we chose is chronological precedence. If you would merge them differently, that
   changes the build.
3. **Confirm your own verbal decision on blended Clicks** (section below), and tell us
   whether the one remaining blocker is real. We are holding the Overview's Leads on it.

Push back hard. The point of this review is to catch a bad read now rather than after
we build.

### Read them in this order

| Order | File | What it is |
|---|---|---|
| 1 | `paid-media-v2-doc1-questions-scorecard.md` | Verbatim 1:1 record of the **Q&A** tab |
| 2 | `paid-media-v2-doc2-decisions-scorecard.md` | Verbatim 1:1 record of the **Decisions for Approval — Paid Media** tab |
| 3 | `paid-media-v2-merged-worklist.md` | **Derived.** The two merged into one build list, every row traced to a scorecard ID |
| 4 | this file | Why 1 item still blocks, what needs one word, and the decision you made verbally |

The first two are records. The third is a judgement call. Weight your scepticism
accordingly.

---

## Before you start: there is a second PR, with no review trail on it

**[PR #164 "Paid media v2 → dev"](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/164)**
holds a **1,296-line technical design** for this exact work
(`docs/superpowers/specs/2026-07-22-paid-media-v2-design.md`). It is open in draft on
`ave-z-reporting-paid-media-v2`, created **2026-07-22** and untouched since.
**Paul reviewed it, and the "Decisions for Approval — Paid Media" doc came out of that
review.** That review happened **off GitHub**, so the PR itself carries no review
artifact: zero formal reviews, zero inline comments, zero issue comments except the
Vercel bot. Verified through the GitHub API on 2026-07-30.

**It is not superseded by this PR. The two are halves of the same thing.**

| | PR #164, design | PR #175, this |
|---|---|---|
| Dated | Jul 22 | Jul 30 |
| Answers | **How** to build it | **What** was decided |
| Ends with | 11 open decisions `#164 D1`–`D11` | Resolutions for **8 of those 11** |

The design was written **before** the stakeholder answers landed (Jul 28–30). It asks
the questions; the scorecards here contain the replies. The full `D1`–`D11` mapping is
in the work list under "Prior work", where the design IDs are prefixed `#164` to keep
them distinct from this list's own `D1`–`D9` rows.

Two things worth knowing before you read either:

- **The design independently reached the same conclusions this PR did**, a week
  earlier, on separate evidence: `#164 D2` (Meta lead definition) named as *"the
  highest-value one to resolve first"* and still our only blocker, plus the Cost / LPV
  defect and the exact cents root cause.
- **The design covers six requirements, not four.** Reqs 5 and 6 have **no stakeholder
  input at all**, which is why neither scorecard mentions them. Req 6 (LinkedIn) is
  already **resolved**: the Supermetrics connection had de-authed and was
  re-authenticated on Jul 22.

**How would you like these handled?** Options as we see them: review both PRs together
and keep them separate, fold #164 into #175, or land #164 first as the design of record
and rebase this on top. We have not touched #164.

---

## What has been done

There is one Google Doc with 6 tabs. Two of them define this work. We built a
verbatim scorecard for each, then verified them against the live document through
the Drive API using a read-only service account.

| Deliverable | Covers | File |
|---|---|---|
| Scorecard 1 | Tab **Q&A** — "Questions for Paid Media Tab in Reporting" | [`paid-media-v2-doc1-questions-scorecard.md`](./paid-media-v2-doc1-questions-scorecard.md) |
| Scorecard 2 | Tab **Decisions for Approval — Paid Media** | [`paid-media-v2-doc2-decisions-scorecard.md`](./paid-media-v2-doc2-decisions-scorecard.md) |

### Verification, measured not asserted

| | Q&A | Decisions for Approval — Paid Media |
|---|---|---|
| Body elements captured | 52 / 52 | 57 / 57 |
| Distinct words captured | 359 / 359 | 489 / 489 |
| Comment threads | 4 | 15 |
| Replies | 5 | 8 |
| Comment units captured | 9 / 9 | 23 / 23 |
| Authors confirmed (not inferred) | 9 / 9 | 23 / 23 |
| In-body coloured feedback captured | 30 / 30 | 5 / 5 |
| Resolved comments hiding anything | 0 | 0 |

Document-wide, 21 comment threads exist and all 21 are accounted for: 19 on these two
tabs, 1 on the PRD tab (out of scope), 1 deleted tombstone with no content.

### Two capture traps worth knowing about

- **The HTML export is not trustworthy for comment counts.** It renders 24 comments on
  the Decisions tab; the document has 23. The line "OK to total as a plain sum" appears
  twice in the doc, and the exporter attached the same comment to both occurrences.
  The API is the authority whenever anchor text repeats.
- **Five decisions on the Decisions tab are written inline in the body in blue, not as
  comments.** They are all Amir's, covering items 7, 8, 9, 10 and Question 2. A
  comment-only read of that tab misses half the decisions.

---

## How the two documents relate

Verified against timestamps and citations, not assumed.

```
Q&A body (the asks: Req 1-4)
  -> Q&A answers ............. Jul 21   (all 9 events, same day, closed)
    -> Decisions body ........ Jul 23   (written FROM those answers)
      -> Decisions answers ... Jul 28-30  <- AUTHORITATIVE, newest input
```

The Decisions doc cites Q&A outcomes verbatim in seven places ("CTR and Conversions
dropped, per Amir and Greg", "which was Dianna's call", "blended is the default, per
Greg", and so on). So: **Q&A defines what was asked and how the team wants it to
behave. Decisions defines how we would build it.**

**Proposed merge rule: chronological precedence, latest dated answer wins.**

Two consequences we want you to sanity-check:

1. **The Decisions doc body is not the decision.** Its body was written Jul 23; the
   answers landed Jul 28-30 and reversed three of its own proposals (items 2, 4, 10).
   Reading that body as settled truth would build the wrong thing three times.
2. **Decisions is not purely downstream.** Items 2, 5, 6, 8 and 10 are net-new
   questions that appear nowhere in the Q&A. They surfaced only from getting into the
   build.

---

## Paul: confirm your own verbal decision

**On 2026-07-30 you told Thomas: Paid Search and LinkedIn should be aggregated, Meta
should be its own metric.** That resolved what was Blocker 2 (blended Clicks mixing
two definitions).

We have recorded it, but flagged hard, because **it is the only decision in the entire
work list that does not trace to a source document.** Everything else cites an element
ID in one of the two scorecards. This one cites a conversation. Please confirm the
wording in [`paid-media-v2-merged-worklist.md`](./paid-media-v2-merged-worklist.md) §A2
matches what you meant.

**Our reading of it:**

- Blended **Clicks** on the Overview = **Paid Search + LinkedIn only**. Both count all
  clicks, so they are the same unit and blend safely.
- **Meta stays out of that number.** It counts link clicks
  (`inline_link_clicks`, `lib/meta/kpis.ts:37`).
- **Spend still blends across all three**, since spend is the same unit everywhere.
- Leads and Cost per lead are untouched by this and remain blocked by A1.

**Two details we did not want to guess at:**

1. **Does "its own metric" mean Meta gets its own card** on the Overview, for example
   "Link Clicks (Meta)", **or** is it simply excluded from the blend and shown only in
   the per-channel breakdown already planned (B2)? This changes the layout.
2. **Should the blended Clicks number be labelled** as covering 2 of 3 channels?
   Dianna's own rule elsewhere (B4, B5) is to never print a number that implies
   completeness we do not have, so a footnote looks consistent with her posture, but no
   document says it.

This also means **Dianna's answer at comment `[d]` still stands unchanged** ("keep link
clicks and label it that way"). Your decision is about the blended rollup, not about
Meta's own tab, and the two are compatible.

---

## The blockers

**One blocker remains** after your decision above. It lands on Dianna.

### Blocker 1 — Where does "Leads" come from?

| | |
|---|---|
| **Conflict** | Greg, Jul 21 (Q&A): use the ad platform's lead event, drop Conversions. Dianna, Jul 30 (Decisions): *"The number of leads should come from hubspot and not from the ad platforms... it should be spend across all platforms / hubspot leads attributed to AVZ"* |
| **Why it blocks** | Leads and Cost per lead are 2 of the 4 agreed Overview metrics. Neither can be built until this is settled. |
| **Why it is not a tweak** | Two things are missing, both verified in the repo, not assumed: <br>**(a) Renaissance has no HubSpot connection at all.** `scripts/seed.ts:78` sets `hubspotTokenEnvVar: null` for renaissance, and `hubspot-performance` is not in its `enabledReports`. Only `avenue-z` has HubSpot wired (`HUBSPOT_ACCESS_TOKEN_AVENUE_Z`). So there is no token, no config, no data path. <br>**(b) No paid-channel attribution exists for any client.** `grep` for `hubspot` across `lib/paid-search`, `lib/meta` and `lib/linkedin` returns **zero** matches, and `lib/hubspot` contains no attribution logic (`client.ts`, `rate-limit.ts` only). "Leads attributed to AVZ" is a model that does not exist anywhere in the codebase yet. |
| **Size** | This is a client onboarding step **plus** a new attribution model, not a config change. It is the difference between "point the metric at a different field" and "build a new data source and decide how a HubSpot lead gets credited to a paid channel." |
| **Knock-on** | If leads come from HubSpot, it also undercuts Decisions item 1 ("hold Meta's Leads") and item 3 (blended CPL), both of which assume platform-reported leads. Req 1's whole metric set depends on it. |

### ~~Blocker 2~~ — Does blended Clicks sum two different definitions? — **RESOLVED**

> **Resolved verbally by Paul, 2026-07-30:** Paid Search and LinkedIn aggregate, Meta is
> its own metric. Kept below for the record so the reasoning stays visible. Two layout
> details remain open, listed in the confirmation section above.

#### Original statement of the problem

| | |
|---|---|
| **The situation** | Dianna, Jul 30: keep Meta on link clicks and label the column that way, because Meta no longer exposes clicks (all). That is fine on Meta's own tab. |
| **Why it blocks** | The Overview shows **one combined Clicks number**. Following her answer, it would add Meta's link clicks to Paid Search and LinkedIn's all clicks. A label does not fix a sum of two different things. Clicks is another of the 4 agreed metrics. |
| **What we need** | A call: sum anyway with a footnote, or show Clicks per channel only and drop it from the blended line. |
| **Note** | Nobody has addressed this. The Decisions doc raised the definition mismatch (item 2) and proposed switching Meta to all clicks; Dianna's answer removed that option without covering what the blended number then does. |

---

## What we are deliberately NOT treating as blockers

Listed so you can overrule us.

| # | Item | Our call |
|---|---|---|
| 1 | *"why wouldn't both be possible?"* (Dianna, Jul 30, unanswered) | Not a blocker. Both blended and per-channel **is** possible. The doc only listed blended as a fallback. We answer her and move on. |
| 2 | *"remove the commentary from this page"* (Dianna, Jul 30) | Ambiguous: no box on the new Overview only, or strip commentary across all of Paid Media. Small either way, so we build the narrow reading and confirm. |
| 3 | Amir on the Region total: *"You can kept this as is - just asking or there to be a total for all fields at the bottom"* | He did not pick from the three options offered. Reads as "total everything." One word of confirmation, not a blocker. |
| 4 | Amir on DMA de-duplication: *"it should only define one DMA per conversion, so a little confused there"* | Answered with hedging. He separately approved a plain sum, so we build the plain sum and verify against live data. |
| 5 | Decisions body reversed 3 times by its own comments | Not a contradiction. That is the review working. Only a risk if someone builds from the body. |
| 6 | Duplicated question line in item 10 | Cosmetic. Amir's answer there fits item 10's real question. Confirm and move on. |

---

## The merged work list

Full detail in [`paid-media-v2-merged-worklist.md`](./paid-media-v2-merged-worklist.md).
Every row there cites a scorecard element ID, so any line can be traced to a specific
line of the source document. Summary:

| Bucket | Count | |
|---|---|---|
| **BLOCKED** | **1** | A1 leads source only. A2 resolved verbally by Paul on 2026-07-30. |
| **CONFIRM** | **7** | A2 layout detail (**Paul**), plus C1–C6. Five gate a work row: B7→C1, D4→C2, D7→C4, B4→C5, D8→C6. C3 gates nothing; D5 stays READY and C3 is a post-build check. |
| **READY to build** | **17** | Overview 6 (B1,B2,B3,B5,B6,B8) · Paid Search 6 (D1,D2,D3,D5,D6,D9) · Meta 4 (E1–E4) · Req 5 (E5) |
| **Already resolved** | **1** | E6, Req 6 LinkedIn, fixed 2026-07-22 |
| **Open engineering decision** | **1** | `#164 D11` rollup architecture. Yours to call. |
| Out of scope | 3 | Other clients, the doc's other 4 tabs, Meta lead-magnet events |

Row inventory reconciles: B(8) + D(9) + E(6) = 23 work rows, plus A1 = **24**.
17 READY + 5 row-level CONFIRM + 1 BLOCKED + 1 resolved = 24.

**Nothing in Paid Search or Meta is blocked.** The one remaining blocker sits on the
Overview's Leads and Cost per lead only. Req 4, Req 5 and the table totals can start now.

### The 17 ready items, in one place

**Overview (Req 1)** — B1 metric set `Spend, Clicks, Leads, Cost per lead` · B2 blended
**and** per-channel · B3 fallback moot, both is feasible · B5 broken metric renders NA,
never a partial number · B6 Overview becomes the default landing · B8 applies to
internal **and** portal. *(B4 and B7 moved to CONFIRM.)*

**Paid Search** — D1 totals on **every** table, not just the two named · D2 Total Leads
at the **top** of Leads by Action · D3 total at the **bottom** of Region → DMA · D5
plain sum confirmed · D6 keyword table defaults to **clicks ≥ 10**, clearable · D9 the
click filter does **not** touch Leads by Action. *(D4, D7 and D8 moved to CONFIRM.)*

**Meta** — E1 fix **Cost / LPV** · E2 hold Leads and Cost per lead · E3 keep link
clicks, already correct, no-op · E4 Meta bids one ad-set-level event, varies per client.

**Cross-cutting** — F1 currency precision mismatch, root cause found.

**From the original six requirements** (no stakeholder input on either, so neither
scorecard covers them) — E5 Req 5 Top Regions formats as `$X,XXX.XX`, same root cause
as F1. *(E6 Req 6 LinkedIn is already **resolved**, not pending build.)*

### Constraints the design doc carries that this work list did not

Folded in now. All three shape the build and we were silent on them. IDs below are
**PR #164's**, prefixed to avoid colliding with this work list's own `C1`/`C2`/`C3`,
which mean something different:

- **#164 `C1`: every Paid Media change lands twice**, on the dashboard route and the portal
  route. Applying one and not the other gives staff and clients different behaviour.
- **#164 `C2`: the RSC boundary is CI-enforced.** `npm run check:rsc` fails when a function
  prop crosses Server to Client. **Meta's geo-section is a Server Component; Paid
  Search's is a Client Component.** So the currency fix must pass a **string
  descriptor**, never a function.
- **#164 `D11`: the rollup cannot reuse the existing KPI functions**, with proof in the
  design: they return rounded values and consume prior-period absolutes internally, so
  blended deltas cannot be derived from them. **Still an open engineering decision.**

Plus two monitoring gaps the design surfaced: the health sweep never probes the Meta or
LinkedIn subpages, and its coverage **silently changes** when Overview takes `id: null`;
and the Connections page hardcodes all three paid channels to `NOT_CONFIGURED`.

### Three code findings from the final sweep

These changed our assessment and are worth your eye:

1. **The Overview has a pattern to copy.** Paid Media already renders as one section
   with subsections via `PAID_MEDIA_SUBSECTIONS` (`lib/constants.ts:174`), and **AEO and
   GA4 already use the exact shape Req 1 asks for**, with `{id: null, label: 'Overview'}`
   first. So nav and routing are cheap. The genuinely new work is the cross-channel
   aggregation layer. Our first read called this all-new; it is not.
2. **F1's root cause is a missing prop.** `usd()` is `'$' + Math.round(n)`, so it never
   shows cents. **Meta's Top Regions chart charts `spend` without `valueFormat="currency"`**
   (`meta-ads/geo-section.tsx:52`) so Recharts prints raw decimals, while **LinkedIn's
   identical chart does pass it** (`linkedin-ads/geo-section.tsx:26`). Dianna's
   observation is exactly right, and it is a Meta-vs-LinkedIn inconsistency. Note her
   instruction is "make them all with **cents**", which is the opposite direction from
   the current formatter.
3. **D8 carries a number mismatch.** Amir said the keyword table should "display the top
   10", but the code caps at **50** (`lib/paid-search/keywords.ts:29`). Flagged rather
   than silently picking one.

---

## Questions specifically for you

1. **Is Blocker 1 as big as we think?** We found Renaissance has no HubSpot connection
   at all and no paid-channel attribution exists anywhere in the repo. Is there
   something outside this codebase (a Sheet, a Supermetrics HubSpot connector, an
   existing attribution report) that would make this cheaper than it looks?
2. ~~Is Blocker 2 real?~~ **Answered by your own call.** What is left is the two layout
   details in the confirmation section: does Meta get its own card, and do we label the
   blended Clicks number as covering 2 of 3 channels?
3. **Is chronological precedence the right merge rule** for reconciling the two docs,
   or would you weight by role instead (channel owner wins on their own channel)?
4. **Anything in the "not blockers" list you would promote to a blocker?**
4b. **Is the merged work list right?** Specifically: is chronological precedence the
   correct merge rule, and did we mis-resolve any row where the two documents disagree?
   The four rows where a later answer **reverses** an earlier proposal are B4, D8, E3
   and Blocker A1. Those are the ones most worth checking.
5. ~~**Traceability gap:** requirements may live in Asana.~~ **Partly closed.** The
   design doc in PR #164 records the **six original requirements verbatim** as its root
   source, which is the upstream link we were missing. Asana may still hold the
   originating task, but we now have the requirement text itself.
6. **How should PR #164 and PR #175 be handled?** Review both together, fold #164 into
   #175, or land #164 first as the design of record and rebase this on top. It has
   no review artifact on GitHub even though Paul reviewed it, and we have not touched it.
7. **`D11` is still open and it is yours to call:** does the rollup fetch raw totals
   itself, or does each channel export a raw-totals accessor alongside its `Kpi[]`
   builder? It blocks Req 1 alongside A1.

---

## How to verify this yourself

The scorecards are meant to be checkable, not trusted.

- Each body element has a stable ID (`D1-B07`, `D2-B67`) with its verbatim text, so any
  claim can be traced to a specific line of the source document.
- Each comment carries its confirmed author, timestamp, and the exact text it anchors to.
- Sections marked **NOT SOURCE** are our analysis and are fenced off from the 1:1 map.
- Open items are flagged as open rather than resolved. We did not interpret anything
  the documents left ambiguous.
- Verbatim means verbatim, including the source's typos. They are not errors in the
  capture.
