# Renaissance Paid Search Advertising — Design Spec

**Date:** 2026-06-17
**Module:** Paid Search Advertising (first of the Renaissance Dashboard Additions)
**Source PRD:** `renaissance_dashboard_additions_prd.md`
**Status:** Approved design — ready for implementation plan

---

## 1. Context

This is the first module in the Renaissance Dashboard Additions PRD (Phase 1). It
reports Renaissance **paid search performance from Google Ads** for a
**lead-generation** account (not e-commerce — no revenue/ROAS framing).

It is also the module that establishes shared infrastructure the later Phase 1
modules (Meta, LinkedIn) reuse:

- A re-established Supermetrics data client (`smQuery`) — Supermetrics was
  previously removed from this codebase; this module brings it back.
- A new dual-axis combo chart (bars + line on a secondary axis).
- An upgraded sortable data table with a totals row.

### Data source — validated against live data

The Supermetrics Google Ads connector (`ds_id: AW`) is **authenticated** on the
Avenue Z account, and the Renaissance account is reachable:

- Account ID `4136001852` → **"Renaissance Benefits"** (group: Avenue Z, via
  `google@avenuez.com`).

All required fields were confirmed present via `field_discovery` and validated
with real queries (see §6). **Dash Social (Phase 2) is not a Supermetrics
source** and is out of scope for this module.

---

## 2. Goals

- Single scrolling Paid Search report for Renaissance, sections in the PRD's
  specified top-to-bottom order.
- Surface **all 14 lead conversion actions**, grouped into Employer / Broker /
  Contact, with category subtotals — never collapsed into one opaque number.
- KPI scorecards that reconcile with the campaign table totals.
- Global date-range control with automatic prior-period comparison.
- Reuse the existing dashboard design system (KpiCard, charts, dark theme).

## 3. Non-Goals (this module)

- No revenue / ROAS framing (lead-gen account).
- No geo map — ranked horizontal bars only.
- No Meta / LinkedIn / Organic work (separate specs).
- No multi-subpage experience — one scrolling page.

---

## 4. Key deviation from the PRD (evidence-backed)

**PRD asks for "CPL comparison by lead category (Employer vs Broker vs
Contact)." We will NOT build per-category CPL.** Live data shows it cannot be
computed honestly:

- Google Ads attributes **Cost at the campaign/keyword level, not per
  conversion action**. There is no cost-per-conversion-action dimension.
- A campaign × conversion-action cross-tab (YTD) shows lead categories do **not**
  map cleanly to campaigns. The largest lead driver, `REN | AVZ | SEM | Brand |
  All Users | Select Geos`, produces leads of **every** category (employer,
  broker, and contact simultaneously); even the "Brokers" campaign produces a
  mix of contact, broker, and employer leads.

**What we build instead (all accurate):**

- **Leads by category**: per-action counts, category subtotals, and
  share-of-leads per category. (Lead counts segment cleanly by conversion
  action — this is real.)
- **Page-level blended Cost/Lead** KPI.
- **Campaign-level CPL** in the campaign table — both cost and leads exist per
  campaign, so this is honest and arguably more actionable (e.g. Brokers
  campaign ≈ $802/lead vs Brand ≈ $91/lead YTD).

We will **not** fabricate per-category CPL via proportional cost distribution
(it is mathematically identical to blended CPL for every category — fake
precision).

---

## 5. Architecture

Follows the existing GA4 pattern: route → server page → async RSC section →
server-side data layer → client chart/table components. URL search params drive
date range + comparison.

### 5.1 New report slug

Add `'paid-search'` to the `ReportSlug` union in `lib/db/schema.ts`. This is a
**new, distinct module**, separate from the existing demo-stub `'google-ads'`
slug (which stays as-is). Rationale: the PRD frames Paid Search as a lead-gen,
single-page, Renaissance-specific report — not the generic Google Ads layout.

Wire the slug into the report-section switch in
`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` and the corresponding
portal route, and add display name / nav metadata wherever report slugs are
labeled.

### 5.2 Supermetrics data client (re-established)

`lib/supermetrics/client.ts` — replace the deprecated stub with a real
`smQuery()` that:

- Reads the per-client API key from an env var whose **name** is stored in a new
  DB column `sm_api_key_env_var` (secrets stay in env, per CLAUDE.md convention).
