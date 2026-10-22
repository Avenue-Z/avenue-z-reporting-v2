# AI Visibility Snapshot, round 3: blind acceptance results

Tested 2026-10-22 against https://staging.reporting.avenuez.com/tools/new-business, judging only what the live
page showed. Widths: 1440 (default), 1280, 1024 via viewport emulation; also the browser pane's own ~832 px.

## Totals

| Result | Count |
|---|---|
| PASS (incl. 2 "PASS (fallback)") | 103 |
| FAIL | 11 |
| BLOCKED | 0 |
| N/A | 7 |
| O (recorded, no verdict) | 12 |
| **Must-pass (M + A\*)** | **63 PASS / 73** (8 FAIL, 2 N/A) |

## Projects and reports I created

| Id | Project | Range | Role | Final state |
|---|---|---|---|---|
| 8df3dac4-d3e8-4c1e-8dce-43dae8abd14a | PocketGuard (P1) | 2026-10-19 to 2026-10-19 | Edits, toggle, approved with Opportunities OFF | **Revoked** (link shows "This link is not available.") |
| 01625088-794f-4fd6-bea1-3d594c911310 | A Place for Mom (PITCH) (P5: 4 competitors; low citations, used as P3) | full history (Sep 17 to Sep 29, 2026) | Approved with Opportunities ON | **Revoked** (link shows "This link is not available.") |
| 9f84f1c3-12c0-4f9a-826c-2baeddb2fea3 | Herman Miller (P2: rank #1 of 38) | full history (Jul 2 to Jul 10, 2026) | Read only | Draft |
| 50258ee0-ed61-492d-8921-3783db491039 | W Research - Crocs (no competitors) | full history (Oct 22, 2026) | Read only, then Rerun | Draft |
| 20e21c75-575d-4675-bbbc-d59bb2d208a8 | W Research - Crocs (rerun of 50258ee0) | Oct 22, 2026 | Rerun output | Draft |
| d686ef9a-4fbb-432a-92c6-0b5be751d8fe | W research - Dr Melaxin (no competitors) | Oct 22, 2026 | Read only | Draft |
| d77d6a41-99d6-49a8-a361-c01bafe7cfc6 | W Research - Shark | full history | Failed: "Peec has no data for this project in that period." | Failed |

My one text edit (" QAEDIT" in the PocketGuard Earned line) was reverted before approval; the saved line reads
"Editorial sites make up 19% of citations in this window." again (verified in V2). Both approved links were revoked
within minutes of checking. Settings were read only, nothing saved. P4 (no technical suggestions) could not be
identified from the UI. No project with 0% Editorial, 0 citations or prospect ranked last was found.

**V4 (download/export) does not exist.** Editor buttons are Edit, Opportunities page: on/off, Approve, Rerun, Before
you send, Open full size; after approval Copy link, Revoke, Edit a copy. Every V4 clause below is therefore skipped.

## Recorded chart values (read from the page)

- **P1 PocketGuard bar chart** (10 bars of "18 brands"): YNAB 57.5, Monarch 52.8, Monarch Money 51.2, EveryDollar 39.4,
  Quicken 38.7, PocketGuard 33.3, You Need A Budget 30.9, Rocket Money 26.4, Envelope 25.8, Goodbudget 21.8.
  **Donut**: Corporate 37, Editorial 19, Competitor 17, Institutional 9, UGC 8, You 4, Other 3, Reference 2 (sum 99).
  Citation total: not shown anywhere. Prompts: "200 prompts tracked".
- **A Place for Mom**: Care 98.6, A Place for Mom 3.1, Caring 2.2, Petunia 0.0, Seniorly 0.0 ("#2 of 5 brands").
  Donut: Institutional 59, Corporate 24, Reference 5, UGC 4, You 3, Editorial 2, Other 1, Competitor 1.
- **Herman Miller**: Herman Miller 76.2, Steelcase 36.9, MillerKnoll 29.0, Haworth 24.3, DWR 21.7, Humanscale 16.3,
  HAY 15.3, Muuto 13.8, West Elm 9.7 and a second West Elm 9.7 (10 values, 9 labels; "#1 of 38 brands").
  Donut: Corporate 43, Editorial 22, UGC 12, Competitor 7, You 6, Other 4, Reference 4, Institutional 2.
- **Crocs**: Crocs 78.1 only. Donut: Corporate 31, Editorial 24, UGC 23, You 10, Institutional 6, Other 4, Reference 2.
- **Dr Melaxin**: Dr Melaxin 46.3 only. Donut: Corporate 27, UGC 17, Other 16, Editorial 15, Institutional 15, You 6, Reference 4.

---

## R1. 50 prompts

- **1.1 [O]** P1 "200 prompts tracked" (Methodology, only place). APFM 104, Herman Miller 30, Crocs 200, Dr Melaxin 200.
  **P1 is not 50: note for Ryan.**
- **1.2 [A] PASS.** One occurrence per report, identical in V1, V2, V3.

## R2. 5 to 10 competitors

- **2.1 [O]** Non-prospect bars: P1 9 (of 17 competitors); APFM 4; Herman Miller 9 values (of 37); Crocs 0; Dr Melaxin 0.
  P1 and Herman Miller are outside 5 to 10 in Peec; Crocs and Dr Melaxin have none.
- **2.2 [A] N/A.** The tool shows no competitor list (picker shows only names and snapshot counts; Settings has none).
  Flag: chart is capped at 10 bars while the page says "18 brands"/"38 brands", and P1's Executive Summary names
  "Empower", which is not on the chart. Nothing on the page says why brands are missing.

## R3. Executive Summary rename

- **3.1 [M] PASS.** Menu "01 Executive Summary" in V1, V2, V3 (strict, title case).
- **3.2 [M] PASS.** Eyebrow "EXECUTIVE SUMMARY" (DOM text "Executive Summary", uppercased like every eyebrow:
  fallback style, words exact). Heading below is the generated title.
- **3.3 [M] PASS.** "headline" in visible text: 0 hits in V1, V2, V3, tab title ("AI Visibility Snapshot: PocketGuard |
  Avenue Z"), Settings labels. Note: the menu link's anchor is still `#headline` (href only, not visible; hash did not
  change on click in V3).
- **3.4 [M] PASS.** Identical in V1, V2, V3 (no V4).
- **3.5 [A] PASS.** Clicking it lands on the section (V1 editor iframe and V3: section top at 0).
- **3.6 [O]** No pre-change approved report can be opened: "Sent (0)"; the earlier revoked links show "This link is not available."

## R4. Opportunities toggle

- **4.1 [M] PASS.** Toolbar button "Opportunities page: on" / "Opportunities page: off".
- **4.2 [M] PASS.** OFF: V1 and V2 menu "01 Executive Summary, 02 Competitive Visibility, 03 Cited Sources, 04 Methodology",
  no Opportunities section.
- **4.3 [M] FAIL (strict letter only).** Approved with OFF, V3 has no menu entry, no heading, no pillar content,
  "pillar" 0 hits. But Cmd+F "Opportunit" finds 2: Executive Summary headline "PocketGuard has a clear AI visibility
  opportunity" and Cited Sources "Why it matters": "...suggest an opportunity to explore...". Scorecard requires
  "Cmd+F for 'Opportunit' ... finds nothing". The loose reading (no page content leaks) passes.
- **4.4 [M] PASS.** APFM approved ON: V3 menu has "04 Opportunities" and the full three-pillar page.
- **4.5 [M] PASS.** OFF survived reload and leave/return; ON survived reload.
- **4.6 [A\*] PASS.** OFF: menu 01 to 04 continuous; heading eyebrows "02 / COMPETITIVE VISIBILITY", "03 / CITED SOURCES",
  "04 / METHODOLOGY" match (V1, V2, V3).
- **4.7 [A] PASS.** Edited Earned line, OFF, ON: edit still there ("...citation QAEDITs in this window.").
- **4.8 [A\*] PASS.** V3 OFF: no control; `#opportunities` in the URL reveals nothing; the page source holds no pillar
  text (only CSS selectors named `#opportunities`).
- **4.9 [O]** Default ON on every new report.
- **4.10 [A] PASS.** After approval the toggle is gone: "This report is frozen. Editing makes a new draft." (Approve
  dialog: "Approving freezes this report. You can't edit it after this.")
- **4.11 [A] N/A.** No page count or contents count shown.

## R5. Opportunities as three pillars

- **5A.1 [M] PASS.** Exactly three: Earned, Content, Technical; no leftover recommendations.
- **5A.2 [S] PASS (strict).** DOM text "Earned & Affiliate Media", "Content and Creative", "Technical Optimizations"
  (rendered uppercase by styling).
- **5A.3 [S] PASS (strict).** Earned, Content, Technical left to right.
- **5A.4 [S] PASS (strict).** 1440: three side-by-side cards, each title, description, rule, one-liner (screenshot).
- **5A.5 [M] PASS.** Only "The Pillars of AI Search", three titles, three descriptions, three one-liners.
- **5A.6 [A] PASS.** V2 at 1440/1280/1024: three columns (cards 293 px at 1280, 208 px at 1024), no clipping, no
  horizontal overflow (scrollWidth = viewport). V3 same renderer at 1440.
- **5A.7 [O]** Slide list items and publication logos do not appear.
- **5B.1 [M] PASS (strict).** "The Pillars of AI Search".
- **5B.2 [S] PASS (strict).** Earned and Technical verbatim; Content near-verbatim with the truncation completed.
- **5B.3 [A\*] PASS.** "...to better influence how LLMs answer the questions buyers ask."
- **5B.4 [M] PASS.** Each one-liner inside its own card after title and description.
- **5B.5 [S] PASS (strict).** One sentence each (wraps to two lines in the card).
- **5B.6 [M] PASS** on P1, APFM, Herman Miller. Flag: on Crocs and Dr Melaxin the Technical line is "No competitors are
  tracked in this Peec project." (no number, because no competitors exist; also names the internal tool "Peec").
- **5C.1 [M] PASS.** "Editorial sites make up 19% of citations in this window."
- **5C.2 [M] PASS.** Equals donut Editorial: P1 19/19, APFM 2/2, HM 22/22, Crocs 24/24, Dr Melaxin 15/15.
- **5C.3 [M] PASS.** Mix bullet "Editorial sources at 19%" (APFM "Editorial accounts for 2%").
- **5C.4 [A\*] N/A.** No project with 0% or absent Editorial found (lowest APFM 2%).
- **5C.5 [S] PASS.** "Editorial sites": the donut label "Editorial" verbatim plus "sites".
- **5D.1 [M] PASS.** "PocketGuard's own site makes up 4% of citations in this window."
- **5D.2 [S] PASS (strict).** 4% equals the donut "You" slice (share of citations), not the 12% Citation Rate.
- **5D.3 [M] PASS (cannot cross-check).** No citation total is shown; no contradiction (678 at 4% implies ~17,000).
- **5D.4 [M] PASS** on the low case: APFM "A Place for Mom's own site makes up 3% of citations in this window." No
  zero-citation project found.
- **5D.5 [A\*] PASS.** Volume 678 > 0, line 4%.
- **5E.1 [M] PASS.** "Competitors' own websites make up 17% of citations in this window." (= donut Competitor 17).
- **5E.2 [M] PASS.** No fixes or fix counts on any project.
- **5E.3 [M] N/A.** P4 not identifiable from the UI. Every report's Technical line used competitor citation share (or
  "No competitors are tracked...").
