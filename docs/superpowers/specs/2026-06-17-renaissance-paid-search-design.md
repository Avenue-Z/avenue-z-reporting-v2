# Renaissance Paid Search Advertising — Design Spec

**Date:** 2026-06-17
**Module:** Paid Search Advertising (first of the Renaissance Dashboard Additions)
**Source PRD:** `renaissance_dashboard_additions_prd.md`
**PRD decision log:** `2026-06-17-renaissance-paid-search-prd-decisions.md`
**Status:** Revised after spec review — ready for implementation plan once §9
blocking dependencies clear.

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
- KPI scorecards that reconcile with the campaign table totals (see §6.7).
- Global date-range control with automatic prior-period comparison.
- Reuse the existing dashboard design system (KpiCard, charts, dark theme).

## 3. Non-Goals (this module)

- No revenue / ROAS framing (lead-gen account).
- No geo map — ranked horizontal bars only.
- No Meta / LinkedIn / Organic work (separate specs).
- No multi-subpage experience — one scrolling page.

---

## 4. PRD conflicts — resolved (acting product sign-off, Paul, 2026-06-17)

Two PRD requirements conflict with what the live Google Ads data supports. These
were **not** resolved unilaterally in this spec: Paul signed off as acting
product owner on 2026-06-17, and both are recorded — with evidence, rationale,
the rejected alternative, and revert path — in the **PRD decision log**
(`2026-06-17-renaissance-paid-search-prd-decisions.md`) for review with Amir
(PRD owner). Summary:

- **C1 — Per-category CPL (PRD §139):** Google Ads attributes cost at the
  campaign/keyword level, not per conversion action, and live data shows lead
  categories do not map to campaigns (the Brand campaign drives all categories
  at once). **Resolution:** ship leads-by-category (counts, subtotals,
  share-of-leads) + page-level blended Cost/Lead + **campaign-level CPL** in the
  campaign table. No fabricated per-category CPL.
- **C2 — Headline Leads scope (PRD §125 vs §133):** §125's assumption that *all*
  account conversions are form-fills is factually wrong — the account also
  carries `Calls from ads` and `Directions` conversions. **Resolution:** headline
  **Leads = sum of the 14 configured form-fill actions only**. This *is* the
  PRD's §133 "sum of all 14" (the 14 actions are the form fills); it only
  corrects §125's "all conversions" claim.

---

## 5. Architecture

Follows the existing GA4 pattern: route → server page → async RSC section →
server-side data layer → client chart/table components. URL search params drive
date range + comparison.

### 5.1 Report slug — repurpose `google-ads`

The existing `'google-ads'` slug is a **dormant demo stub**: wired into the
dashboard/portal route switches and labeled in `lib/constants.ts`, but present
in **no client's `enabledReports`** (verified across `scripts/seed.ts` and the
route files). Rather than introduce a parallel `'paid-search'` slug and leave
undisposed debt, we **repurpose `'google-ads'`**:

- Replace the stub component with the new lead-gen Paid Search RSC.
- Relabel the report **"Paid Search"** in `lib/constants.ts` (and any nav/label
  map) and in `ai-summaries`' slug metadata.
- Keep the `'google-ads'` `ReportSlug` value (no schema enum churn); the three
  route switches (`app/dashboard/.../[reportSlug]/page.tsx`,
  `app/portal/.../[reportSlug]/page.tsx`, `app/portal/.../reports/page.tsx`)
  point the `'google-ads'` case at the new component.
- Enable it for Renaissance by adding `'google-ads'` to its `enabledReports`.

> If a future client needs a *generic* (non-lead-gen) Google Ads report, that
> becomes a new archetype/slug at that time. Not needed now (YAGNI).

### 5.2 Supermetrics data client (re-established)

`lib/supermetrics/client.ts` — replace the deprecated stub with a real
`smQuery()` that:

- Reads the per-client API key from an env var whose **name** is stored in a new
  DB column `sm_api_key_env_var` (secrets stay in env, per CLAUDE.md convention).
- Submits an async query, then polls until complete (mirrors the GA4 client's
  submit→poll shape), with:
  - a **per-poll timeout** and an overall **poll-loop cap** (max attempts /
    wall-clock budget) after which the call rejects with a typed `SmTimeoutError`
    distinct from `SmQueryError`;
  - **rate-limit handling**: respect `429`/`Retry-After` with bounded backoff;
  - results returned as typed rows (no `any`).
- Server-side only.

`lib/supermetrics/constants.ts` — restore `DS_IDS` with the **verified** ids:

```
GA4: 'GAWA', GOOGLE_ADS: 'AW', META: 'FA', LINKEDIN: 'LIA'
```

