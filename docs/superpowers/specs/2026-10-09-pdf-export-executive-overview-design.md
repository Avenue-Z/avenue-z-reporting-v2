# PDF export for the Executive Overview — design

**Date:** 2026-10-09 · **Status:** approved in brainstorm, awaiting spec review
**Builds on:** `2026-10-08-pdf-export-all-reports-design.md`, the shared pipeline (PR #348) plus AEO (#350) and Paid
Media (#352). Everything that spec says about the pipeline, the shared export behaviours (§5), error handling (§9)
and testing (§10) holds here, unless this spec changes it.

---

## 1. Why

On Renaissance, every report tab except the Executive Overview uses the server export once #348, #350 and #352 merge.
The Executive Overview still uses the browser's print, which can capture a page that is still loading, cut charts
at the edge, and split cards across pages. The all-reports spec listed it as a non-goal "to follow later as its own
PR on this pipeline"; this is that PR.

## 2. Goals and non-goals

**Goals**
- Export PDF on the Executive Overview produces the same quality of PDF as the other three sections (all-reports
  spec §2): fully loaded, nothing cut at the edges, no card, chart or row split across pages, and no title left alone
  at the bottom of a page. A staff export prints exactly what the client sees.
- The PDF shows the Demand Journey's per-stage detail, which the page reveals only on hover.

**Non-goals**
- **Commentary.** The page has no commentary section, so there is nothing to print.
- **Page filters.** The page has no date picker: it always serves the last 30 days against the prior 30.
- **The channels' source/medium breakdowns.** These are revealed on hover; the PDF leaves them out (D2).
- GA4, Inbound Funnel, Demand Overview and HubSpot Performance. They still use browser print.

## 3. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| E1 | **One more PR on the same pipeline** (PR 4). It is stacked on #352 and targets `dev`. It has its own review record. |
| E2 | **The Demand Journey cards print expanded.** This is a deliberate exception to all-reports D4 ("the default view"). Each card's sparkline and stats list are numbers the page shows nowhere else, and paper has no hover. |
| E3 | **The channel chart prints its default view.** That is By Volume, sorted by sessions, with no per-channel source/medium breakdown. |
| E4 | **The period stamp is always the last 30 days.** That is what the page serves, whatever `dateRange` the request carries. |

## 4. Switch-on and routing

- **`lib/export/sections.ts`:** the last commit adds `executive-overview` to `SERVER_EXPORT_SECTIONS`.
- **`lib/export/report-view.ts`:** `resolveExportView` gets an Executive Overview case.
  - It has no tabs: `subsectionId` is `null`, and so are `channel` and `view`.
  - `pageTitle` is `REPORT_NAMES['executive-overview']` ("Executive Overview"), as the page's header shows it.
  - The parity test (`components/export/report-views.pages.test.tsx`) gains the case.
- **`components/export/report-element.tsx`:** renders `<ExecutiveOverviewReport clientSlug={…} />`, which is what both
  report pages render.
- **Period stamp (E4), in `app/export/[clientSlug]/[section]/page.tsx`:**
  - For `executive-overview`, the served range is `last_30_days`, not the request's `dateRange`.
  - Reason: the report page passes its URL's `dateRange` to the button, and a stale `?dateRange=` left over from another section would otherwise stamp a period the numbers don't cover.
  - A test pins the stamp with a non-default `dateRange` in the request.

## 5. What prints

The component is `components/report-sections/executive-overview/`. It loads everything in one `Promise.allSettled`,
with no inner Suspense, so there are no skeletons to mark. A failed or unconnected source renders the page's own
`LoadFailed` / `NeedsConnection` / `NoData` card, and the PDF prints it as the page shows it.

| Element | Export |
|---|---|
| **Demand Journey** (`demand-journey.tsx`) | **Every connected card expanded (E2)**, with no hover handlers or hover styling (dimming, glow, accent fade). It shows the hero metric, the sub-metric *and* the hover label (they are complementary: "2.1% conv. rate" / "sessions in the last 30 days"), the delta, the sparkline and the stats list. "Not connected" cards print as they are. One `expanded = exportMode \|\| isHovered` switch drives the content; there is no second layout. The whole row is one block, and the cards stay side by side (the `lg:flex` row at the 979 px export width). |
| Web Analytics heading + "Last 30 days" | Kept with the KPI grid. |
| KPI grid (`kpi-card.tsx`, 8 cards) | One block. The "?" tooltip icons are hidden (`data-export-hide`). |
| **Sessions trend** (`sessions-trend-chart.tsx`) | The default view: all three series on and unsmoothed. The series toggles print as a static legend and the 7-day smoothing button doesn't print. The ⓘ hint is hidden. It prints on its dark panel (`data-export-chart`) as one block. |
| New vs Returning (`new-returning.tsx`) | As first rendered, with no hover highlighting. One block. |
| **Traffic by Channel** (`channel-tabs-chart.tsx`) | **E3.** The tab row prints as a label ("By Volume"), and the column headers as plain text, with no sort buttons or arrows. The "?" hint is hidden. Channel rows show their default layout, without the hover layout or source/medium breakdown. At most 10 rows, so the card is one block. Truncated channel names wrap. |
| Contact / Lead Creation (`contact-pacing.tsx`) | As shown, including "Scoped to agency-sourced campaigns." and the truncation note. The title is kept with its content, and the card is one block. |
| Pipeline Performance (`pipeline-performance.tsx`) | As shown. The title is kept with its content. Truncated owner names wrap (`data-export-wrap`). Each card is one block. |
| Section titles (`h2`) | Kept with what follows (`data-export-keep-with-next`). |

**Animation.** Recharts animation is turned off in export mode for the sparklines and the trend, so the PDF never
captures a half-drawn chart. (The trend already sets `isAnimationActive={false}` on some series; every series and
area gets it in export.)

**Live pages.** There is no behaviour change. Every behaviour branch checks `useExportMode()`, and the `data-export-*`
attributes are inert outside `.export-theme`.

## 6. Error handling

This follows all-reports §9. A rejected GA4 query renders `LoadFailed` for that chart. An unconnected CRM renders
`NeedsConnection`. A client without Peec gets the AEO stage's "Not connected" card. All of these print as shown,
and the export completes; none of them is "still loading".

## 7. Testing

- **Unit, each run failing first:**
  - The Journey in export mode is expanded on every connected card, shows both labels, has no mouse handlers, and is one block.
  - The trend, channel chart and KPI cards print no buttons, toggles, sort arrows or "?" hints.
  - The channel chart labels its view.
  - Titles are kept with what follows.
  - The live render is unchanged, pinned by tests.
- **Routing:** the parity test gains the Executive Overview case. The period-stamp test is described in §4.
- **Existing tests stay green.** The `locked-months-parity` snapshot's other-section case may change only in the
  Export PDF button's props. That is the same probe as PR 3: hash every case with the button removed and compare
  against `dev`.
- **Live acceptance** (`e2e/export/acceptance.mts`): Renaissance's Executive Overview, exported as staff and as a client. Each export is checked for:
  - no controls (`By Conversion`, `7-day`, sort arrows);
  - staff = client;
  - content box;
  - Letter landscape;
  - no system fonts;
  - under 4.5 MB.

  Time to ready is logged.
- **Page-by-page review** of the PDF (a contact sheet plus crops) shows:
  - the Journey row whole and readable;
  - no stranded titles;
  - nothing cut at the right edge.
- **Final whole-branch review**, then the PR to `dev`, then the review-record PR (`docs/qa/pdf-export-executive-overview-code-review.md`).

## 8. Risks and follow-ups

- **Journey width.** Four or five expanded cards side by side at 979 px may wrap stats labels. If the page check shows
  cramped cards, the export may switch to two rows. That decision is made on the PDF, not in advance.
- **PR #219** (Executive Overview CRM wiring design) is open. If its implementation lands first, this PR adapts to it, and any element it adds follows §5's rules.
- **Live-data gaps.** A client whose Salesforce isn't connected exercises only the `NeedsConnection` path. Renaissance
  covers the connected path.
