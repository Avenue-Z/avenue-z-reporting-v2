# Golden Scorecard — Document 1: "Questions for Paid Media Tab in Reporting"

> **Purpose.** A direct 1:1 map of every piece of content in the source document
> and every comment attached to it. This is the anti-drift reference for the Paid
> Media v2 overhaul. Nothing here is summarized, condensed, or paraphrased.
> If it is in the document, it is in this file verbatim.
>
> **Status:** Document 1 of 2. Document 2 ("Decisions for Approval - Paid Media")
> gets its own separate scorecard. The two are blended only after both are
> individually confirmed accurate.

## Provenance

| Field | Value |
|---|---|
| Source file | `PaidMediaReportingDashboardv2.html` (Google Docs HTML export) |
| Live source | Google Doc `1WNa3zDAkFss3Cx5EYBrfENJnYfOZOX-PfWqdbVLXyMQ`, **tab 1 of 6** |
| **Tab name** | **`Q&A`** (the tab label in the Google Docs sidebar) |
| Document title (H1) | Questions for Paid Media Tab in Reporting |
| Captured | 2026-07-30 (body), API-verified same day (comments) |
| Branch | `feat/paid-media-v2-feedback` |
| Body elements mapped | 52 (D1-B01 … D1-B52) |
| Comments mapped | 9 units = **4 threads + 5 replies** |
| Requirements | 4 (Req 1 … Req 4) |
| Verification | Body diffed against the **live doc** via API: **52/52 elements, 0 gaps**. Comments diffed against Drive API: **9/9 verbatim match**. |

> **Warning: a stale export exists locally.** `~/Downloads/PaidMediaReportingDashboardv2.html`
> is dated **2026-07-22** and is **out of date**. It contains "not
> **accicentrially** reported to the client" in D1-B30, a typo that has since been
> fixed in the document. The live doc (and this scorecard) reads "not
> **accidentally** reported to the client". **Do not re-derive anything from that
> local file.** This scorecard is verified against the live document as of
> 2026-07-30 and is the authority.

> **This tab is one of six.** The Google Doc contains six top-level sections:
> (1) *Questions for Paid Media Tab in Reporting* &larr; **this scorecard**,
> (2) *[Project / Feature Name]* PRD template, (3) *Decisions for Approval —
> Paid Media* &larr; **Document 2, scorecarded separately**, (4) *Technical
> Feedback*, (5) *Stakeholder QA & Feedback*, (6) *Handoff Agreement*.
> The HTML export covers only tab 1. This scorecard is scoped to tab 1 and
> deliberately excludes the other 17 comment threads that live on other tabs.

## How to read this file

- **Verbatim column** reproduces source text **exactly**, including typos
  (`wouldn;t`, `it;s`, `does note feature`, `Just depends of`), stray carets
  (`Agreed^`), and double spaces. Typos are **not** corrected anywhere in the
  1:1 map. Do not "fix" them when quoting this doc back to anyone.
- **Em dashes and arrows** appearing inside quoted source text are preserved
  because fidelity is the whole point of this file. All prose written by us in
  this document avoids them per house style.
- **Voice** identifies who is speaking, derived from the document's own color
  legend (see below) and its inline labels.
- **Level** is the bullet indent depth in the source (L0 = top level).
- Sections marked **NOT SOURCE** are our own analysis and are fenced off so they
  can never be mistaken for a requirement.

### Color / voice legend (established by the document itself)

| Voice | Source signal | Notes |
|---|---|---|
| **Doc** | Black body text | The original question author. Not named in the export. |
| **Dianna** | Purple `#9900ff` | Document states explicitly: "Dianna's feedback in purple" |
| **Amir** | Blue `#0000ff` | Labeled inline: "Amir's Feedback for Paid Search" |
| **Greg** | Plum `#741b47` | Labeled inline: "Greg's Feedback for Paid Social" |

