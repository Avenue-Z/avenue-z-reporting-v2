# Paid Search Tab — Feedback Design

**Date:** 2026-06-24
**Status:** Approved (pending spec review)

## Context

Stakeholder feedback on the Paid Search (Google Ads) report tab covers four
items: replace search terms with top keywords, add a DMA drill-down to the geo
section, surface a custom date range with visible resolved dates, and resolve a
cost/clicks discrepancy versus the Google Ads UI.

Key facts established during exploration:

- The Paid Search and AEO pages are rendered by the **section/subsection** route
  `app/dashboard/[clientSlug]/reports/page.tsx` (and the portal equivalent),
  which uses **`GA4DatePicker`** ([components/report-sections/ga4/date-picker.tsx](../../../components/report-sections/ga4/date-picker.tsx)),
  not the richer `DateRangePicker`. `GA4DatePicker` has **no custom-range
  option** and shows only the preset label.
- The legacy `[reportSlug]` route wires in the full `DateRangePicker` (which has
  custom range), but it is not the route users navigate to. It also has a known
  double-push bug (two `router.push` calls), which is why `GA4DatePicker` exists.
- All Google Ads queries run through `awQuery` ([lib/paid-search/base.ts](../../../lib/paid-search/base.ts)),
  which resolves the window via `parseDateRange` ([lib/ga4/client.ts](../../../lib/ga4/client.ts)).
- The KPI query ([lib/paid-search/kpis.ts:42](../../../lib/paid-search/kpis.ts)) is
  un-segmented account-level `Cost, Clicks, Impressions` — so the discrepancy is
  **not** a row-multiplication/aggregation artifact.
- `parseDateRange` resolves `last_N_days` to `start = today − N, end = today`,
  i.e. **N+1 days including today's partial data**. Google Ads' "Last N days"
  excludes today. This window mismatch is the prime suspect for the discrepancy.

## Decisions

- Top keywords **replace** search terms (search terms get noisy once negative
  keywords are layered in).
- Keywords table includes a **Match Type** column.
- Geo section gains a **Region → DMA drill-down** (expand a region to see its
  DMAs), not a flat replacement.
- The `last_N_days` window fix is applied **globally** in `parseDateRange`
  (affects all report tabs — more correct and consistent).
- The date-picker enhancement is applied to the **shared `GA4DatePicker`**, so
  GA4, inbound-funnel, paid search, and AEO all gain it consistently.

## Item 1 — Search terms → Top keywords

**Goal:** Replace the search-terms section with a Top Keywords table.

- Rename `lib/paid-search/search-terms.ts` → `lib/paid-search/keywords.ts` and
  `components/report-sections/paid-search/search-terms.tsx` →
  `keywords.tsx`. Update the import/usage in
  `components/report-sections/paid-search/index.tsx`.
- Queries (exact Supermetrics field IDs verified via `field_discovery` for
  `ds_id = AW` during planning):
  - Metrics: `[Keyword, KeywordMatchType, Clicks, Impressions, Cost]`
  - Leads: `[Keyword, KeywordMatchType, ConversionTypeName, Conversions]`
- Transform mirrors the existing search-terms transform: merge metrics with
  lead-filtered conversions, compute CTR and CPL, sort by leads desc then cost
  desc, cap at top 50.
- Table columns: Keyword, **Match Type**, Clicks, Impressions, CTR, Cost,
  Leads, CPL. Default sort by leads desc.

**Verify:** Keywords table renders with match types; totals are sane; no
references to the old search-terms module remain (grep).

## Item 2 — Region → DMA drill-down

**Goal:** Each region row expands to reveal its DMAs (Google Ads "Metro area"),
sorted by leads.

- Fetch region + DMA together in `lib/paid-search/geo.ts`:
  - Metrics: `[Region, Metro, Clicks, Cost]`
  - Leads: `[Region, Metro, ConversionTypeName, Conversions]`
  - (DMA/Metro field ID verified via `field_discovery` during planning.)
- Aggregate into a nested structure: `region → { totals, dmas[] }`, each level
  carrying clicks / cost / leads. Single fetch; expansion is client-side (no
  per-click round-trips).
- `geo-section.tsx` becomes a small interactive client component: region rows
  (or the existing bar chart) with an expand affordance revealing the DMA
  breakdown sorted by leads.

**Verify:** Expanding a region shows its DMAs; DMA leads sum to the region
total; collapsing/expanding works; empty regions handled.

## Item 3 — Date picker: custom range + visible resolved dates

**Goal:** Add a custom range and always display the resolved start–end dates on
the shared `GA4DatePicker`.

- Add a **Custom Range** entry to the date column; selecting it reveals a
  calendar (reuse the shadcn `Calendar` + `custom:YYYY-MM-DD,YYYY-MM-DD`
  encoding already used by `DateRangePicker`). Preserve the single atomic
  `router.push` design.
- **Always display resolved dates** for the current selection (presets and
  custom), e.g. `Last 14 Days · Jun 10 – Jun 23, 2026`. Compute the displayed
  dates from `parseDateRange` so the label is guaranteed to equal the queried
  window — this is the QA hook.

**Verify:** Custom range selectable and applies on paid search + AEO; resolved
dates shown for every selection and match the data window after the Item 4 fix.

## Item 4 — Cost/clicks discrepancy fix + verify

**Goal:** Match Google Ads' "Last N days" window and confirm parity.

- In `parseDateRange`, change the `last_N_days` branch to end **yesterday** and
  span exactly N days: `start = today − N`, `end = today − 1`.
- Period-to-date presets (`this_week`, `this_month`, `this_quarter`,
  `year_to_date`) intentionally keep ending **today** (MTD/QTD/YTD semantics,
  matching Google Ads).
- **Blast radius:** changes "Last N days" for every report tab. Accepted —
  global consistency.

**Verify:** Pick one explicit fixed window and compare dashboard KPIs against
the Google Ads UI for the same window. Cost / clicks / conversions should align
within rounding. If they still diverge, the next suspect is **server-vs-Google
Ads account timezone** — investigate as a separate follow-up rather than
bundling a speculative timezone fix here.

## Out of scope

- Timezone normalization (only pursued if Item 4 verification still diverges
  after the window fix).
- Changes to the legacy `[reportSlug]` route / `DateRangePicker`.
- Reworking the portal picker beyond what the shared `GA4DatePicker` change
  provides.

## Risk / open questions

- Exact Supermetrics field IDs for `Keyword`, `KeywordMatchType`, and `Metro`
  (DMA) under `ds_id = AW` must be confirmed via `field_discovery` before
  wiring queries. If Match Type is not a standalone field, derive it from the
  keyword text formatting Supermetrics returns.
- DMAs can span state lines; grouping is driven by the row's own
  `(Region, Metro)` pair, which handles this naturally.
