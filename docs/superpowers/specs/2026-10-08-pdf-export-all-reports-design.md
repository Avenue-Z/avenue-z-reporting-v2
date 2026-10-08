# PDF export for AEO and Paid Media — design

**Date:** 2026-10-08 · **Status:** approved in brainstorm, awaiting spec review
**Builds on:** `2026-10-06-organic-social-pdf-export-v2-design.md` (the server-rendered Organic Social export,
PRs #332 and #339, on `staging`). Everything that spec says about the pipeline (Chromium, auth, readiness, the time
budget, the theme, page breaks) still holds unless this one changes it.

---

## 1. Why

Export PDF renders on the server only on Organic Social. Every other report still uses the browser's print, which
can capture a page that is still loading, cut charts at the edge, and split cards across pages. AEO and Paid Media
are the reports clients read most after Organic Social, so they come next.

## 2. Goals and non-goals

**Goals**
- Export PDF on every AEO and Paid Media tab produces the same quality of PDF as Organic Social:
  - fully loaded;
  - nothing cut at the edges;
  - no card, chart or table row split across pages, and no title left alone at the bottom of a page;
  - links clickable;
  - a staff export prints exactly what the client sees, including the client's commentary.
- One export pipeline for every section, so later reports are a per-component change, not a new pipeline.

**Non-goals**
- GA4, Inbound Funnel, Executive Overview, Demand Overview and HubSpot Performance. They keep browser print, and each
  can follow later as its own PR on this pipeline.
- Whole-report PDFs (every tab in one file).
- Printing content that is hidden behind a click on screen (see §3).
- Adding commentary to the two tabs that have none (AEO Technical Audit, Paid Media Overview). Follow-up, §11.
- Refactoring the two report pages' duplicated section switch (tracked tech debt). This design pins to it with a
  parity test instead.

## 3. Decisions (from the brainstorm)

| # | Decision |
|---|---|
| D1 | **The tab you're on.** One PDF per tab, as Organic Social. |
| D2 | **Same quality bar as Organic Social** on day one (§2 goals). |
| D3 | **Scope: AEO and Paid Media**, all tabs. Organic Social (all tabs) is already done. |
| D4 | **The default view.** Anything revealed by a click inside the report (see-all rows, expanded rows, metric toggles, the Peec/Profound tabs) prints as it first loads. **Page-level filters carry over:** date range, comparison range and AEO's model filter (`?models=`), because they define the page the user is looking at. |
| D5 | **Approach A:** one export route and one export page render the *same* report component as the live page, in export mode. No print-only copies of reports. |
| D6 | **Three PRs:** (1) shared pipeline, (2) AEO, (3) Paid Media. Each has its own review record and switches its report on when it merges. |
| D7 | **Commentary prints wherever the live tab shows it.** That is 6 of the 8 tabs, as the client's approved entry. |

## 4. Architecture (PR 1)

```
ExportPdfButton (report page, sections in SERVER_EXPORT_SECTIONS)
  --POST {clientSlug, section, subsection, dateRange, compareRange, models, tz}-->
/api/export/pdf (session → canOpenPortal → section enabled? → exportReportView)
  --headless Chromium, requester's session cookie-->
/export/[clientSlug]/[section]?subsection&dateRange&compareRange&models&tz
  → header (logo, client, page title, stamp) → <report component> in ExportModeProvider → ExportReadyReporter
  --window.__exportReady--> page.pdf() → Letter landscape
```

**Request** (`lib/export/request.ts`):
- `ExportRequest` gains `section` and `models`.
- `section` must be in `SERVER_EXPORT_SECTIONS`, else 400.
- `models` is optional. It is validated with a strict character set and length, as the ranges are, and passed
  through as the page passes it. Unknown model ids are dropped by the report, as on the page.
- `exportPagePath` builds `/export/<slug>/<section>?…`.

**Route** (`app/api/export/pdf/route.ts`):
- Same flow. The 404 checks `client.enabledReports.includes(section)`.
- The view comes from `exportReportView`. An unknown or hidden subsection is the section's Overview, as on the page.
- The log line gains `section=`.
- Budgets, size limit, steps and error mapping are unchanged.

**Export page:** `app/export/[clientSlug]/[section]/page.tsx` replaces `app/export/[clientSlug]/organic-social/`.
- `requirePortalAccess`, then 404 if the section isn't enabled or has no export.
- Renders the same header, theme, fonts and ready reporter as today.
- Locked months stay Organic Social-only, inside `OrganicSocialReport`, as today.