> **Comment authorship: RESOLVED.** Google Docs HTML exports do not carry comment
> author names, so the first version of this scorecard marked all nine as
> **(inferred)**. Authorship has since been pulled from the **Google Drive API**
> using a read-only service account. Every author in Part 2 is now **confirmed**,
> with timestamps. One earlier inference was wrong (`[h]`) and is corrected and
> logged there. Comment **content** was unaffected: the API text matches the HTML
> export **verbatim across all nine units**.

---

# Part 1 — Body content, 1:1

## D1-B01 · Document title

| ID | Type | Verbatim |
|---|---|---|
| D1-B01 | H1 | Questions for Paid Media Tab in Reporting |

---

## Req 1 — Overview subpage

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B02 | H2 | — | Doc | Req 1 &mdash; Add Paid Media "Overview" subpage (rollup across Paid Search, Meta, LinkedIn) | |
| D1-B03 | Paragraph (italic) | — | Doc | Create a new Overview subpage that aggregates and displays combined performance across the Paid Search, Meta, and LinkedIn subpages. | |
| D1-B04 | Paragraph (empty) | — | — | *(intentionally blank line in source)* | |
| D1-B05 | Paragraph (italic, purple) | — | Doc | Dianna's feedback in purple | |

### Sub-heading: Content structure

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B06 | Paragraph (bold) | — | Doc | Content structure | |
| D1-B07 | Bullet | L0 | Doc | Which metrics roll up into the Overview (Spend, Leads, Clicks, CPL, CTR, conversions)? | **[a]**, **[b]** |
| D1-B08 | Bullet | L0 | Amir | Amir's Feedback for Paid Search: | |
| D1-B09 | Bullet | L1 | Amir | Right now the above metrics are the ones that make sense to me, but I wouldn;t include CTR (unless social team disagrees). | |
| D1-B10 | Bullet | L1 | Amir | For Google, Leads and Conversions would be duplicative, so I wouldn;t include both, but deferring to the social team as they may have different conversion actions other than form fills configured. | |
| D1-B11 | Bullet | L0 | Greg | Greg's Feedback for Paid Social | |
| D1-B12 | Bullet | L1 | Greg | Remove CTR | |
| D1-B13 | Bullet | L1 | Greg | The rest looks good and translates well across all platforms | |
| D1-B14 | Bullet | L1 | Greg | Reorder: Spend, Clicks, Leads, Cost per lead | |
| D1-B15 | Bullet | L0 | Doc | Is the rollup *blended* (all channels combined into one top-line) or *stacked* (per-channel rows/cards), or both? <br>*(source italicizes "blended" and "stacked")* | |
| D1-B16 | Bullet | L1 | Dianna | Preferably both | |
| D1-B17 | Bullet | L1 | Amir | Amir's Feedback for Paid Search: | |
| D1-B18 | Bullet | L2 | Amir | Agreed - preferably both | |
| D1-B19 | Bullet | L1 | Greg | Agreed^ Preferably Both | |
| D1-B20 | Bullet | L2 | Greg | If it's not possible, all channels should be the default | |
| D1-B21 | Bullet | L0 | Doc | When channels define a metric differently (e.g., a "Lead" on Meta vs. LinkedIn vs. Search), how are they reconciled in the rollup? Same-name-same-math, or normalized? | |
| D1-B22 | Bullet | L1 | Dianna | I can't think of anything that would be different here for how the metrics are calculated so I don't think this will be an issue. Is there something specific you have in mind? | |
| D1-B23 | Bullet | L1 | Amir | Amir's Feedback for Paid Search: | |
| D1-B24 | Bullet | L2 | Amir | Going to my earlier note above on Leads and Conversions are duplicative on the search end | |
| D1-B25 | Bullet | L2 | Amir | Just depends of Meta is using any conversions actions in bidding other than Form Submissions | |
| D1-B26 | Bullet | L1 | Greg | For where we are currently, I think we should just use the "leads" event, & remove "Conversions" to Amir's point | |
| D1-B27 | Bullet | L2 | Greg | Meta might explore tracking different events for lead magnets in the future but we can report on that on the channel-specific sections. This should be used for a holistic look of the brands lead volume and costs | |

