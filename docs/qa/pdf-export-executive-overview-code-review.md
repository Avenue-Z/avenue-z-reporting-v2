# Code Review Record — `feat/pdf-export-executive-overview` (PR #354)

**Feature under review:** PR #354, `feat(export): the Executive Overview exports on the server (PDF export PR 4)`

**Diff range reviewed:** `508d299..763fc36`, six commits on top of PR #352's head (`feat/pdf-export-paid-media`), so this record covers the Executive Overview only. #348, #350 and #352 have their own records (#349, #351, #353).

**Spec / plan** (both on branch `docs/pdf-export-all-reports-spec`):
- Spec: `docs/superpowers/specs/2026-10-09-pdf-export-executive-overview-design.md`, including its §9 amendments.
- Plan: `docs/superpowers/plans/2026-10-09-pdf-export-pr4-executive-overview.md`.

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| Journey | `components/report-sections/executive-overview/demand-journey.tsx` |
| Web Analytics | `sessions-trend-chart.tsx`, `kpi-card.tsx`, `new-returning.tsx` |
| Channels | `channel-tabs-chart.tsx` |
| Structure, CRM | `index.tsx`, `contact-pacing.tsx`, `pipeline-performance.tsx` |
| Switch-on | `lib/export/sections.ts`, `lib/export/report-view.ts`, `components/export/report-element.tsx`, `app/export/[clientSlug]/[section]/page.tsx` |
| Tests | four new `*.export.test.tsx` files; `report-views.pages.test.tsx` and the export `page.test.tsx` extended; `e2e/export/acceptance.mts` (Executive Overview run + a full-width check on every export) |

---

## §1 How it works

**What prints.** The export renders the live `ExecutiveOverviewReport`, so every number is the page's own:
- **GA4** (`ga4Query`): KPIs, the daily trend, new vs returning, and channels.
- **Peec** (`getPeecOverview`, year to date): the AEO Journey stage.
- **Salesforce through Supermetrics:** weekly contacts or, for a campaign-scoped client, leads; and the pipeline.

The component resolves its own windows; the export page passes it only the slug. What changes is the view:
- **Demand Journey.** Every connected card prints expanded: the hero metric, both labels, the delta, the sparkline and the stats list. This is the one deliberate exception to "default view", because paper has no hover and those numbers appear nowhere else.
  - "Not connected" cards print as they are.
  - Stages the client hides (`hidden_journey_stages`) stay hidden. Renaissance hides Inbound and Pipeline.
- **Trend.** All three series, unsmoothed. The toggles print as a static legend, with no "7d avg".
- **Traffic by Channel.** By Volume, sorted by sessions, as a label. Rows print their default layout (sessions, share, CVR), with no hover layer and no source/medium breakdown.
- **CRM blocks.** As on the page, including "Couldn't load" and "Not connected".
- **Hints.** "?" hints are hidden.

**No reporting period** (spec §9.1). The page mixes windows:
- 30 days: Web Analytics.
- Year to date: the AEO stage, Contact Creation, Closed Won.
- As of today: open pipeline.

The live button stamps no period here (the tested rule "stamp ⇔ picker"), and the export does the same: `served = null` (`page.tsx:53`), whatever `dateRange` the request carries. Each section keeps its own window label.

**Page breaks** use inert `data-export-*` attributes under `.export-theme` (unchanged):
- **Kept with what follows:** section titles, "Last 30 days", the scoped note, and Pipeline's window line.
- **Whole blocks:** the KPI grids, the trend, New vs Returning, the channel chart, Contact Creation, and each Journey card.
- **The Journey as a whole** is one block only while it is one row (`demand-journey.tsx:62`). With two rows it breaks between them.
- **Dark panels:** the Journey, trend, New vs Returning and channel chart print on the dark panel.

**Live pages.** There is no behaviour change. Every behaviour branch checks `useExportMode()`. In the channel and trend charts, the live JSX moved into ternaries with only its indentation changed. The `locked-months-parity` snapshot did not change.