> CLAUDE.md lists LinkedIn as `'LI'`; the live connector id is **`LIA`**. Tracked
> as an action item (§12) to correct CLAUDE.md so `'LI'` is not reintroduced.

`lib/supermetrics/types.ts` — typed response + error interfaces.

> The deployed app needs its own Supermetrics enterprise **API key** — the MCP
> connection only proves the *account* is linked. This is a **blocking
> dependency** (§9).

### 5.3 New / upgraded UI primitives

- **`components/charts/combo-chart.tsx`** (new): Recharts `ComposedChart` — bars
  on the primary axis, a dashed line on a secondary axis, shared x-axis. Used by
  the hero chart and the weekly-leads chart. Honors `CHART_COLORS`.
- **`components/charts/data-table.tsx`** (upgrade): extend the current component
  (currently no sorting, no totals) with **additive, backward-compatible** props:
  - per-column client-side sorting (campaign + search-term tables need it);
  - an optional pinned **totals row**;
  - optional per-row delta rendering (nice-to-have campaign deltas).

  Existing `DataTable` consumers must compile and render unchanged.

### 5.4 Section component

`components/report-sections/paid-search/index.tsx` — async RSC (wired to the
`'google-ads'` slug per §5.1). Props: `clientSlug`, `dateRange`, `compareRange`.
Parses dates, dispatches the Supermetrics queries below in parallel
(`Promise.all`), transforms to card/chart/table data, renders the six sections.
Each section wrapped per the existing error-boundary / skeleton conventions
(see §8 for timeout vs error behavior).

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
contact). The authoritative name→category map is a **blocking dependency** for
acceptance (§9), sourced from the Renaissance team (Amir's doc).

---

## 6. Section specifications

Global date control reuses `components/layout/date-range-picker.tsx`
(presets + automatic prior-period comparison already supported).

PRD §62 requires presets **This Week / Last 4 Weeks / MTD / YTD**. `this_week`,
MTD (`this_month`), and YTD (`year_to_date`) exist. **"Last 4 Weeks" is
required** — the only open item is whether the existing `last_30_days` is an
acceptable implementation or a true 28-day `last_4_weeks` bucket must be added
(product confirm, §9).

All Supermetrics field ids below were confirmed via `field_discovery(ds_id=AW)`.

### 6.1 Hero chart
- Weekly buckets, year-to-date. Dimension: `Weekiso` (or `yearWeekSunSat`).
- Bars = Cost (default), dashed line overlay on secondary axis = Leads (scoped).
- Bar-metric toggle: **Cost** (`Cost`) / **Clicks** (`Clicks`) /
  **Impressions** (`Impressions`) / **Leads** (scoped — §6.4).
- Zero-lead weeks render `0`, not blank.

### 6.2 KPI scorecards
Reuse `components/charts/kpi-card.tsx` (headline value, tooltip, colored
prior-period delta, sub-line). Cards:

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

Prior-period delta from the comparison range. Benchmark/context sub-line:
default to prior-period context copy (open question, §9).

### 6.3 Campaign performance table
- One row per campaign. Dimension: `Campaignname`.
- Columns: Campaign, Cost, Clicks, Impressions, CTR (`Ctr`), Avg. CPC (`CPC`),
  Leads (**scoped**, §6.7), CPL (Cost ÷ scoped campaign leads), Conversion Rate.
- Sortable on every column; **default sort: Cost descending**.
- **Totals row** reconciling to the KPI scorecards (§6.7).
- Nice-to-have: row-level prior-period deltas on Cost and Leads.

### 6.4 Leads & Conversions (priority section)

**Leads definition (critical, see C2 in §4):** "Leads" = sum of the configured
form-fill conversion actions only (category "Submit lead form"). It **excludes**
`Calls from ads` (category "Phone call lead") and `Local actions - Directions`
(category "Get directions"), which exist on the account but are not leads. The
raw `Conversions` metric includes them and must not be used as the Leads number.

Implementation: query `Conversions` segmented by `ConversionTypeName`
(+ `ConversionCategory`), then aggregate to the configured `leadActions`.

Contents:
- Weekly lead-count-over-time chart (combo/line; weekly buckets).
- Grouped breakdown by conversion action: per-action counts + Employer / Broker
  / Contact subtotals. All 14 configured actions shown; absent actions render
  `0`.
- Category breakdown: counts + **share-of-leads** per category. **No
  per-category CPL** (C1, §4).

### 6.5 Geographic performance
- Ranked horizontal bar views + metric cards; **no map**.
- Dimension: `Region` (state level). Rank by scoped Leads, with Clicks/Cost
  available.

### 6.6 Search terms & keywords
- Dimension: `Searchterm` (Matched search term; SearchTermView report type).
- Columns: Search Term, Clicks, Impressions, CTR (`Ctr`), Cost, Leads (scoped),
  CPL.
- Sort: **Leads descending, then Cost descending**.

### 6.7 Reconciliation model (KPI ↔ campaign totals)

The KPI Leads total and the campaign table come from **differently-segmented**
queries (conversion-action segmentation vs campaign segmentation), and the API
omits zero rows — so reconciliation is **not free** and must be engineered:

- Campaign-level Leads are computed from a **campaign × conversion-action**
  query, filtered to the configured form-fill actions, summed per campaign. This
  guarantees the campaign totals row equals the headline scoped Leads KPI.
- Cost/Clicks/Impressions reconcile from the campaign-segmented query.
- **Rounding rule:** the totals row **rounds the sum**, not the sum of rounded
  values (whole-dollar rounding per §7 would otherwise drift across rows).
- An explicit **reconciliation check** is part of acceptance (§10).

---

## 7. Formatting rules

- Currency: **USD**, whole-dollar rounding for cost cards and CPL.
- Percentages: one decimal place.
- Zero-lead weeks render `0`, never blank.
- Thousands separators on counts (existing `KpiCard` behavior).
- Totals/aggregates round the sum, not the sum of rounded values (§6.7).

---

## 8. States

- **Loading:** skeleton per section (existing convention / Suspense).
- **Empty / not connected:** prompt card (never an error) — e.g. when
  `paid_search_config` or the Supermetrics key is absent.
- **Error vs timeout:** each section wrapped in an error boundary. The boundary
  distinguishes `SmTimeoutError` ("Taking longer than usual — try a shorter date
  range") from `SmQueryError` ("Couldn't load this section"). A failure in one
  section's query within the `Promise.all` fan-out must not crash the page
  (settle per-section; render that section's error/timeout state only).

---

## 9. Dependencies & open questions

### Blocking (must clear before implementation can serve live data / pass §10)

| # | Item | Blocks | Owner | Date |
|---|---|---|---|---|
| B1 | Supermetrics enterprise **API key** for the deployed app + `sm_api_key_env_var` set (§5.2). MCP only proves the account is linked. | Any live data | _TBD_ | _TBD_ |
| B2 | Authoritative **14-action → Employer/Broker/Contact map** from the Renaissance team (Amir's doc). A best-guess passes the "appears with subtotal" check while being silently wrong, so it cannot satisfy §10. | Acceptance §10 | _TBD_ | _TBD_ |

Observed YTD action names (8 of 14 had data): `contact_individual_lead`,
`contact_employee_lead`, `contact_provider_lead`, `contact_broker_lead`,
`broker_group_lead`, `employer_dental_lead`, `employer_accident_lead`,
`employer_vision_lead`. Note `contact_broker_lead` confirms category is **not**
name-derivable.

### Non-blocking (product confirm)

1. **"Last 4 Weeks" preset (§6):** is `last_30_days` acceptable, or add a true
   28-day `last_4_weeks` bucket? Required preset either way.
2. **Scorecard benchmark sub-line:** real benchmarks vs prior-period context vs
   static copy. Default: prior-period context.

### Resolved (see §4 + decision log)

- C1 per-category CPL; C2 headline Leads scope — approved by Paul 2026-06-17,
  pending Amir review.

---

## 10. Acceptance criteria

- One scrolling Paid Search page shows the six sections in the specified order.
- All 14 **configured** lead conversion actions appear in Leads & Conversions,
  grouped into Employer / Broker / Contact with subtotals; absent actions show
  `0`. **(Requires B2 — the authoritative map.)**
- Headline Leads = sum of the 14 form-fill actions only (excludes
  calls/directions).
- **Reconciliation test:** the campaign table totals row equals the KPI
  scorecards for Cost, Clicks, Impressions, and scoped Leads, within the §6.7
  rounding rule (totals round the sum). Asserted by an automated check.
- Changing the date range updates all sections and prior-period deltas
  consistently.
- The 14-action list and account id are read from per-client config, not
  hardcoded.
- `smQuery` poll timeout and rate-limit handling behave per §5.2; the section
  renders distinct timeout vs error states per §8.

---

## 11. Out of scope (tracked for later specs)

- Meta Advertising module (Phase 1, next spec).
- LinkedIn Advertising module (Phase 1, next spec).
- Organic Social + Influencer (Phase 2; depends on a Dash Social connector).
- Media tracker surfacing (Phase 3; likely already covered by AEO reporting).

---

## 12. Action items

- File a CLAUDE.md correction PR: Supermetrics LinkedIn `ds_id` is **`LIA`**, not
  `'LI'` (§5.2), so the wrong id is not reintroduced.
