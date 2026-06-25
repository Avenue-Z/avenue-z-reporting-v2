# Paid Search Refinements (Round 2) — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Context

Three pieces of follow-up feedback on the Paid Search (Google Ads) report tab,
after the round-1 work merged in PR #79:

1. Five KPI cards show no period-over-period delta: **Impressions, CTR, Avg CPC,
   Cost/Lead, Conversion Rate**. Cost, Clicks, and Leads already show deltas.
2. The "Leads Over Time" chart draws a **line and a bar on the same `leads`
   series** — the line is pure duplication and should be removed.
3. Changing the date range refetches data but shows **no loading indicator**.

Relevant current state:

- KPI deltas are computed in `transformKpis` ([lib/paid-search/kpis.ts](../../../lib/paid-search/kpis.ts)).
  Only cost/clicks/leads get a `delta`. The comparison-period data needed for the
  other five is **already fetched**: `compareTotals` carries Cost/Clicks/
  Impressions and `compareActionRows` yields compare leads (`cLeads`).
- `KpiCard` ([components/charts/kpi-card.tsx](../../../components/charts/kpi-card.tsx))
  already supports an `invertDelta` prop (down = green for "lower is better"),
  but `KpiGrid` ([components/report-sections/paid-search/kpi-grid.tsx](../../../components/report-sections/paid-search/kpi-grid.tsx))
  never passes it.
- "Leads Over Time" uses `ComboChart` with `bar={key:'leads'}` AND
  `line={key:'leads'}` ([components/report-sections/paid-search/leads-section.tsx](../../../components/report-sections/paid-search/leads-section.tsx)).
  `ComboChart` ([components/charts/combo-chart.tsx](../../../components/charts/combo-chart.tsx))
  currently **requires** both `bar` and `line`. `ComboChart` is also used by
  `hero.tsx` with a meaningful line — that must keep working.
- The dashboard report body is wrapped in
  `<Suspense key={`${activeSection}:${subsection ?? ''}`} fallback={<SectionSkeleton/>}>`
  ([app/dashboard/[clientSlug]/reports/page.tsx](../../../app/dashboard/%5BclientSlug%5D/reports/page.tsx) ~L210).
  The key omits the date range, so a range change does not remount the boundary
  and no skeleton shows. The portal page
  ([app/portal/[clientSlug]/reports/page.tsx](../../../app/portal/%5BclientSlug%5D/reports/page.tsx) ~L167)
  wraps the body in a Suspense with **no key at all**, so it never shows the
  skeleton on section-switch or range-change.
- `loading.tsx` is route-level only (pathname navigation), which is why it
  doesn't fire on searchParam-only changes.

## Decisions

- Cost-efficiency metrics **Avg CPC** and **Cost/Lead** use `invertDelta` (a
  decrease shows green). Impressions, CTR, Conversion Rate use normal up=green.
  Cost stays up=green (more spend is not inherently bad).
- The redundant line is removed by making `ComboChart`'s `line` prop optional
  (not by swapping to `BarChart`, which lacks an x-axis tick formatter and would
  drop the `weekLabel` formatting).
- The loading fix applies to **both** the dashboard and the portal report pages,
  reusing the existing `SectionSkeleton`.

## Item 1 — KPI deltas for the five missing metrics

**Goal:** Every KPI card shows a period-over-period delta when a comparison
period exists.

- Add `invertDelta?: boolean` to the `Kpi` interface in
  `lib/paid-search/types.ts`.
- In `transformKpis`, derive the compare-period values from data already passed
  in and compute deltas with the existing `delta(cur, prev)` helper (which
  returns `undefined` when `prev` is missing or `0`, so a missing comparison
  period yields no delta — current behavior preserved):
  - **Impressions** — `delta(impressions, compareImpressions)`
  - **CTR** — current vs `compareClicks / compareImpressions * 100`
  - **Avg CPC** — current vs `compareCost / compareClicks`; `invertDelta: true`
  - **Cost/Lead** — current vs `compareCost / compareLeads`; `invertDelta: true`
  - **Conversion Rate** — current vs `compareLeads / compareClicks * 100`
  - Each compare-derived value is `undefined` when its denominator is 0/missing,
    so `delta()` then yields `undefined` (no false deltas).
- `KpiGrid` passes `invertDelta={k.invertDelta}` to `KpiCard`.

**Verify (TDD):** extend `lib/paid-search/kpis.test.ts` — with a comparison
period supplied, all eight KPIs carry a numeric `delta`, and `cpc`/`cpl` carry
`invertDelta === true` while the others do not; with no comparison period, the
five new deltas are `undefined`.

## Item 2 — Remove the duplicate leads trend line

**Goal:** "Leads Over Time" shows only the bars.

- `ComboChart`: make `line` optional. Render the right-hand `YAxis` and the
  `Line` only when `line` is provided; keep the tooltip formatter correct when
  `line` is absent. `bar` remains required. `hero.tsx` is unaffected (still
  passes `line`).
- `leads-section.tsx`: remove the `line={...}` prop from the "Leads Over Time"
  `ComboChart`; keep `bar`, `xFormatter={weekLabel}`, and styling.

**Verify:** `tsc` + build clean; `hero.tsx` still renders its line; the leads
chart renders bars only with week labels intact.

## Item 3 — Loading indicator on date-range change

**Goal:** Changing the date range shows the section skeleton while new data loads,
on both dashboard and portal.

- Dashboard page: change the Suspense key to
  `` `${activeSection}:${subsection ?? ''}:${dateRange}:${compareRange ?? ''}` ``.
- Portal page: add the same key to its currently-unkeyed Suspense (variables
  `activeSection`, `subsection`, `dateRange`, `compareRange` are in scope where
  `getReportComponent` is called).
- Fallback stays `<SectionSkeleton />`.

**Verify:** `npm run build` clean; changing the range swaps in the skeleton, then
the updated numbers; switching sections still shows the skeleton (and now does so
on the portal too).

## Out of scope

- Delta coloring changes to other report tabs.
- Adding deltas to the keyword/geo tables (only the KPI grid was requested).
- Any change to `loading.tsx` or the route structure.

## Risk / notes

- `transformKpis` is pure and unit-tested; the delta additions are covered by
  the extended test.
- `ComboChart` and the report pages are client/server boundary code; verify with
  `npm run build` (not just `tsc`) — a `tsc`-clean change can still fail the
  Next.js build (as happened in round 1 with a client-bundle import).
