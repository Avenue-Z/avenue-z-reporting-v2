# AEO Overview Tab — Enhancements Design

**Date:** 2026-06-09
**Status:** Approved (design), pending implementation plan
**Area:** `components/report-sections/peec-ai/` (the AEO Overview tab), `lib/peec/client.ts`, `lib/profound/client.ts`

---

## Context

The AEO (Answer Engine Optimization) Overview tab renders brand-visibility data
from two providers — **Peec** and **Profound** — as two near-identical vertically
stacked sections in [`peec-ai/index.tsx`](../../../components/report-sections/peec-ai/index.tsx).
Most clients use only one provider; only Avenue Z currently has both.

This spec covers five enhancements requested for that tab:

1. Fix YTD charts that appear to start mid-year.
2. Add a Daily/Weekly/Monthly/Quarterly granularity toggle to time-spanning charts.
3. Add a "What changed this period?" summary ribbon.
4. Replace the two stacked provider sections with a toggle experience.
5. Group Tracked Prompts by real provider topics instead of keyword inference.

### Current architecture (relevant facts)

- `PeecAIReport` is an async **React Server Component**. It fetches both providers
  via `Promise.allSettled([getPeecOverview, getProfoundOverview])` and renders two
  stacked blocks. Profound's sub-components are duplicates suffixed `Profound*`.
- Both clients fetch YTD as `Jan 1 → today` and pre-bucket a **weekly** visibility
  series. The chart renders starting at the first week with data.
- Peec fetches per-`date` brand rows; Profound fetches with `date_interval: 'day'`.
  Both therefore have a daily-granular source series available server-side.
- Tracked-prompt topics are inferred client-side by `categorizePrompt()` keyword
  matching in **both** clients, with a tooltip disclaiming "AI-inferred."
- An existing granularity-toggle UI pattern lives in
  [`ai-summaries/period-selector.tsx`](../../../components/report-sections/ai-summaries/period-selector.tsx).
- Provider availability is derivable from DB config: `peecCustomerProjectId`
  (Peec) and `profoundCategoryId` (Profound) on the client row.

---

## Architectural approach

The new behaviors (provider toggle, granularity toggle) require client-side
interactivity on what is today a pure RSC. We introduce a **thin client wrapper**:

```
PeecAIReport (RSC)
  ├─ resolve availableProviders from DB config
  ├─ fetch overview data for each configured provider (existing logic + new fetches)
  └─ <AeoOverviewClient                       ← NEW client component
        availableProviders={['peec','profound']}
        clientSlug
        peec={peecData}        // null when not configured
        profound={profoundData}// null when not configured
     />
```

`AeoOverviewClient` owns:
- selected provider (persisted to `localStorage`, default first available),
- selected granularity (component state, default `weekly`),
- and renders, for the selected provider: the ribbon, the shared visibility chart,
  the KPI cards, and the **existing** tables (reused unchanged).

**Scope discipline (per repo conventions):** we do NOT merge the Peec/Profound
table components into a generic abstraction. The only consolidation is the
visibility chart (Section 2), because it is changing anyway and duplicating the
granularity logic would guarantee drift. Existing `Profound*` table components
are reused as-is, selected by provider.

### Rejected alternatives

- **Full generic `<ProviderOverview>` merge** — cleanest long-term but a large
  refactor of working, untouched code. Out of scope.
- **CSS-hide one stacked section** — minimal, but leaves duplicated chart code
  exactly where new logic is being added. Rejected.

---

## Section 1 — YTD "full range" fix

**Decision:** start the chart at the first tracked week (no data fabrication) and
add a clarifying caption.

- The reported start dates (Peec Feb 9, Profound Mar 3) reflect when tracking
  actually began; there is no earlier data to show. The dates also match the
  hardcoded demo data exactly.
- **Change:** add a caption beneath the visibility-chart title:
  `Tracking began {firstWeekLabel}`, derived from the first data point in the
  series. No axis padding, no synthetic zero weeks.
- Demo data is left unchanged.
- Applies to whichever provider is selected.