### Sub-heading: Default behavior

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B28 | Paragraph (bold) | — | Doc | Default behavior | |
| D1-B29 | Bullet | L0 | Doc | If one channel has no data or is erroring, how does the Overview represent it &mdash; zero, blank, "N/A", or excluded from totals? | |
| D1-B30 | Bullet | L1 | Dianna | If a metric is not working that is then pulled into a formula to calculate a different metric, make the final metric show as NA or erroring so that it is not accidentally reported to the client with missing data | |

---

## Req 2 — Total Leads on two tables

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B31 | H2 | — | Doc | Req 2 &mdash; Add "Total Leads" to "Leads by Action" (top) and "Region &rarr; DMA Breakdown" (bottom) | |
| D1-B32 | Paragraph (italic) | — | Doc | Add a "Total Leads" figure, which sums the table's subtotals, to the top of the Leads by Action table and the bottom of the Region &rarr; DMA Breakdown table on Paid Search. | |

### Sub-heading: Default behavior

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B33 | Paragraph (bold) | — | Doc | Default behavior | |
| D1-B34 | Bullet | L0 | Doc | Confirm the math: is "Total Leads" a plain sum of the visible subtotals, or a de-duplicated count? (A lead appearing in multiple DMAs/actions could double-count.) | **[c]**, **[d]** |
| D1-B35 | Bullet | L1 | Amir | Amir's Feedback for Paid Search: | |
| D1-B36 | Bullet | L2 | Amir | Right now the LEADS BY ACTION table has the 3 key form fill types, and the totals of each type respectively (3 different subtotals), but not total of total leads at the top of the table. | |
| D1-B37 | Bullet | L2 | Amir | So suggesting that for this and all tables on the Paid Search reporting tab, the table should have a total at the table. | |
| D1-B38 | Bullet | L0 | Doc | If Req 3's Clicks &ge; 10 filter is active on a related table, does that affect this total? | **[e]**, **[f]** |
| D1-B39 | Bullet | L1 | Amir | Amir's Feedback for Paid Search: | |
| D1-B40 | Bullet | L2 | Amir | It should not, as the greater than 10 clicks suggestion was only for the Keywords table (underneath the  "Region&rarr;DMA Breakdown" table), and not the LEAD BY ACTION table <br>*(source has a non-breaking space plus a regular space before the opening quote)* | |
| D1-B41 | Bullet | L2 | Amir | The LEAD BY ACTION table does note feature any click data, so this should not impact | |

---

## Req 3 — Keyword table default filter

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B42 | H2 | — | Doc | Req 3 &mdash; Default filter on keyword table: Clicks &ge; 10 | |
| D1-B43 | Paragraph (italic) | — | Doc | Set the keyword table at the bottom of the Paid Search subpage to default to showing only rows with 10 or more clicks. | |

### Sub-heading: Default behavior

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B44 | Paragraph (bold) | — | Doc | Default behavior | |
| D1-B45 | Bullet | L0 | Doc | If no keywords meet &ge; 10 clicks, what shows &mdash; empty table, a message, or unfiltered fallback? | |
| D1-B46 | Bullet | L1 | Dianna | My thought would be a message but I'll defer to Amir | |
| D1-B47 | Bullet | L1 | Amir | Amir's Feedback for Paid Search: | |
| D1-B48 | Bullet | L2 | Amir | Aligned with Dianna's suggestion, but if it;s easier to implement logic, we could say: | |
| D1-B49 | Bullet | L3 | Amir | If there are less than 10 clicks in the selected date range (highly unlikely), then the pivot could be to instead default to those keywords with more than 50 impressions | |

---

## Req 4 — Cost / LPV audit (Meta)