---

## §2 Verification method

**Unit, executed:**
- `npx vitest run`: 2592/2592.
- `tsc` clean, `check:rsc` passes, `next build`.
- Lint: no new errors. `channel-tabs-chart.tsx`'s 4 `preserve-manual-memoization` errors are identical on the base.
- Every new test was run failing first.

**Live acceptance** (`npm run e2e:export`, local production build, live data):
- The Executive Overview was exported as staff and as a client, posting a stale `custom:2026-08-01,2026-08-31` range.
- Both exports had:
  - no toggles, tabs, sorts or hover text;
  - no "Reporting period";
  - "LAST 30 DAYS" printed;
  - staff = client;
  - 5 pages, 0.40 MB;
  - ready in 3.4–8.7 s.
- **New check on every section's export:** the header stamp ends at the content box's right edge, so the page was not shrunk to fit. It read 762.0 pt on every export.
  - The threshold (> 757 pt) was checked against the reviewer's probes: 762.7 pt passed without overflow, and 667.5 pt failed with it.

**Page-by-page review, executed.** The client PDF was rasterized (contact sheet plus a 110 dpi crop of the Journey):

| Page | Content |
|---|---|
| 1 | header + Journey |
| 2 | Web Analytics KPIs |
| 3 | trend + New vs Returning |
| 4 | channels |
| 5 | CRM |

No stranded titles, nothing cut, and the Journey is legible on the dark panel.

**Final review, executed.** A fresh reviewer read the whole branch with the plan's Review Focus. It also ran headless-Chrome probes: one replicating the pacing tooltips, one testing whether `opacity: 0` text reaches the PDF. It found 2 Important and 4 Minor. The Important findings and two re-graded Minors were fixed in `763fc36` with tests that failed first.