---

## Section 2 — Granularity toggle (Daily / Weekly / Monthly / Quarterly)

**Decision:** client-side re-bucketing of a daily series; no refetch.

- **Data shape change:** each client's overview gains a daily visibility series for
  *your brand* and *competitors* (the finest grain both APIs already return).
  Concretely, add `dailyVisibility: DailyPoint[]` and
  `competitorDailyVisibility: DailyPoint[]` (where `DailyPoint = { date: string;
  visibility: number }`) to `PeecOverview` / `ProfoundOverview`. The existing
  `weeklyVisibility` / `competitorWeeklyVisibility` can be derived from this in the
  chart, so they may be removed once the shared chart buckets client-side.
- **Bucketing:** the shared chart buckets the daily series into the selected
  interval (day = passthrough; week = ISO Monday weeks, matching the existing
  `groupByWeek` logic; month = calendar month; quarter = calendar quarter),
  averaging visibility within each bucket.
- **Toggle UI:** a segmented control modeled on `period-selector.tsx`, with four
  options; default `weekly`. Selection is component state (not persisted).
- **Scope:** only the visibility chart spans a timeframe on this tab, so it is the
  only chart that gets the toggle.
- **Partial first bucket:** acceptable; the Section 1 caption explains the start.

### Shared visibility chart