- Submits an async query, polls until complete, returns typed rows (mirrors the
  GA4 client's submit→poll shape).
- Server-side only.

`lib/supermetrics/constants.ts` — restore `DS_IDS` with the **verified** ids:

```
GA4: 'GAWA', GOOGLE_ADS: 'AW', META: 'FA', LINKEDIN: 'LIA'
```

> Note: CLAUDE.md lists LinkedIn as `'LI'` — the live connector id is **`LIA`**.
> The doc value is wrong; use `LIA`.

`lib/supermetrics/types.ts` — typed response interfaces (no `any`).

> **Runtime auth dependency:** the MCP proves the *account* is connected, but the
> deployed app needs its own Supermetrics enterprise **API key**. Confirm the key
> exists and add it to the environment before this module can serve live data.
> Until then the section renders the existing empty/skeleton states.

### 5.3 New / upgraded UI primitives

- **`components/charts/combo-chart.tsx`** (new): Recharts `ComposedChart` —
  bars on the primary axis, a dashed line on a secondary axis, shared x-axis.
  Used by the hero chart and the weekly-leads chart. Honors `CHART_COLORS`.
- **`components/charts/data-table.tsx`** (upgrade): extend the current component
  (currently no sorting, no totals) to support:
  - Per-column client-side sorting (the campaign + search-term tables need it).
  - An optional pinned **totals row**.
  - Optional per-row delta rendering (for the nice-to-have campaign deltas).

  Keep the existing API backward-compatible (additive props), since other
  reports consume `DataTable`.

### 5.4 Section component

`components/report-sections/paid-search/index.tsx` — async RSC. Props:
`clientSlug`, `dateRange`, `compareRange`. Parses dates, dispatches the
Supermetrics queries below in parallel (`Promise.all`), transforms to
card/chart/table data, renders the six sections. Each section wrapped per the
existing error-boundary / skeleton conventions.

### 5.5 Config additions (DB)

Two additions to the `clients` table (`lib/db/schema.ts` + a Drizzle migration):

1. `sm_api_key_env_var: text` — name of the env var holding this client's
   Supermetrics API key.
2. `paid_search_config: jsonb` — per-client, **not hardcoded**:

```ts
interface PaidSearchConfig {
  googleAdsAccountId: string            // '4136001852' for Renaissance
  // Canonical conversion-action list + category. Required because the API omits
  // zero-conversion actions in a period, and category is NOT derivable from the
  // action name (e.g. `contact_broker_lead` is semantically a Broker action).
  leadActions: Array<{
    name: string                        // exact Google Ads conversion action name
    category: 'employer' | 'broker' | 'contact'
  }>
}
```

Renaissance defaults to the full 14-action set (7 employer / 2 broker / 5
contact). The authoritative name→category map comes from the Renaissance team
(Amir's doc) — see §9. We seed a best-guess from observed names and flag for
confirmation.

---

## 6. Section specifications

Global date control reuses `components/layout/date-range-picker.tsx`
(presets + automatic prior-period comparison already supported). PRD presets
"This Week / Last 4 Weeks / MTD / YTD" map to existing `this_week`,
`last_30_days` (or a new `last_4_weeks`), `this_month`/MTD, and `year_to_date`.
Add a `last_4_weeks` preset if a true 28-day bucket is required.

All Supermetrics field ids below were confirmed via `field_discovery(ds_id=AW)`.

### 6.1 Hero chart
- Weekly buckets, year-to-date. Dimension: `Weekiso` (or `yearWeekSunSat`).
- Bars = Cost (default), dashed line overlay on secondary axis = Leads.
- Bar-metric toggle: **Cost** (`Cost`) / **Clicks** (`Clicks`) /
  **Impressions** (`Impressions`) / **Leads** (scoped — see §6.4).
- Zero-lead weeks render `0`, not blank.

### 6.2 KPI scorecards
Reuse `components/charts/kpi-card.tsx` (already supports headline value,
tooltip, colored prior-period delta, sub-line). Cards:

| Card | Source |
|---|---|
| Cost | `Cost` |
| Clicks | `Clicks` |
| Impressions | `Impressions` |
| CTR | `Ctr` |
| Avg. CPC | `CPC` |
| Leads | **scoped** sum of form-fill actions (§6.4) |
| Cost / Lead | `Cost` ÷ scoped Leads |
| Conversion Rate | scoped Leads ÷ `Clicks` |

Each card shows prior-period delta from the comparison range. Benchmark/context
sub-line: default to prior-period context copy (open question §9).

### 6.3 Campaign performance table
- One row per campaign. Dimension: `Campaignname`.
- Columns: Campaign, Cost, Clicks, Impressions, CTR (`Ctr`), Avg. CPC (`CPC`),
  Leads (scoped), CPL (Cost ÷ campaign leads), Conversion Rate.
- Sortable on every column; **default sort: Cost descending**.
- **Totals row** reconciling to the KPI scorecards.
- Nice-to-have: row-level prior-period deltas on Cost and Leads.

### 6.4 Leads & Conversions (priority section)

**Leads definition (critical):** "Leads" = sum of the configured form-fill
conversion actions only (Google Ads category "Submit lead form"). It **excludes**
non-form conversions present on the account — validated live: `Calls from ads`
(category "Phone call lead") and `Local actions - Directions` (category "Get
directions") must **not** count as leads. Using the raw `Conversions` metric
would over-count and break reconciliation.

Implementation: query `Conversions` segmented by `ConversionTypeName`
(+ `ConversionCategory`), then filter/aggregate to the configured `leadActions`.

Contents:
- Weekly lead-count-over-time chart (combo/line; weekly buckets).
- Grouped breakdown by conversion action: per-action counts + Employer / Broker
  / Contact subtotals. All 14 configured actions shown; absent actions render
  `0`.
- Category breakdown: lead counts + **share-of-leads** per category.
  (No per-category CPL — see §4.)

### 6.5 Geographic performance
- Ranked horizontal bar views + metric cards; **no map**.
- Dimension: `Region` (state level). Emphasis on top geographies driving form
  fills (rank by scoped Leads, with Clicks/Cost available).

### 6.6 Search terms & keywords
- Dimension: `Searchterm` (Matched search term; SearchTermView report type).
- Columns: Search Term, Clicks, Impressions, CTR (`Ctr`), Cost, Leads (scoped),
  CPL.
- Sort: **Leads descending, then Cost descending**.

---

## 7. Formatting rules

- Currency: **USD**, whole-dollar rounding for cost cards and CPL.
- Percentages: one decimal place.
- Zero-lead weeks render `0`, never blank.
- Thousands separators on counts (existing `KpiCard` behavior).

---

## 8. States

- **Loading:** skeleton per section (existing convention / Suspense).
- **Empty / not connected:** prompt card (never an error) — e.g. when
  `paid_search_config` or the Supermetrics key is absent.
- **Error:** each section wrapped in an error boundary; one failed query must not
  crash the page.

---

## 9. Open questions & dependencies

1. **Authoritative 14-action → category map** (Employer 7 / Broker 2 / Contact
   5). Needed from the Renaissance team (Amir's doc). Observed YTD action names
   so far: `contact_individual_lead`, `contact_employee_lead`,
   `contact_provider_lead`, `contact_broker_lead`, `broker_group_lead`,
   `employer_dental_lead`, `employer_accident_lead`, `employer_vision_lead`
   (8 of 14 had data YTD). We seed a best-guess and flag for confirmation. Note
   `contact_broker_lead` shows the category is **not** name-derivable.
2. **Supermetrics runtime API key** for the deployed app (§5.2). Confirm it
   exists / provision it.
3. **Scorecard benchmark sub-line** (PRD open question): real benchmarks vs
   prior-period context vs static copy. Default: prior-period context.
4. **`last_4_weeks` preset**: confirm whether "Last 4 Weeks" must be a true
   28-day bucket distinct from `last_30_days`.

---

## 10. Acceptance criteria

- One scrolling Paid Search page shows the six sections in the specified order.
- All 14 configured lead conversion actions appear in Leads & Conversions,
  grouped into Employer / Broker / Contact with subtotals; absent actions show
  `0`.
- Headline Leads = sum of form-fill actions only (excludes calls/directions);
  KPI totals reconcile with the campaign table totals row.
- Changing the date range updates all sections and prior-period deltas
  consistently.
- The 14-action list and account id are read from per-client config, not
  hardcoded.

---

## 11. Out of scope (tracked for later specs)

- Meta Advertising module (Phase 1, next spec).
- LinkedIn Advertising module (Phase 1, next spec).
- Organic Social + Influencer (Phase 2; depends on a Dash Social connector).
- Media tracker surfacing (Phase 3; likely already covered by AEO reporting).
