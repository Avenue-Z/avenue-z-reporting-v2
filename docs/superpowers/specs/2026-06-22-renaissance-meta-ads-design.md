# Renaissance Meta Advertising — Design Spec

**Date:** 2026-06-22
**Module:** Meta Advertising (module 2 of 4 — Renaissance Dashboard Additions)
**Source PRD:** `renaissance_dashboard_additions_prd.md` (§"2. Meta Advertising")
**Builds on:** the merged Paid Search module (Supermetrics client, `KpiCard`, upgraded `DataTable`, date controls)
**Status:** Approved design — ready for implementation plan.

---

## 1. Context

Module 2 of the PRD. Meta is an **upper-funnel** channel (awareness / traffic /
engagement / creative testing) — **not** lead-gen or e-commerce, so no ROAS,
revenue, or conversion framing. It reuses the architecture proven by Paid Search.

### Data source — validated against live data

- Supermetrics **Facebook Ads** connector (`ds_id: FA`) is **authenticated**.
- Renaissance Meta account: **`act_1480350426850960`** ("Renaissance Benefits Ad Account").
- All higher-risk PRD KPI fields confirmed via `field_discovery(FA)`: `reach`,
  `Frequency`, `landing_page_views`, `cost_per_landing_page_view`,
  `action_post_engagement`, `cost_per_post_engagement`. `ad_name` (creative) and
  `Region` (state geo) confirmed.

Uses the same shared enterprise key (`SUPERMETRICS_API_KEY`) and the corrected
synchronous `smQuery` client from Paid Search.

---

## 2. Goals