Consolidate `peec-ai/visibility-chart.tsx` and `profound-ai/visibility-chart.tsx`
into **one** shared chart component (kept under `peec-ai/` to avoid a directory
move; Profound's import is repointed). It accepts the daily series + competitor
daily series + brand name, owns bucketing, the granularity toggle, and the
tracking caption.

---

## Section 3 — "What changed this period?" ribbon

**Decision:** comparison window is **Last 30 days vs prior 30 days**, for the
currently selected provider.

A compact horizontal strip rendered at the top of the selected provider's section
(above the visibility chart, below the provider toggle), with four chips:

| Chip | Definition |
|---|---|
| **Biggest visibility mover** | Tracked brand (you or competitor) with the largest **absolute** visibility-point change L30 vs P30. Shows brand name, arrow, signed delta. |
| **Biggest domain gain/loss** | Cited domain with the largest **absolute** change in retrieved/citation share L30 vs P30. Shows domain + signed delta. |
| **Biggest prompt opportunity** | Tracked prompt where **your** brand has the **lowest** current visibility (most headroom). Shows truncated prompt text + your visibility %. |
| **Biggest competitor shift** | Non-you brand with the largest visibility/SOV **gain** L30 vs P30 (rising threat). Shows competitor + signed delta. |

Each chip degrades gracefully to a neutral "—" state when the underlying data is
empty (e.g., a provider with no prior-30 data yet).

### New data requirements

The ribbon needs prior-30-day comparison data that the clients do not currently
fetch. Add to **both** `getPeecOverview` and `getProfoundOverview` (parallelized
with existing calls):

- **Prior-30-day** brand rows (the 30 days before the last 30). Peec already has a
  `periodDates(offsetDays, windowDays)` helper — `periodDates(30, 30)` yields this
  window; Profound computes the equivalent date range inline.
- **Prior-30-day** domain rows.
- **Last-30** and **prior-30** prompt-level rows (currently prompts are fetched
  YTD only). Peec: `/reports/brands` with `dimensions: ['prompt_id']`; Profound:
  `/v1/reports/visibility` with `dimensions: ['prompt']`.

Expose a typed `periodChange` block on each overview, e.g.:

```ts
type PeriodChange = {
  visibilityMover: { name: string; delta: number } | null
  domainMover:     { domain: string; delta: number } | null
  promptOpportunity: { text: string; visibility: number } | null
  competitorShift: { name: string; delta: number } | null
}
```

The four movers are computed server-side (the client only renders them).

---

## Section 4 — Provider toggle

**Decision:** auto-detect configured providers; remember the last manual choice.

- `PeecAIReport` resolves `availableProviders` from the client's DB config:
  Peec available iff `peecCustomerProjectId` is set; Profound available iff
  `profoundCategoryId` is set. This list is passed to `AeoOverviewClient`.
- **Two providers configured** (only Avenue Z today): render a segmented toggle
  (Peec | Profound). Selection persists to `localStorage` keyed by client slug
  (e.g., `aeo-provider:{clientSlug}`), defaulting to Peec on first visit. Only the
  selected provider's section renders.
- **One provider configured** (all future clients): render that provider with **no
  toggle**, and **no** "Profound" section divider or stacking.
- The current unconditional stacked layout and the `SectionDivider title="Profound"`
  block are removed.
- Data is still fetched only for configured providers (unchanged from today's
  per-client behavior, where an unconfigured Profound returns an empty overview).

---

## Section 5 — Tracked-prompt real topics

**Decision:** investigate the APIs, then group by real topics where available.

- **Implementation step 1 — probe both APIs** for a per-prompt topic/tag field:
  - **Peec:** inspect `/queries/search` response fields and any topic/tag metadata
    or dedicated topics endpoint.
  - **Profound:** test `dimensions: ['topic']` (and/or a prompt→topic mapping) on
    `/v1/reports/visibility`.
- **Grouping behavior:**
  - Provider returns real topics → `TrackedPrompt.group` is set from the real
    topic; the keyword `categorizePrompt()` path is bypassed for that provider and
    the "AI-inferred" disclaimer tooltip is removed.
  - Provider lacks topics → keep `categorizePrompt()` and keep the disclaimer.
- Add a `topicSource: 'provider' | 'inferred'` field to `TrackedPrompt` so the
  tracked-prompts chart conditionally shows or hides the disclaimer per provider.
- If the probe shows neither API exposes topics, the keyword fallback remains for
  both and this section becomes a no-op pending provider support — call this out in
  the implementation result rather than silently shipping inferred topics labeled
  as real.

---

## Components & files touched (summary)

**New:**
- `components/report-sections/peec-ai/aeo-overview-client.tsx` — client wrapper
  (provider toggle + granularity state + renders ribbon, chart, KPIs, tables).
- `components/report-sections/peec-ai/period-ribbon.tsx` — the "What changed"
  ribbon (presentational).
- A granularity segmented control (new small component or extracted from the
  `period-selector.tsx` pattern).

**Modified:**
- `lib/peec/client.ts` — add daily series, prior-30 fetches, `periodChange`,
  real-topic grouping + `topicSource`.
- `lib/profound/client.ts` — same additions.
- `components/report-sections/peec-ai/index.tsx` — resolve `availableProviders`,
  fetch per configured provider, delegate to `AeoOverviewClient`; remove stacked
  layout + Profound divider.
- `components/report-sections/peec-ai/visibility-chart.tsx` — becomes the shared
  chart: daily series input, client-side bucketing, granularity toggle, tracking
  caption.
- `components/report-sections/peec-ai/tracked-prompts-chart.tsx` and
  `profound-ai/tracked-prompts-chart.tsx` — conditional disclaimer via
  `topicSource`.
- Demo data (`lib/demo-data/peec.ts`, `lib/demo-data/profound.ts`) — extend to
  provide the new daily series and `periodChange` so demo mode renders the new UI.

**Removed/repointed:**
- `profound-ai/visibility-chart.tsx` — replaced by the shared chart import.

---

## Out of scope

- Merging the Peec/Profound table components into a generic abstraction.
- Renaming the `peec-ai/` directory to `aeo/`.
- Granularity toggle on any chart other than the visibility chart.
- Persisting granularity selection.

---

## Open questions / risks

- **Topic availability (Section 5)** is unknown until the API probe. The design
  degrades gracefully (keyword fallback + disclaimer), so this does not block the
  other four sections.
- **Ribbon mover definitions (Section 3)** were approved as specified; "prompt
  opportunity = lowest current visibility" and "competitor shift = largest gain"
  are the agreed definitions.
- **Prior-30 data volume** adds several API calls per provider; all parallelized,
  consistent with the existing `Promise.all` fan-out and 1-hour cache.