**`exportReportView(client, section, subsection, params)`** (`components/export/report-views.tsx`): returns
`{ subsectionId, pageTitle, periodShown, element }`.
- `element` is the live report component with the props the report page passes.
- `periodShown` follows the page's `usesPageRange` rule.
- Organic Social moves here from `lib/export/organic-social-view.ts`.
- **Parity test:** for every section and tab in scope, run both real report routes (portal and dashboard SPA). Assert
  the element `exportReportView` returns has the same component and props as the one each route renders, and the same
  page title. Known drift is listed in the test, not hidden:
  - the dashboard drops Paid Media Overview's `compareRange` (dashboard `reports/page.tsx`).
  - The export follows the portal. Recorded as a finding in PR 1's review record; the live page is not changed here.

**Button:**
- `ServerExport` gains `section` and `models`.
- Both report pages pass `serverExport` when `activeSection` is in `SERVER_EXPORT_SECTIONS`.
- PR 1 ships the list as `['organic-social']`, so it changes nothing users see. PRs 2 and 3 add `peec-ai` and
  `paid-media` in their last commit.

**Shared charts:** in export mode, `bar-chart.tsx`, `combo-chart.tsx`, `peec-ai/slope-chart.tsx`,
`peec-ai/bot-vs-human-scatter.tsx` and the PR-influence bar chart (`pr-influence-tables.tsx`) turn off animation, as
`line-chart.tsx` already does. Otherwise the PDF can capture a chart mid-animation. The readiness check already waits
for every Recharts surface. `peec-ai/visibility-chart.tsx` is plain SVG drawn on first render, so it needs no
readiness hook.

## 5. Shared export behaviours (used by PRs 2 and 3)

Small export-mode branches in shared components, each tested once:

- **`SortableTable`** (`peec-ai/sortable-table.tsx`) and **`DataTable`** (`components/charts/data-table.tsx`):
  - **Rows:** default sort, the first `initialPageSize` rows (all rows where the table has no page size).
  - **Controls:** no sort buttons, filter inputs or "See all".
  - **Truncation:** a line under the table, "Showing N of M", when rows are cut.
- **Table paging and width** (`export-theme.css`):
  - Each row is `break-inside: avoid`.
  - `thead` repeats on each page (`display: table-header-group`).
  - Scroll containers become `overflow: visible`, and cells wrap.
  - The table's title is kept with its first rows (`data-export-keep-with-next`).
  - A table short enough for a page is one block.
- **Hover-only hints** (`InfoTooltip`, KPI `tooltip` icons): hidden in the export (`data-export-hide`).
- **Toggles shown as labels:** a metric or view toggle prints as plain text naming the view shown, never as buttons.

## 6. AEO (PR 2)

Tabs: Overview (`peec-ai/index.tsx`), PR Influence (`pr-influence.tsx`), Content Impact (`content-impact.tsx`),
Technical Audit (`technical-audit.tsx`). All render through the live component, including the Overview's per-client
part composition (DB template plus `reportSectionConfig`), and get `models` as the page passes it (not Technical
Audit, as on the page).

