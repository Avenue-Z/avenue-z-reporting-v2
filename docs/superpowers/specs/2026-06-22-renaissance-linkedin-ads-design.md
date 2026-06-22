# Renaissance Dashboard — Module 3: LinkedIn Advertising — Design

**Status:** Approved (brainstorm)
**Date:** 2026-06-22
**Working branch:** `feat/renaissance-dashboard`
**Parent status doc:** `docs/superpowers/renaissance-dashboard-status.md` (Module 3)
**Source PRD:** `renaissance_dashboard_additions_prd.md`

---

## 1. Summary

A LinkedIn Advertising report section for the Renaissance dashboard — the B2B
channel (broker / HR / broad-B2B audience targeting, website traffic, lead gen).
It is a **fast-follow that mirrors the already-built Meta module** (Module 2):
same route → RSC orchestrator (`safe()` isolation) → `lib/linkedin/` data layer
→ presentational components shape, same three-section single-scroll page (KPI
Scorecards · Creative Performance · Geographic).

**Data source (validated live):** Supermetrics LinkedIn Ads `LIA`, Renaissance
account **`503368877`** ("Renaissance Life and Health Ads Account",
AUTHENTICATED), shared enterprise key `SUPERMETRICS_API_KEY`. `DS_IDS.LINKEDIN`
(`'LIA'`) already exists in `lib/supermetrics/constants.ts`.

---

## 2. Key finding — no report-type complexity (corrects the status-doc assumption)

The status doc warned that LinkedIn would need explicit **report-type selection**
(lead-form metrics living in report types 0/1/5), "unlike AW/FA", possibly
forcing a Paid-Search-style two-query join. **Live discovery shows this is not
the case:**

- `data_source_discovery(LIA)` returns **`has_report_type_selection: false`** —
  identical to Meta (`FA`) and Google Ads (`AW`). Supermetrics **auto-resolves**
  the report type from the requested fields; we never pass one.
- Individual fields carry `report_types` compatibility tags, and a query's fields
  must share ≥1 common report type. **Report type `1` (`ad_analytics_campaign`)
  is a common denominator across every field this module needs** — core metrics,
  reach, the full lead-form set, campaign + creative dimensions, and
  `memberRegion`. So **each section resolves in a single `smQuery`**; no join.

Report-type legend (index → name): `0 ad_analytics · 1 ad_analytics_campaign ·
2 ad_analytics_chunkless · 3 ad_form · 4 ad_form_responses · 5 ad_statistics ·
6 ad_statistics_chunkless · 7 attributed_revenue_analytics`.

Compatibility of the fields we use (all include report type `1`):

| Field group | `report_types` |
|---|---|
| Core metrics (`spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`, `landingPageClicks`) | 0,1,5 |
| Reach (`approximateUniqueImpressions`) | 1,2,6 |
| Lead-form (`oneClickLeads`, `oneClickLeadFormOpens`, `oneClickLeadsCost`, `leadFormCompletionRate`) | 0,1,5 |
| `campaignName` | 1,4,5,6,7 |
| `campaignGroupName` | 0,1,2,5,6,7 |
| `creativeDscName`, `creativeStatus` | 0,1,2,4,5,6 |
| `memberRegion` | 0,1,2 |

Per-section intersections: KPIs `{1}`, Creative table `{1,5}`, Geo `{0,1}` — all
non-empty, so auto-resolution succeeds without passing `report_type`. The
existing `smQuery` (which forwards `fields` and lets Supermetrics resolve, exactly
as the Meta/Google adapters do) needs **no change**.

---

## 3. Architecture

Mirror `lib/meta/` and `components/report-sections/meta-ads/` exactly.

```
route (portal + dashboard reports/[reportSlug])
  → RSC orchestrator: Promise.all of safe(getLinkedInKpis), safe(getCreativeRows), safe(getLinkedInGeoRows)
     (safe() catches SmTimeoutError → 'timeout', else 'error'; each section renders or shows Fallback)
  → lib/linkedin/  (pure transforms + thin fetchers)
  → presentational components (KPI grid, creative table, geo section)
```

`lib/linkedin/base.ts` — `linkedinQuery(slug, fields, dateRange, opts)`: reads
`client.linkedinConfig.linkedinAdAccountId` + `client.smApiKeyEnvVar`, throws if
either missing, calls `smQuery` with `DS_IDS.LINKEDIN`. Reuses
`resolveCompareIso(dateRange, compareRange)` from the shared helpers for
prior-period comparison. Direct port of `lib/meta/base.ts`.

