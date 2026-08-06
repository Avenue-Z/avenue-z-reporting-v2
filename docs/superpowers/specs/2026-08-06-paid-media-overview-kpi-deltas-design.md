# Paid Media Overview — KPI-tile period deltas — Design

**Status:** approved (brainstorming), pending spec review
**Date:** 2026-08-06
**Branch:** `feat/paid-media-blended-leads` (PR #204)

## Problem

The Paid Media Overview's KPI tiles show absolute values only — no
period-over-period comparison. Every other paid channel's standalone section
(Paid Search, Meta, LinkedIn) already renders an automatic "vs prior period"
delta on its KPI grid; the Overview is the odd one out. Add deltas to both the
blended top-line tiles (Spend / Clicks / Leads / Cost per Lead) and the
per-channel breakdown cards (Spend / Clicks / Leads).

## What already exists (reuse, don't rebuild)

- **`KpiCard`** (`components/charts/kpi-card.tsx`) already renders deltas:
  `delta?: number`, `invertDelta?`, `deltaLabel` (default `"vs prior period"`),
  and `comparisonExpected?` (when true and no delta is available, renders a
  greyed `"— vs prior period"` placeholder = "comparison not possible", distinct
  from a real 0.0%). No change to `KpiCard`.
- **Each channel's `getXKpis(slug, dateRange, compareRange)`**
  (`lib/{paid-search,meta,linkedin}/kpis.ts`) already fetches the compare period
  and computes a per-KPI delta **percentage** when `compareRange` resolves. The
  standalone sections pass `effectiveCompare = compareRange ?? 'previous_period'`.
- **`getPaidMediaOverview`** currently calls each `getXKpis(..., null)` — "no
  compare period needed for totals" — and discards deltas. It reads each channel
  KPI value by key via `readKpi` and sums the **lead-bearing** channels (Paid
  Search + LinkedIn) under an all-or-nothing gate (a *configured* lead-bearing
  channel that fails blanks the blend; a channel the client doesn't run — and Meta,
  which is excluded from every blended figure — never blanks it). See the amendment
  in `2026-08-06-paid-media-blended-leads-design.md` §A for the Meta-exclusion decision.

> **Amended 2026-08-06:** Deltas are **on by default** — the Overview auto-defaults to
> `previous_period` (`effectiveCompare = compareRange ?? 'previous_period'`), matching
> Organic Social (`organic-social/ctx.ts`) and the standalone Paid Search/Meta/LinkedIn
> sections. So the KPI tiles always show a "vs prior period" delta even without an
> explicit comparison. An explicit selection in the date picker's "Compare To" ("Previous
> Period" / "Previous Year") overrides the default — that selection is threaded from the
> page through `PaidMediaOverviewReport`'s `compareRange` prop (the page previously
> dropped it, so the picker had no effect on the Overview; now it does).

The one thing missing: the `Kpi` objects expose only the delta **percentage**,
not the prior **absolute** value. Blended deltas are computed over *sums*, so
they need each channel's prior absolute — a percentage can't be summed.

## Approach (chosen: expose the prior absolute)