| ID | Type | Level | Voice | Verbatim | Anchors |
|---|---|---|---|---|---|
| D1-B50 | H2 | — | Doc | Req 4 &mdash; Investigate/verify "Cost / LPV" calculation (Meta) | |
| D1-B51 | Paragraph (italic) | — | Doc | Audit the existing Cost / LPV metric on the Meta subpage to confirm it's calculating and displaying correctly. | |
| D1-B52 | Bullet | L0 | Doc | What's the *expected* formula? (Spend &divide; Landing Page Views?) <br>*(source italicizes "expected")* | **[g]**, **[h]**, **[i]** |

> **Structural note (observation, not a requirement):** Req 4 is the only
> requirement with **no "Default behavior" sub-heading** and only a single
> bullet. Reqs 1, 2, and 3 each carry one.

---

# Part 2 — Comments, 1:1 (API-verified)

> **Source upgraded 2026-07-30.** Originally captured from the HTML export, which
> carries no authorship. Now re-pulled through the Google Drive API with a
> read-only service account. Every comment below has a **confirmed author and
> timestamp**. Content was diffed against the HTML export: **all 9 units match
> verbatim, zero differences.**
>
> **Structural correction.** The HTML export renders comments as 9 flat items
> `[a]`…`[i]`. They are really **4 threads with 5 replies**. The thread structure
> below is the true shape and matches the Q&A tab's comment badge of **4**.

| Thread | Anchor | Opened by | Replies | Units |
|---|---|---|---|---|
| T1 | D1-B07 | Dianna Gatto | 1 | [a], [b] |
| T2 | D1-B34 | Dianna Gatto | 1 | [c], [d] |
| T3 | D1-B38 | Dianna Gatto | 1 | [e], [f] |
| T4 | D1-B52 | Dianna Gatto | 2 | [g], [h], [i] |

**Whole-document comment census:** 21 threads total. **4 belong to this tab**
(mapped below). 17 belong to other tabs and are **out of scope for Doc 1**.
**Resolved threads: 0** anywhere in the document. **Deleted: 1** (see note at the
end of this Part).

---

## Thread T1 — anchored to D1-B07

> **Anchor text (exact, from API `quotedFileContent`):**
> Which metrics roll up into the Overview (Spend, Leads, Clicks, CPL, CTR, conversions)?

### [a] — thread opener
| Field | Value |
|---|---|
| Author | **Dianna Gatto** |
| Created | 2026-07-21T19:36:06Z |
| Assignee line | none |

> @greg.huepler@avenuez.com / @amir.eldick@avenuez.com can you both add what metrics you'd want included for your services?

### [b] — reply 1
| Field | Value |
|---|---|
| Author | **Amir Eldick** |
| Created | 2026-07-21T20:19:03Z |

> Got you - just added my feedback

---

## Thread T2 — anchored to D1-B34

> **Anchor text (exact):** Confirm the math: is "Total Leads" a plain sum of the
> visible subtotals, or a de-duplicated count? (A lead appearing in multiple
> DMAs/actions could double-count.)

### [c] — thread opener
| Field | Value |
|---|---|
| Author | **Dianna Gatto** |
| Created | 2026-07-21T19:39:03Z |
| Assignee line | **_Assigned to amir.eldick@avenuez.com_** |

> @amir.eldick@avenuez.com can you confirm?
>
> _Assigned to amir.eldick@avenuez.com_

### [d] — reply 1
| Field | Value |
|---|---|
| Author | **Amir Eldick** |
| Created | 2026-07-21T20:19:08Z |

> Got you - just added my feedback

---

## Thread T3 — anchored to D1-B38

> **Anchor text (exact):** If Req 3's Clicks &ge; 10 filter is active on a related
> table, does that affect this total?

### [e] — thread opener
| Field | Value |
|---|---|
| Author | **Dianna Gatto** |
| Created | 2026-07-21T19:39:57Z |
| Assignee line | **_Assigned to amir.eldick@avenuez.com_** |
| Note | Four text paragraphs with two blank paragraphs between them; all preserved. |