**Not verified (flagged):**
- **The connected CRM path and a four-stage Journey.** Renaissance hides two stages, and locally Salesforce returns 403 through Supermetrics, so the PDF shows `LoadFailed`. Both rest on unit tests; one signed-in staging export of a client with the CRM connected closes it.
- **Vercel's Chromium (`@sparticuz/chromium`).** Not run.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| 1 | ● | CONFIRMED | spec E4 → `page.tsx:53` | Planning found that the approved "stamp last 30 days" would mislabel a page that mixes 30-day, YTD and as-of-today windows. | Spec amended (§9.1); **no period stamped**, pinned |
| 2 | ○ | CONFIRMED | spec §5 → `demand-journey.tsx` | The 979 px export viewport is below `lg`, so the Journey is the page's 2-column grid, not one row. | Spec amended (§9.2) |
| 3 | ○ | CONFIRMED | `demand-journey.tsx` | Hero label and expanded section render only when open in export (the plan said style-only), so an unconnected card carries no hidden stats. | Ruling: accepted |
| 4 | ○ | CONFIRMED | `channel-tabs-chart.export.test.tsx` | The "no cursor class" assertion excludes the hidden hint subtree, which keeps its own class at `display: none`. | Ruling: accepted |
| 5 | ○ | CONFIRMED | `structure.export.test.tsx` | Whole-page renders got a 20 s timeout (the first cold run took 6.9 s). | Ruling: accepted |
| 6 | ● | CONFIRMED | `contact-pacing.tsx:187` | **Final review, Important:** each weekly bar's `w-max` absolute tooltip overflowed the 979 px content width, so Chromium's print shrank every page by about 11% (probe: right edge 762.7 → 679.7 pt). | **Fixed** `763fc36`: hidden in export; full-width acceptance check on every export |
| 7 | ● | PLAUSIBLE | `demand-journey.tsx:62` | **Final review, Important:** four expanded stages (~730 px) as one block exceed what page 1 has under the header (~635 px), so page 1 would be the header alone, or the panel splits. | **Fixed** `763fc36`: one block only when one row |
| 8 | ● | CONFIRMED | `pipeline-performance.tsx:116` | Final review Minor, re-graded up (a stranded title): Pipeline's window line wasn't kept with its tiles. | **Fixed** `763fc36` |
| 9 | ○ | CONFIRMED | `e2e/export/acceptance.mts:240` | Final review Minor, re-graded up (checks that couldn't fail): the arrow regex was case-sensitive against uppercase headers, and `/last 30 days/i` was satisfied by the Journey label. | **Fixed** `763fc36` |
| 10 | ○ | CONFIRMED | tests | No test pins `isAnimationActive` off in export, or the Journey's absent mouse handlers. | Follow-up |
| 11 | ○ | CONFIRMED | `structure.export.test.tsx` | The export-mode `LoadFailed` path for a *rejected* GA4 query is not unit-tested (empty rows give NoData). | Follow-up |
| 12 | ○ | CONFIRMED | `e2e/export/acceptance.mts` (PR 2 check) | AEO Technical Audit staff = client failed in 2 of 4 runs. Once it was a real vendor-cache refresh between the two exports. Once the words were identical but pdftotext read a multi-line table header in a different order. The comparison is order-sensitive. | Follow-up (outside this range) |

---

## §4 Detail

**#1: Period stamp.**
- **What a stamp would have said:** "Reporting period Sep 10 – Oct 9" above a Pipeline block that says "Closed won is year to date", which is two contradictory statements on one page.
- **What the live button does:** `usesPageRange` excludes this section, and `lib/export-period.pages.test.tsx` pins it.
- **The fix:** the export follows the live button. `page.test.tsx` posts a stale August range and asserts no "Reporting period", and the acceptance run does the same against live data.

**#6: Print shrink.**
- **Mechanism:**
  - Chromium's `page.pdf()` lays the page out at the viewport width, then fits the document's scroll width to the paper.
  - An `opacity: 0` tooltip still takes layout space. The last bar's tooltip ("Week of Oct 5 · 52 contacts so far, 3 of 7 days") reaches about 150 px past 979 px.
  - Every page then scales by 979 / 1129 ≈ 0.87.
- **Why existing checks missed it:** `outsideBox` measures words against the content box, and a uniformly shrunk page has every word inside it.
- **The fix:** the new check compares the right-aligned stamp's end with the content box's right edge, which catches a shrink from any cause, in any section.
- **Also learned:** the reviewer's probe shows Chromium leaves `opacity: 0` / `max-height: 0` text out of the PDF text layer. The real hazard of hidden hover layers is layout overflow, not hidden text.

**#7: Journey on page 1.**
- **Measured (Renaissance PDF):** AEO card ~310 px; GA4 card ~408 px; two-stage panel ~462 px.
- **Estimated:** a four-stage panel is ~730 px. Page 1 has ~635 px under the header, and a page holds 739 px.
- **Why that breaks:** as a single block, the panel moves to page 2, leaving page 1 as just the header strip.
- **The fix:** two rows now break between rows, and each card stays whole. A one-row Journey keeps the block, because it fits.
- Not yet seen live (see §2).

**#12: Technical Audit flake.**
- **What the check does:** `body()` joins words in extraction order.
- **Why it varies:** with sub-pixel differences between two renders, pdftotext reads a wrapped multi-line `thead` in a different order.
- **Suggested fix:** compare per-page sorted glyph multisets plus page starts, rather than reading order.

---

## §5 Follow-ups

**Needs a live call first**
- One signed-in staging export of a client with the CRM connected and all four Journey stages. This covers #7 live, Contact Creation and Pipeline printed with data, and the full-width check with the pacing bars present.
- One signed-in export on a Vercel deploy.

**Cleanup**
- **#10:** tests for the animation flag and absent mouse handlers.
- **#11:** an export-mode test with a rejected GA4 query.
- **#12:** make the staff = client comparison order-insensitive.

Nothing here blocks the ship. The staging CRM export is the highest-value item.