---

## 4. Section A — KPI Scorecards (14 cards)

**Query:** one totals query, **no breakdown dimensions** → Supermetrics returns
an account-level row, so native ratios (`ctr`, `cpc`, `cpm`, `oneClickLeadsCost`,
`leadFormCompletionRate`) come back correctly computed at the total level (we do
not sum ratios). Fields requested:

`spend, impressions, approximateUniqueImpressions, clicks, ctr, cpc, cpm,
landingPageClicks, oneClickLeads, oneClickLeadsCost, oneClickLeadFormOpens,
leadFormCompletionRate`.

**KPI → field map:**

| # | KPI | Field id | Format |
|---|---|---|---|
| 1 | Spend | `spend` | usd |
| 2 | Impressions | `impressions` | num |
| 3 | Reach | `approximateUniqueImpressions` | num |
| 4 | Clicks | `clicks` | num |
| 5 | CTR | `ctr` | pct |
| 6 | CPM | `cpm` | usd |
| 7 | CPC | `cpc` | usd |
| 8 | **Frequency** | **derived** = `impressions ÷ reach` | num (1 dp) |
| 9 | Landing Page Clicks | `landingPageClicks` | num |
| 10 | **Cost per Visit** | **derived** = `spend ÷ landingPageClicks` | usd |
| 11 | Leads | `oneClickLeads` | num |
| 12 | Cost per Lead | `oneClickLeadsCost` | usd |
| 13 | Lead Form Opens | `oneClickLeadFormOpens` | num |
| 14 | Lead Form Completion Rate | `leadFormCompletionRate` | pct |

**Comparison:** a second `linkedinQuery` at `resolveCompareIso(...)` (prior
period); `transformLinkedInKpis(totals, compareTotals)` produces each card's
value + delta. Derived cards (Frequency, Cost per Visit) recompute from the
compare-period components for their deltas — never a ratio of ratios.

**Component:** reuse shared `components/report-sections/paid-search/kpi-grid.tsx`
(`KpiGrid` / `KpiCard`), as Meta does.

### Derived metrics note

**Frequency** and **Cost per Visit** have **no native LinkedIn/Supermetrics
field** for this source. They are computed in `transformLinkedInKpis`:
`frequency = impressions / reach`, `costPerVisit = spend / landingPageClicks`
(guarding divide-by-zero → 0/`—`). This is documented here, repeated as a code
comment in `lib/linkedin/kpis.ts`, and noted in the status doc so the provenance
of these two numbers is never ambiguous. (Meta does the same for its derived
Engagement Rate.)

---

## 5. Section B — Creative Performance table

**Query:** one query.

- **Dimensions:** `creativeDscName` (→ **Ad**), `campaignName` (→ **Audience**),
  `campaignGroupName` (→ **Campaign**), `creativeStatus` (→ **Status**).
- **Metrics:** `spend, impressions, clicks, ctr, cpc, oneClickLeads,
  oneClickLeadsCost, oneClickLeadFormOpens, leadFormCompletionRate,
  landingPageClicks`.

**Audience/Campaign mapping (validated against live data):** in this account the
campaign **group** is the funnel/objective layer (`AVZ | General | … | Traffic |
Prospecting`, `AVZ | Lead Gen | … | Retargeting`) and the campaign **name** is
the audience segment (`Brokers`, `HR`, `Broad B2B`, named broker lists).
Therefore **Audience = `campaignName`** and **Campaign = `campaignGroupName`**,
matching how a reader interprets the table. All three PRD columns map to real
fields; nothing is dropped.

**Ad label:** `creativeDscName` (Direct Sponsored Content name) — the closest
LinkedIn equivalent to an ad name. This is **provisional**: a quick live smoke
check during implementation confirms it is populated for this account; if it is
frequently blank, fall back to `creativeTitle`, then `creativeId`. Flagged as an
open item in the plan.

**Computed column:** **Share of Spend** = ad spend ÷ total spend (mirrors Meta).
Sortable columns (serializable `sortKey`), default **Spend desc**. Totals row:
sum additive columns; **recompute** ratio columns (CTR, CPC, CpL, completion
rate) from the summed components; Share of Spend totals to 100%.