> I'm not sure what this is referring to. @amir.eldick@avenuez.com I'm assuming this feedback  / change came from you.
>
> *(blank paragraph)*
>
> Do you know how to respond to this?
>
> *(blank paragraph)*
>
> Lmk if my input is needed afterwards
>
> _Assigned to amir.eldick@avenuez.com_

### [f] — reply 1
| Field | Value |
|---|---|
| Author | **Amir Eldick** |
| Created | 2026-07-21T20:19:13Z |

> Got you - just added my feedback

---

## Thread T4 — anchored to D1-B52

> **Anchor text (exact):** What's the expected formula? (Spend &divide; Landing Page Views?)

### [g] — thread opener
| Field | Value |
|---|---|
| Author | **Dianna Gatto** |
| Created | 2026-07-21T19:41:10Z |
| Assignee line | **_Assigned to greg.huepler@avenuez.com_** |

> @greg.huepler@avenuez.com to confirm
>
> _Assigned to greg.huepler@avenuez.com_

### [h] — reply 1
| Field | Value |
|---|---|
| Author | **Dianna Gatto** |
| Created | 2026-07-21T19:41:17Z |
| Correction | The pre-API version of this scorecard **inferred Amir**. That was **wrong**. It is Dianna, following up on her own comment 7 seconds later. This was the only incorrect inference of the nine. |

> lmk if you need my input after

### [i] — reply 2
| Field | Value |
|---|---|
| Author | **Gregory Huepler** |
| Created | 2026-07-21T20:19:05Z |
| Significance | **The only comment containing a substantive answer to a requirement.** Greg owns Paid Social, so this is authoritative for a Meta metric. |

> @dianna.gatto@avenuez.com @paul.ramirez@avenuez.com Yes, This metric is calculated as amount spent divided by landing page views.

---

## Authorship: inferred vs confirmed

Recorded so the correction is auditable.

| Unit | Pre-API inference | **Confirmed author** | Verdict |
|---|---|---|---|
| [a] | Dianna or Paul | **Dianna Gatto** | narrowed, correct |
| [b] | Amir | **Amir Eldick** | correct |
| [c] | Dianna or Paul | **Dianna Gatto** | narrowed, correct |
| [d] | Amir | **Amir Eldick** | correct |
| [e] | Dianna | **Dianna Gatto** | correct |
| [f] | Amir | **Amir Eldick** | correct |
| [g] | Dianna or Paul | **Dianna Gatto** | narrowed, correct |
| [h] | Amir | **Dianna Gatto** | **WRONG, now corrected** |
| [i] | Greg | **Gregory Huepler** | correct |

## Note: one deleted comment exists

The API reports **1 deleted comment thread** in the document (`AAACDpXoojM`),
created 2026-07-21T19:38:49Z and deleted 7 seconds later at 19:38:56Z. It has
**no author, no content, and no anchor text** returned, so nothing is recoverable
and nothing is missing from this map. Logged only so the count reconciles:
21 threads returned, 20 live plus this 1 tombstone.

## Note: resolved comments

**Zero resolved threads exist in the entire document.** The earlier concern that
resolved threads might be hiding decisions is **closed**. Nothing was hidden.


# Part 3 — Answer-status scorecard

Tracking metadata over the 1:1 map above. "Question" is the doc's open question;
"Answered by" cites the element IDs that respond to it.