| Element | Export |
|---|---|
| Provider tabs (`provider-tabs.tsx`) | The first provider's section (the live default; the export browser has no saved choice), with the tab row as a plain label. |
| KPI cards (`parts/kpi-cards.tsx`, Content Impact's strip) | Each row of cards is one block. |
| Visibility chart | Default weekly view; one block with its title; no toggle. |
| Slope chart | Default metric (`ai-referral`); one block; no toggle. |
| Bot-vs-human scatter | Drawn without hover; one block. |
| Tables (rankings, domains, LLM breakdown, PR placements, editorial domains, content performance, competitor tables, audit tables) | §5 table rules. Row counts as on screen: 10 for most, 100 for PR placements, 20/15 where set. |
| Sentiment insights | Theme rows collapsed, as they first load. Its skeleton gets `data-export-pending`. |
| AI synopsis | Off today (`SHOW_AI_NARRATIVE`). Its skeletons get `data-export-pending` so turning it on can't print a placeholder. |
| ⓘ hints | Hidden. |
| Commentary | Overview, PR Influence, Content Impact (`SharedPartsHeader`): the client's entry, one block. Technical Audit has none. |

**Switch-on:** the last commit adds `peec-ai` to `SERVER_EXPORT_SECTIONS`.

## 7. Paid Media (PR 3)

Tabs: Overview (`paid-media/overview/index.tsx`), Paid Search (`paid-search/index.tsx`), Meta
(`meta-ads/index.tsx`), LinkedIn (`linkedin-ads/index.tsx`). Each loads all its data before rendering (one
`Promise.all`, no inner Suspense), so there are no skeletons to mark. A failed fetch renders the live page's
`Fallback` card, and the PDF prints it as the page shows it.

| Element | Export |
|---|---|
| Overview KPI cards | The totals row, then one block per channel row. |
| Overview trend (`overview/trend.tsx`) | Default metric (spend), every channel on; toggles as labels; one block. |
| Paid Search hero (`hero.tsx`) | Default metric (cost); the four-metric toggle as a label; one block. |
| Paid Search campaign and keyword tables | §5 table rules. Keywords print the default "≥10 clicks" view, with the toggle as a label. |
| Meta / LinkedIn creative tables | Top level only (Meta campaigns, LinkedIn campaign groups), collapsed as on first load; no expand arrows or sort buttons. |
| Geo sections (Paid Search, Meta, LinkedIn) | The top 10 regions, rows collapsed, plus the bar chart. One block if it fits, else the chart and the table are separate blocks. |
| KPI hover hints | Hidden. |
| Commentary | Paid Search, Meta, LinkedIn: the client's entry, one block. Overview has none. |

**Switch-on:** the last commit adds `paid-media` to `SERVER_EXPORT_SECTIONS`.

## 8. Commentary

Each tab draws its commentary through `SharedPartsHeader`, the same as Organic Social. Its export form
(`commentary-panel.tsx`) already prints the entry a client opens on: chosen server-side (`clientEntryId`), approved
only, with no editor, drafts or buttons, as one block. It prints only where the live tab shows commentary, which
depends on the client's `sharedParts` setup. Nothing new is built. Each PR's tests and the acceptance run check that a
tab with an approved entry prints it, and that a staff export with a newer draft prints the client's entry.

## 9. Error handling

Unchanged from the Organic Social spec §8:
- **Not ready within 40 s:** 504 "still loading", with no partial PDF.
- **Other failures:** 500, logged with the failed step.
- **Over 4 MB:** 413.
- **Fonts:** the export's fonts cover the glyphs these sections use (#339).

**New in this design:**
- A section not in the allow-list, or not enabled for the client, is 400 or 404 before Chromium launches.

## 10. Testing

- **PR 1:**
  - request validation: unknown section rejected, `models` charset, a hidden subsection resolved to Overview;
  - the route's access and 404 per section;
  - the `exportReportView` parity test against both report routes;
  - each shared chart's animation off in export mode;
  - Organic Social's existing export tests unchanged.
- **PRs 2 and 3:** export-mode render tests per component:
  - no buttons, inputs or toggles;
  - default rows and the "Showing N of M" line;
  - blocks and kept titles;
  - hidden hints;
  - loading markers;
  - commentary present.
  Also a staff render identical to a client render.
- **Acceptance** (`npm run e2e:export`, real Chrome, production build, live data, Node 26): every tab of the
  section a PR switches on, exported as a client and as staff. Each export checks:
  - the time to ready;
  - the content box;
  - blocks on one page and titles with their content;
  - no system fonts;
  - no staff-only text;
  - staff = client;
  - under 4 MB.
- **After merge:** one signed-in export per section on a Vercel deploy.

## 11. Risks and follow-ups

**Risks:**
- **Time budget.** AEO Overview fetches Peec, Profound and GA4. The acceptance run records each tab's time to ready.
  A tab near the 40 s budget is flagged before its section is switched on. The budget is not raised silently.
- **Long tables.** PR placements prints up to 100 rows. Rows are the only split points, and the 4 MB check guards size.

**Follow-ups (not in this project):**
- Commentary on AEO Technical Audit and Paid Media Overview.
- The dashboard's missing Paid Media Overview `compareRange` (live page drift).
- GA4, Inbound Funnel, Executive Overview, Demand Overview and HubSpot Performance on this pipeline.
- Unifying the portal and dashboard section switch (tech debt).
- One export at a time per user (T15 in the #332 record).