**Component:** mirror `components/report-sections/meta-ads/creative-table.tsx`.

---

## 6. Section C — Geographic

**Query:** one query — dimension `memberRegion` (state/region grain), metrics
`spend, impressions, clicks, oneClickLeads`. State-only (no reliable DMA),
matching Meta. Top regions ranked by spend; bar chart + KPI cards (top region,
total regions). Mirror `components/report-sections/meta-ads/geo-section.tsx`.

---

## 7. Config, schema & wiring

- **Schema** (`lib/db/schema.ts`): add
  ```ts
  export interface LinkedInConfig {
    /** LinkedIn ad account id (numeric, no prefix), e.g. '503368877'. */
    linkedinAdAccountId: string
  }
  ```
  and the column `linkedinConfig: jsonb('linkedin_config').$type<LinkedInConfig>()`.
- **Migration `0009`** (generated, committed): `ALTER TABLE "clients" ADD COLUMN
  "linkedin_config" jsonb;`. Applied to the **dev** Neon branch by the
  controller; prod untouched.
- **Display name** (`lib/constants.ts`): set
  `REPORT_NAMES['linkedin-ads'] = 'LinkedIn Advertising'` (currently "LinkedIn
  Ads"). The `'linkedin-ads'` `ReportSlug` already exists.
- **Component swap:** replace the demo placeholder
  `components/report-sections/linkedin-ads/index.tsx` with the real orchestrator;
  confirm both the portal and dashboard `reports/[reportSlug]` routes dispatch
  the `linkedin-ads` slug to it (the slug is already routed for the stub).
- **Enable the report:** add `'linkedin-ads'` to Renaissance's `enabledReports`
  and set `linkedinConfig.linkedinAdAccountId = '503368877'` (DB, **dev only**
  for now). No redeploy needed for the data entry.

---

## 8. Testing

Colocated `tsx` + `node:assert` tests (run `npx tsx --env-file=.env.local
lib/linkedin/<file>.test.ts`), pure transforms only — no live API/DB:

- `kpis` — `transformLinkedInKpis`: 14 cards; native ids mapped; **Frequency**
  (`impressions/reach`) and **Cost per Visit** (`spend/landingPageClicks`)
  derived correctly; divide-by-zero guards; deltas vs a compare row.
- `creative` — `transformCreative`: Audience=`campaignName`,
  Campaign=`campaignGroupName`, Ad=`creativeDscName`, Status=`creativeStatus`;
  **Share of Spend** computed; default sort Spend desc; ratio totals recomputed.
- `geo` — `transformLinkedInGeo`: region rows from `memberRegion`; ranked by
  spend.

Network fetchers (`base.ts`, the `get*` wrappers) are thin I/O — not unit-tested
directly, covered by the existing `smQuery` tests and the live smoke check.

**Live smoke check (implementation, not committed):** render all three sections
against `503368877` to confirm `creativeDscName` population and that auto
report-type resolution returns data for each section.

---

## 9. Out of scope (v1)

Member demographic breakdowns (industry / seniority / job function / company
size), video & document funnel metrics, revenue-attribution (`rar_*`,
`returnOnSpend`), ad-form-response lead records (report type 4), viral-metric
cards, and a hero combo chart (Meta has none either). These can be follow-ups.

---

## 10. Acceptance criteria

- Three sections render in order (KPI · Creative · Geo) for Renaissance.
- 14 KPI cards with prior-period deltas; Frequency and Cost per Visit derived and
  documented.
- Creative table: Ad / Audience / Campaign / Status + metrics, Share of Spend,
  sortable (default Spend desc), totals row with recomputed ratios.
- Geographic: `memberRegion` rows ranked by spend, state-only.
- Config-driven via `linkedinConfig`; `linkedin-ads` enabled for Renaissance;
  display name "LinkedIn Advertising".
- Each section is per-section error/timeout isolated via `safe()`.
- Live smoke test passes against account `503368877`.
- `npm run build` clean; all new unit tests pass.

---

## 11. Open items (pin in plan)

- **Ad label field:** confirm `creativeDscName` is populated; fallback chain
  `creativeDscName → creativeTitle → creativeId`.
- **Migration number:** `0009` assumed next; verify against `drizzle/` at
  generation time.
- **Route dispatch:** confirm the exact slug→component switch in both report
  routes (portal + dashboard) when swapping out the stub.