| # | Req | Question (element) | Answered by | Status |
|---|---|---|---|---|
| 1 | Req 1 | Which metrics roll up (D1-B07) | D1-B09, D1-B10 (Amir); D1-B12, D1-B13, D1-B14 (Greg) | **Answered** |
| 2 | Req 1 | Blended or stacked or both (D1-B15) | D1-B16 (Dianna), D1-B18 (Amir), D1-B19, D1-B20 (Greg) | **Answered, unanimous** |
| 3 | Req 1 | Cross-channel metric reconciliation (D1-B21) | D1-B22 (Dianna), D1-B24, D1-B25 (Amir), D1-B26, D1-B27 (Greg) | **Answered** |
| 4 | Req 1 | Channel with no data / erroring (D1-B29) | D1-B30 (Dianna) | **Partially answered** — see OPEN-1 |
| 5 | Req 2 | Total Leads math: plain sum or de-duplicated (D1-B34) | D1-B36, D1-B37 (Amir) | **Partially answered** — see OPEN-2 |
| 6 | Req 2 | Does the Clicks &ge; 10 filter affect the total (D1-B38) | D1-B40, D1-B41 (Amir) | **Answered: no** |
| 7 | Req 3 | What shows if no keyword meets &ge; 10 clicks (D1-B45) | D1-B46 (Dianna), D1-B48, D1-B49 (Amir) | **Answered with an alternative** — see OPEN-3 |
| 8 | Req 4 | Expected Cost / LPV formula (D1-B52) | Comment **[i]** | **Answered: spend &divide; landing page views** |

---

# Part 4 — Open items and ambiguities

Flagged, **not resolved**. Resolving these silently is how drift starts. Each
needs an explicit decision (several may be settled by Document 2).

| ID | Where | The ambiguity |
|---|---|---|
| **OPEN-1** | D1-B29 / D1-B30 | The question asks how the Overview represents a **channel** that has no data or is erroring (zero / blank / "N/A" / excluded from totals). Dianna's answer (D1-B30) addresses a **metric** that feeds a formula, not a whole channel, and does not say whether a dead channel is **excluded from** or **counted as zero in** the blended total. The blended-total behavior is still undefined. |
| **OPEN-2** | D1-B34 / D1-B36 / D1-B37 | The doc asks **plain sum vs de-duplicated count**, explicitly noting a lead can appear in multiple DMAs/actions. Amir's reply describes **where the total goes** (a total on the table) but never states **which math**. The de-duplication question is unanswered. |
| **OPEN-3** | D1-B45 / D1-B46 / D1-B48 / D1-B49 | Two different fallbacks are on the table and neither is chosen: Dianna says **a message**; Amir is "aligned" but offers **fall back to keywords with more than 50 impressions**. Needs one decision. |
| **OPEN-4** | D1-B49 | Amir's trigger condition differs from the requirement's. Req 3 (D1-B45) asks about **no keyword having &ge; 10 clicks**. Amir writes "**If there are less than 10 clicks in the selected date range**", which reads as a **total account clicks** condition, not a per-keyword one. Which trigger is intended is unclear. |
| **OPEN-5** | D1-B37 | Scope expansion. Req 2 (D1-B31, D1-B32) names exactly **two** tables. Amir extends it to "**all tables on the Paid Search reporting tab**". Whether Req 2 covers 2 tables or every table on the tab is undecided. |
| **OPEN-6** | D1-B37 | Sentence is truncated or mistyped: "the table should have a total **at the table**." Placement intent is unclear (top? bottom?), and it appears to conflict with D1-B31 which specifies **top** for Leads by Action and **bottom** for Region → DMA. |
| **OPEN-7** | D1-B07 vs D1-B14 | Naming. The doc's metric list says "**CPL**"; Greg's reorder says "**Cost per lead**". Presumed the same metric, but the canonical display label is not fixed. |
| **OPEN-8** | D1-B25 | Amir's condition ("Just depends of Meta is using any conversions actions in bidding other than Form Submissions") is a **dependency on a fact nobody states in this document**. Whether Meta uses non-form-fill conversion actions is unconfirmed here. |
| ~~**OPEN-9**~~ | Comments [a]–[i] | ~~Comment authorship is not recoverable from the HTML export.~~ **CLOSED 2026-07-30.** Authorship pulled from the Google Drive API with a read-only service account. All nine authors confirmed with timestamps; the one bad inference (`[h]`) corrected. See Part 2. |