- **5E.4 [S] PASS (strict).** Line names no competitor.
- **5E.5 [A] PASS.** Domain Gaps lists retrieval counts (different measure); no contradiction.
- **5E.6 [A\*] PASS.** Crocs/Dr Melaxin (no competitors): "No competitors are tracked in this Peec project." True,
  complete sentence (see flag at 5B.6).
- **5F.1 [M] PASS (strict).** All three lines are data statements, no advice words.
- **5F.2 [S] PASS (strict).** No judging adjectives.
- **5F.3 [O]** Borrowed "Publish high quality content..." appears in the Content description.
- **5F.4 [A] PASS** for the Opportunities page (reload, V2, V3, rerun). Flag: Cited Sources "Why it matters" still
  advises: "Investigate competitor-domain gaps ..., then test content and positioning that could strengthen ...".

## R6. Swap and rename to Cited Sources

- **6.1 [M] PASS.** Menu "03 Cited Sources".
- **6.2 [M] PASS.** Heading "Cited Sources", eyebrow "03 / CITED SOURCES".
- **6.3 [M] PASS.** "Category Data" 0 hits in V1, V2, V3, tab title, Settings ("Sources section title" = "Cited
  Sources"). "category" hits are "Category: Personal finance management" and "category discovery". Note: anchor
  href is still `#category-data` (not visible).
- **6.4 [M] PASS (strict).** 02 Competitive Visibility, 03 Cited Sources.
- **6.5 [M] PASS.** Body order and eyebrow numbers match the menu.
- **6.6 [M] PASS.** Identical in V1, V2, V3 (no V4).
- **6.7 [A] PASS.** Each entry lands on its own section (V1 at 1440 and V3).
- **6.8 [A\*] PASS.** No section cross-references.
- **6.9 [O]** All projects, V1/V2/V3: 01 Executive Summary, 02 Competitive Visibility, 03 Cited Sources,
  04 Opportunities, 05 Methodology; with OFF 01 to 04 with 04 Methodology.
- **6.10 [S] PASS.** "Competitive Visibility".

## R7. Bullets fit each page

- **7.1 [M] PASS.** Cited Sources bullets: volume, rate, mix only. (The "Why it matters" paragraph mentions
  competitor-domain gaps; it is not a bullet.)
- **7.2 [M] PASS.** Three rank bullets, plus the "COMPETITOR DOMAIN GAPS" item R10 requires on this page.
- **7.3 [A] PASS.** No sentence repeated across pages.

## R8. Domain Types in two columns

- **8.1 [M] PASS.** V1 at 1440: legend in two columns under the donut (screenshot).
- **8.2 [M] PASS.** V2 and V3: two distinct column x positions.
- **8.3 [M] FAIL (no fallback).** At 1440, 1280 and 1024 each list entry is the name only ("Corporate", "Editorial",
  "Competitor"...); percentages sit only on the donut, and the 2 to 4% slices are labelled outside the ring.
  Scorecard requires "its name and percentage on one line". (Only at ~832 px does the list read "Corporate 37%".)
- **8.4 [M] PASS.** Donut values equal the mix bullet and the Earned line on every project (list itself has no numbers, see 8.3).
- **8.5 [A] PASS.** Crocs (7 types): 4 and 3, across then down, ranking order kept.
- **8.6 [A] PASS.** Still two columns at 1280 and 1024, below the donut (pie bottom 2300 px, legend top 2318 px). No collapse down to 1024.
- **8.7 [S] PASS (strict).** "DOMAIN TYPES".
- **8.8 [A] PASS.** Sums 99 (P1), 99 (APFM), 100 (HM), 100 (Crocs).
- **8.9 [A] PASS.** Marker fills equal slice fills (compared rgb values on Crocs and APFM; P1 visually).

## R9. Bar chart gap and grey gradient

- **9.1 [M] PASS (strict).** V2 and V3 at 1440: title to first bar 14.3 px, versus Cited Sources title to donut 28 px. V1 visually the same.
- **9.2 [M] PASS.** Chart background rgb(0,0,0), no background layer rects, no grey tracks; only faint vertical gridlines (white at 6% opacity).
- **9.3 [S] PASS (strict).** Hover shows a tooltip ("PocketGuard Visibility: 33.3%"), no band behind the bar.
- **9.4 [A] FAIL.** Chart height is fixed at 420 px. Crocs (one bar): a 206 px tall block with a 71 px empty band
  under the title. Herman Miller: two brands both named "West Elm" share one row, drawn as two joined bars reaching
  about 19% on the axis, labelled "9.7%". (P1 with 10 bars: all bars and labels visible; APFM 5 bars fine.)
- **9.5 [A] FAIL.** V1 editor at 1440: the chart overflows its card. Top three bars run off the right edge, their value
  labels are not visible, the axis ends at 50, and labels read "lonarch Money" and "leed A Budget". V2 and V3 at
  1440/1280/1024 are clean.
- **9.6 [A] N/A.** No light/dark theme switch.
- **9.7 [O]** Values readable as labels and tooltips in V2/V3; in V1 at 1440 the top three labels are clipped.

## R10. Competitor Domain Gaps

- **10.1 [M] PASS.** "COMPETITOR DOMAIN GAPS:" present on P1, APFM, HM.
- **10.2 [M] PASS (strict).** P1: ynab.com (YNAB), monarchmoney.com (Monarch Money). APFM: care.com, caring.com,
  seniorly.com (Care, Caring, Seniorly). HM: haworth.com, westelm.com, westelm.ca (Haworth, West Elm).
- **10.3 [M] PASS.** Prospect domain never listed.
- **10.4 [S] PASS (strict).** Each domain contains its brand name.
- **10.5 [A] PASS.** No www duplicates. Note: HM lists westelm.com and westelm.ca (two country domains of one brand).
- **10.6 [A\*] PASS.** Crocs/Dr Melaxin: section omitted, nothing padded.
- **10.7 [A] PASS.** P1, APFM, HM.
- **10.8 [A] PASS.** Retrieval counts are not the same measure as the 17% share; no contradiction.

## R11. Cited Sources bullets

- **11.0 [M] PASS (strict).** "CITATION VOLUME:", "CITATION RATE:", "SOURCE-TYPE MIX:" in order, all projects.
- **11.1 [M] FAIL (strict and loose).** P1 passes, but Crocs: "Crocs.com appears in approximately 1.4K retrieved
  citations." and Dr Melaxin: "Drmelaxinbeauty.com appears in approximately 1.4K retrieved citations."
  Template: "[Brand domain] appears in [X] retrieved citations."
- **11.2 [S]** P1 "PocketGuard.com" strict PASS; Crocs.com PASS; "Hermanmiller.com", "Aplaceformom.com",
  "Drmelaxinbeauty.com" lose the brand casing: PASS (fallback). Counted PASS.
- **11.3 [M] FAIL.** Crocs and Dr Melaxin X = "1.4K" (abbreviated decimal), not a whole number. P1 678, APFM 479, HM 131 pass.
- **11.4 [A] N/A.** No X = 0 or 1 case.
- **11.5 [O]** Over 1,000 is shown as "approximately 1.4K" (no separator). Crocs and Dr Melaxin both show 1.4K and 25%
  citation rate (identical across two brands; unverified whether a cap).
- **11.6 [M] PASS.** "PocketGuard is cited in 12% of tracked answers."
- **11.7 [S] PASS (strict).** Whole percentages.
- **11.8 [A\*] PASS.** Volume > 0 and rate > 0 everywhere.
- **11.9 [A] N/A.** Tracked-answer count not stated (only prompts).
- **11.10 [M] FAIL (strict and loose).** P1 matches the example exactly, but APFM names four types: "Institutional
  sources account for 59% of citations, followed by Corporate sources at 24%; Editorial accounts for 2% and UGC for 4%."
- **11.11 [M] PASS.** Every named percentage equals the donut.
- **11.12 [M] PASS.** First and second named are the two largest slices.
- **11.13 [S] PASS (fallback).** Strict fails: P1 third named UGC 8% while Competitor 17% and Institutional 9% are
  larger; APFM skips Reference 5%; Dr Melaxin skips Other 16%. HM and Crocs pass strict.
- **11.14 [S] PASS (strict).** Names match donut labels.
- **11.15 [A\*] PASS.** Dr Melaxin tie (Editorial and Institutional 15%): names Editorial once, grammatical. No 0% filler or doubled type seen.
- **11.16 [O]** "Other" is on every donut and never named (Dr Melaxin's third largest is Other 16%).

## R12. Competitive Visibility bullets

- **12.0 [M] FAIL (strict and loose).** P1 passes (NEXT-TIER GAP, TOP-TIER DISTANCE, PEER CLUSTER, then COMPETITOR
  DOMAIN GAPS). APFM has no PEER CLUSTER although A Place for Mom 3.1, Caring 2.2 and Petunia 0.0 form a 3.1-point
  cluster. Herman Miller (rank 1) has no PEER CLUSTER either.
- **12.1 [M] PASS.** P1 word for word.
- **12.2 [M] PASS.** Quicken (P1), Care (APFM).
- **12.3 [M] PASS.** 38.7 - 33.3 = 5.4; 98.6 - 3.1 = 95.5; HM 76.2 - 36.9 = 39.3.
- **12.4 [S] PASS (strict).** One decimal.
- **12.5 [A\*] PASS.** HM: "Herman Miller is 39.3 percentage points ahead of Steelcase in visibility." True. No prospect tie observed.
- **12.6 [A] PASS.** Spellings match the chart.
- **12.7 [S] PASS (strict).** Example form with the average.
- **12.8 [M] FAIL (strict; loose "top competitors" reading passes).** P1 passes (53.8). APFM states "the top-three
  average visibility of 33.6%", but the top three bars are Care 98.6, A Place for Mom 3.1, Caring 2.2 = 34.6%.
  HM states 30.1%, but the top three bars are 76.2, 36.9, 29.0 = 47.4%. The stated value is the mean of the top three
  competitors, excluding the prospect.
- **12.9 [M] PASS** against the stated average (33.6 - 3.1 = 30.5; 76.2 - 30.1 = 46.1). Against the chart's true
  top three it would be 31.5 and 28.8 (see 12.8).
- **12.10 [A\*] PASS.** HM says "above", never "below". Top N excludes the prospect on APFM and HM.
- **12.11 [O]** N = 3 everywhere.
- **12.12 [M] PASS.** Word for word with "7.8-point".
- **12.13 [M] PASS.** 38.7 - 30.9 = 7.8.
- **12.14 [M] PASS.** Quicken and You Need A Budget.
- **12.15 [S] PASS (fallback).** Strict fails: PocketGuard, Quicken, EveryDollar span 6.1 points and Rocket Money,
  You Need A Budget, PocketGuard span 6.9, both tighter than 7.8.
- **12.16 [A\*] PASS.** Crocs/Dr Melaxin (one brand): template bullets replaced by "AI VISIBILITY: Crocs appears in 78%
  of tracked answers." No prospect-last project found.
- **12.17 [A] PASS.** 7.8 >= 5.4.

## R13. Cross-cutting

- **13.1 [A] PASS (partial).** Pillar-line edit persisted through reload, toggle and V2. Not carried to V3 (reverted
  before approval); bullet edits on the other pages not tested.
- **13.2 [A\*] FAIL.** Text, titles and numbers identical in V1/V2/V3, but V1 at 1440 clips the bar chart (top three
  values and two labels unreadable, see 9.5) while V2/V3 show them.
- **13.3 [O]** Rerun creates a new draft (20e21c75; "This draft stays as it is"), so edits do not carry. Bullets still
  follow R11/R12 rules, including "approximately 1.4K"; data moved (UGC 23% to 11%).
- **13.4 [A\*] PASS.** V3 (P1 and APFM): no "[", "{", "undefined", "NaN", "null", "Infinity", "-%".
- **13.5 [A] PASS.** "AI Visibility Snapshot: PocketGuard | Avenue Z" (V2/V3); editor tab is generic, no old name.
- **13.6 [A\*] PASS.** 33.3% matches; "YNAB leads at 58%" (57.5), "Monarch at 53%" (52.8), APFM "Care leads at 99%" (98.6).
- **13.7 [A] FAIL.** Template rules fail on other projects: 11.1/11.3 (Crocs, Dr Melaxin), 11.10, 12.0, 12.8 (APFM), 12.0 and 12.8 (Herman Miller).

## Other observations (not scorecard checks)

- Crocs and Dr Melaxin (no competitors tracked) Executive Summaries claim "Crocs leads AI visibility..." and Dr Melaxin
  "leads its tracked category".
- "Crocs's own site" possessive.
- V1 editor menu highlights "05 Methodology" when the report is at the top.

## Fixes and re-check on staging (2026-10-22, after #422)

My triage of the failures above: four real fixes, the rest read the scorecard stricter than Ryan wrote it. #422
(spec `docs/superpowers/specs/2026-10-22-aeo-outbound-round3-scorecard-fixes-design.md`) shipped three of them; dev
`25d99335`, promoted in #423 to staging `2e0e0163`. Fresh staging reports, read from each report's own page:

| Check | Report | Now reads | Result |
|---|---|---|---|
| 11.x exact count | Crocs, full history (`669f1d85`) | "Crocs.com appears in 1,421 retrieved citations." No "approximately" on the page | PASS |
| 12.8 / 12.9 top three, prospect included | A Place for Mom, full history (`b589c1bb`) | "A Place for Mom is 31.5 percentage points below the top-three average visibility of 34.6%." (98.6 + 3.1 + 2.2) / 3 = 34.6 | PASS |
| 12.12 to 12.15 peers | A Place for Mom (`b589c1bb`) | "A Place for Mom sits within a 3.1-point visibility range alongside Caring and Petunia." (was no bullet) | PASS |
| No regression | PocketGuard, Oct 19 (`480544af`, rerun of `0197d0ef`) | "5.4 ... behind Quicken", "20.5 ... below the top-three average visibility of 53.8%", "7.8-point ... alongside Quicken and You Need A Budget", "PocketGuard.com appears in 678 retrieved citations." Word for word as before | PASS |

A Place for Mom's Before you send panel shows only the existing note on Care's 98.6% visibility; no wording flags.

**Still open: 9.5 / 13.2, the editor bar chart labels.** At 1440 the editor (V1) cuts the bar labels; the full-size
preview and the shared page are clean, so a prospect never sees it. Two fixes were tried in #422 and neither changed
the real editor, so both were taken out (`8065fda3`). Tracked as its own fix.

**Not changed, my call:** the source-mix bullet keeps both Editorial and UGC (S5 in the spec).