Add one optional field to the shared `Kpi` type and have each channel's
transform attach it. This gives exact blended deltas with no reconstruction
hacks (the rejected alternative — reconstructing `prior = value/(1+delta/100)`
inside the Overview — divides by zero when a channel's current value is 0
(delta −100%) and can't recover an undefined delta, so it was dropped).

### 1. `Kpi` type — one optional field

`lib/paid-search/types.ts`:

```ts
export interface Kpi {
  key: string; label: string; value: number | string | null
  prefix?: string; suffix?: string; delta?: number; invertDelta?: boolean
  tooltip?: string; format?: 'money'
  /** Prior-period absolute value of `value` (same quantity), when a compare
   *  period resolved. Used by blended rollups that must sum priors across
   *  channels; undefined when there is no comparison. */
  compareValue?: number
}
```

Additive and optional — no existing `Kpi` consumer changes behavior.

### 2. Channel transforms attach `compareValue`

Each `transformKpis` already holds the compare totals object (`compare`) and a
prior-value reader (`n(compare, <fieldId>)` / the `d(id)` delta helper). Attach
`compareValue` on exactly the KPIs the Overview blends — the `spendKey`,
`clicksKey`, and `leadsKey` from `CHANNELS` in `overview.ts`:

| Channel | Kpi key(s) | `compareValue` source (prior absolute of the same field) |
|---|---|---|
| Paid Search (`lib/paid-search/kpis.ts`) | `cost`, `clicks`, `leads` | `cCost`, `cClicks`, `cLeads` (locals already computed) |
| Meta (`lib/meta/kpis.ts`) | `spend` (←`cost`), `linkClicks` | `compare ? n(compare, 'cost')` / `n(compare, <linkClicks field>)` |
| LinkedIn (`lib/linkedin/kpis.ts`) | `spend`, `clicks`, `leads` (←`oneClickLeads`) | `compare ? n(compare, 'spend'|'clicks'|'oneClickLeads')` |

`compareValue` stays `undefined` when `compare` is null (no comparison). Meta
has no leads KPI — unchanged (Meta leads remain `null` / `—`).

### 3. `getPaidMediaOverview` — compute deltas

- **Signature:** `getPaidMediaOverview(clientSlug, dateRange, compareRange = null)`.
  Internally `const effectiveCompare = compareRange ?? 'previous_period'`, passed
  to all three `getXKpis`. (One extra compare-period query per channel — exactly
  what the standalone sections already do.)
- **`readKpiDelta(kpis, key)`** and **`readKpiCompare(kpis, key)`** helpers
  mirror `readKpi`: return the `Kpi.delta` / `Kpi.compareValue` for a key, or
  `undefined`. A `null`/absent value keeps the existing shape-drift failure
  semantics (that path already blanks the channel).
- **`ChannelMetrics`** gains `spendDelta`, `clicksDelta`, `leadsDelta`
  (`number | undefined`), read from each channel's `Kpi.delta` for the same
  keys as `spend`/`clicks`/`leads`. A non-configured or failed channel has all
  three `undefined`. Meta's `leadsDelta` is always `undefined`.
- **Per-channel priors** (`spend`/`clicks`/`leads` compareValues) are read as
  locals for the blend — not exposed on the interface.
- **`PaidMediaOverview`** gains `blendedSpendDelta`, `blendedClicksDelta`,
  `blendedLeadsDelta`, `blendedCostPerLeadDelta` (`number | undefined`),
  computed with the existing `delta(cur, prev)` helper
  (`undefined` when `prev` is `0`/absent):
  - `blendedSpendDelta = delta(blendedSpend, Σ spendPrior)` over the same
    channels that produced `blendedSpend`, and **only if every one has a
    defined prior** — otherwise `undefined` (same all-or-nothing gate as the
    value). Likewise `blendedClicksDelta`.
  - `blendedLeadsDelta` over the lead-bearing channels (Paid Search + LinkedIn),
    same gate.
  - `blendedCostPerLeadDelta = delta(currentCPL, priorCPL)` where
    `priorCPL = (Σ lead-bearing spendPrior) / (Σ leadsPrior)`; `undefined` if
    any lead-bearing prior is missing or `Σ leadsPrior` is 0.

### 4. UI wiring (`components/report-sections/paid-media/overview/index.tsx`)

- `PaidMediaOverviewReport` gains an optional `compareRange?: string | null`
  prop, threaded into `getPaidMediaTrend`'s sibling `getPaidMediaOverview` call.
- **Blended tiles** pass `delta={o.blendedXDelta}` and `comparisonExpected`.
  `invertDelta` only on **Cost per Lead** (lower is better).
- **Per-channel cards** pass `delta={c.xDelta}` and `comparisonExpected` on
  Spend / Clicks / Leads. Meta's Leads card shows the greyed `—` placeholder
  (its `leadsDelta` is `undefined`, matching its `—` value).

**Color convention:** follows the standalone sections — no `invertDelta` on
Spend / Clicks / Leads (an increase renders green), `invertDelta: true` on Cost
per Lead. (Spend-up-as-green is the house convention; flag at spec review if the
Overview should treat Spend as neutral instead.)

## Error handling / edge cases

- **No comparison possible** (a channel had zero/absent prior, or the client's
  range has no prior data): that channel's delta is `undefined`; blended deltas
  gated to `undefined`; `comparisonExpected` renders `"— vs prior period"`.
- **Best-effort unchanged:** a failed channel already blanks its values; its
  deltas are `undefined` too. The compare-period fetch failing does not throw
  separately — it resolves to no `compareValue` (delta `undefined`).
- **A channel with prior but current 0** yields a valid delta (e.g. −100%) — no
  divide-by-zero, because we divide by the *prior*, never the current.

## Testing

- **`lib/paid-media/overview.test.ts`:** extend the mocked `getXKpis` to return
  `Kpi[]` with `delta` and `compareValue`. Assert: per-channel deltas populate
  from `Kpi.delta`; `blendedSpendDelta` equals `delta(Σvalue, Σprior)`;
  the blended delta blanks (`undefined`) when one configured channel's
  `compareValue` is missing; `blendedCostPerLeadDelta` uses prior spend/leads and
  inverts correctly; a non-configured channel contributes no delta.
- **`components/report-sections/paid-media/overview/index.test.tsx`:** the mocked
  `getPaidMediaOverview` returns delta fields; assert a blended tile and a
  per-channel card render the delta percentage, and that a tile with an
  `undefined` delta shows the `comparisonExpected` placeholder.
- CI: `npx vitest run`, `npx tsx scripts/check-rsc-props.ts`, `npx tsc --noEmit`.

## Non-goals

- No change to `KpiCard`.
- No delta on the trend chart (it's already a time series).
- No new compare-mode selector UI — the Overview uses the automatic
  `previous_period` default, like the other sections.
- No change to Meta leads (remains unavailable → `—`).