---

# Part 5 — Convergence summary (**NOT SOURCE** — derived, for discussion only)

> Everything below is our reading of the source, not the source itself. It exists
> to speed up the build conversation. **If it ever conflicts with Parts 1 and 2,
> Parts 1 and 2 win.**

**Req 1 metric set — where the three voices land.** Starting list (D1-B07) was
Spend, Leads, Clicks, CPL, CTR, conversions. Amir removes CTR (D1-B09) and says
Leads/Conversions are duplicative for Google (D1-B10). Greg removes CTR (D1-B12)
and gives an explicit order (D1-B14). Greg then resolves the duplication by
keeping the "leads" event and dropping "Conversions" (D1-B26).

Net convergence: **Spend, Clicks, Leads, Cost per lead**, in that order. CTR out
by unanimous agreement. Conversions out as duplicative of Leads.

**Req 1 layout.** Blended **and** stacked, all three voices agree (D1-B16,
D1-B18, D1-B19). Greg's fallback if both is not feasible: **all channels is the
default** (D1-B20).

**Req 4.** Expected formula confirmed in comment **[i]**: amount spent divided by
landing page views.

---

# Part 6 — Implementation cross-reference (**NOT SOURCE** — derived)

> Our mapping from the requirements to the code as it exists today on
> `feat/paid-media-v2-feedback`. Included so the build conversation starts from
> facts. **Not a requirement, and not a decision.**

| Req | Current state in code | Files |
|---|---|---|
| Req 1 (Overview subpage) | **Does not exist.** No Overview section, no rollup layer. Paid Media is 3 independent tabs, each its own RSC with its own Supermetrics data layer. A new slug, sidebar entry, `enabledReports` value, section component, and a cross-channel aggregation lib would all be new. | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, `components/layout/sidebar.tsx`, `components/layout/portal-sidebar.tsx`, `scripts/seed.ts` |
| Req 2 (Total Leads) | **Leads by Action** renders 3 category subtotals and no grand total, matching Amir's description in D1-B36. A `totalLeads` value **already exists** in the data layer and is already used for the percentage shares, so the number is available without new querying. **Region → DMA** has no totals row at all. | `components/report-sections/paid-search/leads-section.tsx`, `lib/paid-search/leads.ts`, `components/report-sections/paid-search/geo-section.tsx` |
| Req 3 (Clicks &ge; 10) | **No filter exists.** The keyword table is capped at the top 50 rows sorted by leads then cost. Adding a default filter interacts with that existing cap. | `lib/paid-search/keywords.ts`, `components/report-sections/paid-search/keywords.tsx` |
| Req 4 (Cost / LPV) | **Likely root cause of the reported problem.** The value is **not** computed as spend &divide; LPV. It reads Meta's native `cost_per_landing_page_view` field and then applies `Math.round(...)`, so a true value near $0.70 renders as **$1** on the KPI card and **$0.00** on rows below a dollar. Comment **[i]** defines the expected formula as spend &divide; landing page views, so both the source field and the whole-dollar rounding are in question. | `lib/meta/kpis.ts` (`costPerLpv`), `lib/meta/creative.ts` (`costPerLpv`) |

---

## Change log

| Date | Change |
|---|---|
| 2026-07-30 | Created from the HTML export. 52 body elements, 9 comments, 4 requirements, 9 open items. |
| 2026-07-30 | **API verification pass.** Re-pulled via Google Drive API (read-only service account). Body confirmed 37/37 list items against the API export. Comments confirmed 9/9 verbatim. Authorship confirmed for all nine units and `[h]` corrected from Amir to Dianna. Comments restructured from 9 flat items to their true shape of 4 threads + 5 replies. OPEN-9 closed. Confirmed **zero resolved comments** exist, so nothing was hidden. Recorded that this doc is **tab 1 of 6** and that Document 2 lives in tab 3. |