- Single scrolling Meta report for Renaissance: KPI scorecards → Creative
  Performance → Geographic Performance (the PRD's v1 structure).
- Reuse the existing design system and the global date control + prior-period
  comparison.
- Per-client Meta account configuration (not hardcoded).

## 3. Non-Goals (this module)

- No ROAS / revenue / conversion framing (upper-funnel channel).
- No hero chart (the PRD's Meta structure has none).
- No DMA-level geo (no reliable dimension — see §4).
- No creative thumbnails/previews, no video-curve metrics (v1 simplification).
- No LinkedIn or Organic work (separate specs).

---

## 4. Decisions (approved 2026-06-22)

- **Trend model:** reuse the **prior-period comparison** from the global date
  picker (defaults to `previous_period`), exactly as Paid Search. On a weekly
  view this is week-over-week, but it also flexes to any selected range —
  consistent across modules. (PRD says "vs the prior week"; we generalize.)
- **Geo scope:** **state only** (`Region`). There is no reliable DMA dimension in
  FA (`comscore_market` is the only DMA-ish field and is sparse/unreliable), so
  DMA is deferred — this resolves the PRD's open DMA question with evidence.
- **Config:** add a **`meta_config` jsonb** column (`{ metaAdAccountId }`),
  mirroring `paid_search_config`.
- **Engagement Rate** is **derived** (`action_post_engagement / impressions × 100`)
  — FA exposes only a categorical "Engagement Rate Ranking", not a numeric rate.

---

## 5. Architecture

Same pattern as Paid Search: route → server page → async RSC section →
server-side data layer → client chart/table components; URL search params drive
date range + comparison.

### 5.1 Report slug — repurpose `meta-ads`

`'meta-ads'` is a dormant demo stub (in the route switches + labels, enabled for
no client). Repurpose it exactly as `google-ads` was:
- Replace the stub component with the new Meta RSC.
- Relabel to **"Meta Advertising"** in `lib/constants.ts`.
- Add `'meta-ads'` to the `NAV_GROUPS` Reports group (so it shows in the sidebar).
- Wire the three route switches' `case 'meta-ads':` to pass
  `clientSlug`/`dateRange`/`compareRange` (currently passes only `clientSlug`).
- Enable `'meta-ads'` for Renaissance.
- Delete the unused stub `components/report-sections/meta-ads/` after wiring.

### 5.2 Shared formatter extraction (targeted DRY)

Move the pure formatters `usd`, `num`, `pct` out of `lib/paid-search/base.ts`
into **`lib/supermetrics/format.ts`** (no imports → cheap to unit-test, usable by
both modules). Re-export them from `lib/paid-search/base.ts` so existing
paid-search importers are unaffected. Meta imports them from the new module.

### 5.3 Meta data layer — `lib/meta/`

- `lib/meta/types.ts` — result types: `MetaKpi` (reuse `Kpi` shape),
  `CreativeRow`, `MetaGeoRow`.
- `lib/meta/base.ts` — `metaQuery(slug, fields, dateRange, opts?)`: reads the
  client's `meta_config.metaAdAccountId` + `sm_api_key_env_var`, calls `smQuery`
  with `DS_IDS.META`; plus `resolveCompareIso` (reuse from paid-search/base or
  the shared date helpers). Mirrors `awQuery`.
- `lib/meta/kpis.ts`, `creative.ts`, `geo.ts` — pure transforms + thin fetchers,
  each with a colocated `*.test.ts` (transforms tested with sample rows).

> If `metaQuery` and `awQuery` end up near-identical, factor a shared
> `smQueryForClient(slug, dsId, accountId, ...)` — decide during the plan; do
> not pre-abstract.

### 5.4 Components — `components/report-sections/meta-ads/`

`index.tsx` (async RSC orchestrator with per-section `safe()` timeout/error
isolation, same as Paid Search) composing:
- `kpi-grid` — reuse `KpiGrid` (it takes `Kpi[]`); no new component needed.
- `creative-table.tsx` — client component (or server, using serializable
  `sortKey` columns per the DataTable fix), default sort Spend desc.
- `geo-section.tsx` — ranked `BarChart` by state (reuse the paid-search geo
  pattern).

### 5.5 Config (DB)

Add `meta_config: jsonb` to `clients` (`lib/db/schema.ts` + migration `0008`):

```ts
export interface MetaConfig { metaAdAccountId: string } // e.g. 'act_1480350426850960'
```

Seed Renaissance: `meta_config = { metaAdAccountId: 'act_1480350426850960' }` and
add `'meta-ads'` to `enabled_reports`.

---

## 6. Section specifications

All FA field ids below were confirmed unless marked **(verify)** — those are
pinned during the plan via `field_discovery(FA)`.

### 6.1 KPI scorecards (12)

Reuse `KpiCard`/`KpiGrid`; prior-period delta from the compare range.

| Card | Field / derivation |
|---|---|
| Spend | `cost` **(verify exact id: `cost` vs `spend`)** |
| Impressions | `impressions` |
| Reach | `reach` |
| Frequency | `Frequency` |
| Link Clicks | `inline_link_clicks` **(verify)** |
| CTR | `ctr` **(verify; or link-CTR)** |
| CPM | `cpm` **(verify)** |
| CPC | `cpc` **(verify)** |
| Landing Page Views | `landing_page_views` |
| Cost per LPV | `cost_per_landing_page_view` |
| Post Engagement | `action_post_engagement` |
| Engagement Rate | **derived**: `action_post_engagement / impressions × 100` |

### 6.2 Creative Performance (table)

- Dimensions: `ad_name` + `Campaignname`.
- Columns: Ad Name, Campaign, Spend, Impressions, Reach, Frequency, Link Clicks,
  CTR, CPC, LPV, Cost/LPV, Engagements (`action_post_engagement`), **Share of
  Spend** (*computed* = ad spend ÷ total spend × 100), **Status** (effective
  status dimension **(verify id)**).
- Sortable on every numeric column (serializable `sortKey`), default Spend desc.
- Reuses the upgraded `DataTable`.

### 6.3 Geographic Performance

- Dimension: `Region` (US state). Ranked horizontal-style bars (vertical
  `BarChart` as today) for top states by Spend, Clicks, LPVs, Engagement.
- **State only** — no DMA (§4).

---

## 7. Formatting rules

- USD whole-dollar for Spend/cost cards/Cost-per-LPV; CPC/CPM keep cents.
- Percentages (CTR, Engagement Rate, Share of Spend) to one decimal.
- Frequency to one decimal. Counts with thousands separators; zero renders `0`.
- Reuse the shared `usd`/`num`/`pct` formatters (§5.2).

---

## 8. States

- Loading skeletons per section (Suspense), empty/not-connected prompt cards,
  and per-section error/timeout isolation via `safe()` — identical to Paid
  Search (`SmTimeoutError` vs `SmQueryError`).

---

## 9. Dependencies & open items

### Blocking
- None new. The shared `SUPERMETRICS_API_KEY` already works (proven by Paid
  Search). The Renaissance Meta account is connected.

### Pin during the plan (not blocking design)
- Exact FA field ids for Spend, Link Clicks, CTR, CPM, CPC, and the effective-
  status dimension (verify via `field_discovery(FA)` / a live query).
- Sanity-check that the account has recent Meta spend (the account exists; the
  plan's first live query confirms data volume).

### Non-blocking product confirm
- Engagement Rate denominator: impressions (chosen) vs reach — confirm with the
  team if they expect reach-based. Default: impressions.

---

## 10. Acceptance criteria

- One scrolling Meta page shows the three sections in order (KPI scorecards,
  Creative Performance, Geographic Performance).
- All 12 KPI cards render with prior-period deltas; Engagement Rate and Share of
  Spend are computed correctly.
- Creative table is sortable with a Spend-desc default and shows Status.
- Geo shows ranked states (no DMA).
- Date-range changes update all sections + deltas consistently.
- The Meta account id comes from per-client `meta_config`, not hardcoded.
- `npm run build` clean; transforms covered by unit tests; one live smoke test
  against `act_1480350426850960` returns real data.

---

## 11. Out of scope (later specs)

- LinkedIn Advertising (module 3 — separate spec; same FA-style pattern, `LIA`).
- Organic Social + Influencer (module 4 — needs a Dash Social connector).
- Creative thumbnails/previews, video-curve metrics, DMA geo.
