# Paid Media Overview — KPI-tile Period Deltas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "vs prior period" deltas to the Paid Media Overview's blended top-line tiles (Spend/Clicks/Leads/Cost per Lead) and per-channel breakdown cards (Spend/Clicks/Leads).

**Architecture:** Each channel's `getXKpis` already computes per-KPI deltas against the prior period; they just weren't requested here. Expose each blended KPI's prior *absolute* value via a new optional `Kpi.compareValue`, have `getPaidMediaOverview` request `previous_period` and compute per-channel deltas (from `Kpi.delta`) plus exact blended deltas (from summed priors, under the existing all-or-nothing gate), and pass them to the delta-capable `KpiCard`.

**Tech Stack:** Next.js 16 (RSC), TypeScript strict, vitest + @testing-library/react, Supermetrics Data API (server-side).

**Companion spec:** `docs/superpowers/specs/2026-08-06-paid-media-overview-kpi-deltas-design.md`.

## Global Constraints

- **Reuse `KpiCard`'s existing delta API** — `delta?: number`, `invertDelta?`, `deltaLabel` (default `'vs prior period'`), `comparisonExpected?`. Do NOT modify `components/charts/kpi-card.tsx`.
- **Comparison period = `previous_period`**: `getPaidMediaOverview` uses `const effectiveCompare = compareRange ?? 'previous_period'`, matching the standalone sections (`PaidSearchReport`).
- **Color convention:** no `invertDelta` on Spend/Clicks/Leads (increase renders green); `invertDelta: true` on Cost per Lead (lower is better).
- **`delta(cur, prev)` helper is `undefined` when `prev` is `0` or absent** (this exact rule already exists in every `kpis.ts`). A blended delta is `undefined` unless *every* channel feeding that blend has a defined prior — the same all-or-nothing gate as the blended value.
- **`compareValue` is the prior absolute of the SAME quantity as `value`** and stays `undefined` when no compare period resolved. Additive/optional — no existing `Kpi` consumer changes.
- **Meta has no leads** — Meta's `leadsDelta` is always `undefined` (renders the `—` placeholder), unchanged from today.
- **CI:** `npx vitest run`, `npx tsx scripts/check-rsc-props.ts`, `npx tsc --noEmit` all green before merge.
- **Branch:** `feat/paid-media-blended-leads` (PR #204). Commit per task.
- Reuse `ChannelKey` (`'paid-search' | 'meta' | 'linkedin'`) from `lib/paid-media/overview.ts`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/paid-search/types.ts` | add `compareValue?: number` to `Kpi` | 1 |
| `lib/paid-search/kpis.ts` | attach `compareValue` on `cost`/`clicks`/`leads` | 1 |
| `lib/meta/kpis.ts` | attach `compareValue` on `spend`/`linkClicks` | 1 |
| `lib/linkedin/kpis.ts` | attach `compareValue` on `spend`/`clicks`/`leads` | 1 |
| `lib/{paid-search,meta,linkedin}/kpis.test.ts` | assert `compareValue` present | 1 |
| `lib/paid-media/overview.ts` | request compare; per-channel + blended deltas | 2 |
| `lib/paid-media/overview.test.ts` | delta rollup tests | 2 |
| `components/report-sections/paid-media/overview/index.tsx` | thread `compareRange`; wire deltas to tiles | 3 |
| `components/report-sections/paid-media/overview/index.test.tsx` | tiles render deltas | 3 |

---

## Task 1: Expose prior-period `compareValue` on the blended KPIs

**Files:**
- Modify: `lib/paid-search/types.ts`
- Modify: `lib/paid-search/kpis.ts`, `lib/meta/kpis.ts`, `lib/linkedin/kpis.ts`
- Test: `lib/paid-search/kpis.test.ts`, `lib/meta/kpis.test.ts`, `lib/linkedin/kpis.test.ts`

**Interfaces:**
- Produces: `Kpi.compareValue?: number` — the prior-period absolute value of `Kpi.value`, present on the `cost`/`spend`, `clicks`/`linkClicks`, and `leads` KPIs when a compare period resolved.

Each channel's transform is pure and directly unit-tested:
`transformKpis(totals, actionRows, compareTotals, compareActionRows, cfg)` (Paid Search), `transformMetaKpis(totals, compare)`, `transformLinkedInKpis(totals, compare)`. Each already computes the prior values it needs (Paid Search as `cCost`/`cClicks`/`cLeads` locals; Meta/LinkedIn via `n(compare, id)`).

- [ ] **Step 1: Write the failing tests.** Append to each channel's test file.

`lib/paid-search/kpis.test.ts` — this file already has a module-scoped fixture `const cfg = { googleAdsAccountId: '4136001852', leadActions: [{ name: 'contact_individual_lead', category: 'contact' as const }] }` at the top; use it directly. Add:
```ts
test('attaches prior-period compareValue on cost, clicks and leads', () => {
  const k = transformKpis(
    { Cost: '100', Clicks: '10', Impressions: '1000' },
    [{ ConversionTypeName: 'contact_individual_lead', Conversions: '5' }],
    { Cost: '80', Clicks: '8', Impressions: '900' },
    [{ ConversionTypeName: 'contact_individual_lead', Conversions: '4' }],
    cfg,
  )
  expect(k.find((x) => x.key === 'cost')!.compareValue).toBe(80)
  expect(k.find((x) => x.key === 'clicks')!.compareValue).toBe(8)
  expect(k.find((x) => x.key === 'leads')!.compareValue).toBe(4)
})
```

`lib/meta/kpis.test.ts` — inside `describe('transformMetaKpis', …)`:
```ts
test('attaches prior-period compareValue on spend and linkClicks', () => {
  const k = transformMetaKpis(
    { cost: '100', inline_link_clicks: '10' },
    { cost: '80', inline_link_clicks: '8' },
  )
  expect(k.find((x) => x.key === 'spend')!.compareValue).toBe(80)
  expect(k.find((x) => x.key === 'linkClicks')!.compareValue).toBe(8)
})

test('compareValue is undefined when there is no compare period', () => {
  const k = transformMetaKpis({ cost: '100', inline_link_clicks: '10' }, null)
  expect(k.find((x) => x.key === 'spend')!.compareValue).toBeUndefined()
})
```

`lib/linkedin/kpis.test.ts` — inside `describe('transformLinkedInKpis', …)`:
```ts
test('attaches prior-period compareValue on spend, clicks and leads', () => {
  const k = transformLinkedInKpis(
    { spend: '100', clicks: '10', oneClickLeads: '5' },
    { spend: '80', clicks: '8', oneClickLeads: '4' },
  )
  expect(k.find((x) => x.key === 'spend')!.compareValue).toBe(80)
  expect(k.find((x) => x.key === 'clicks')!.compareValue).toBe(8)
  expect(k.find((x) => x.key === 'leads')!.compareValue).toBe(4)
})
```

- [ ] **Step 2: Run, verify they fail.** `npx vitest run lib/paid-search/kpis.test.ts lib/meta/kpis.test.ts lib/linkedin/kpis.test.ts` → the three new tests FAIL (`compareValue` is `undefined`).

- [ ] **Step 3: Add the field.** In `lib/paid-search/types.ts`, extend `Kpi`:
```ts
export interface Kpi { key: string; label: string; value: number | string | null; prefix?: string; suffix?: string; delta?: number; invertDelta?: boolean; tooltip?: string; /** 'money' → render the numeric value as Paid Media cents ($1,234.50); null → '—'. */ format?: 'money'; /** Prior-period absolute of `value` (same quantity), when a compare period resolved. */ compareValue?: number }
```

- [ ] **Step 4: Attach in Paid Search.** In `lib/paid-search/kpis.ts` `transformKpis`, add `compareValue` to three entries (the `cCost`/`cClicks`/`cLeads` locals already exist):
```ts
{ key: 'cost', label: 'Cost', value: cost, format: 'money', delta: delta(cost, cCost), compareValue: cCost },
{ key: 'clicks', label: 'Clicks', value: clicks, delta: delta(clicks, cClicks), compareValue: cClicks },
{ key: 'leads', label: 'Leads', value: leads, delta: delta(leads, cLeads), compareValue: cLeads },
```

- [ ] **Step 5: Attach in Meta.** In `lib/meta/kpis.ts` `transformMetaKpis`, add a prior-value reader after `const d = …`:
```ts
const cv = (id: string) => (compare ? n(compare, id) : undefined)
```
then set `compareValue` on the two blended entries (same field id as their `value`):
```ts
{ key: 'spend', label: 'Spend', value: n(totals, 'cost'), format: 'money', delta: d('cost'), compareValue: cv('cost') },
// …
{ key: 'linkClicks', label: 'Link Clicks', value: n(totals, 'inline_link_clicks'), delta: d('inline_link_clicks'), compareValue: cv('inline_link_clicks') },
```

- [ ] **Step 6: Attach in LinkedIn.** In `lib/linkedin/kpis.ts` `transformLinkedInKpis`, add the same `cv` helper after `const d = …`:
```ts
const cv = (id: string) => (compare ? n(compare, id) : undefined)
```
then set `compareValue` on the three blended entries:
```ts
{ key: 'spend', label: 'Spend', value: n(totals, 'spend'), format: 'money', delta: d('spend'), compareValue: cv('spend') },
{ key: 'clicks', label: 'Clicks', value: n(totals, 'clicks'), delta: d('clicks'), compareValue: cv('clicks') },
{ key: 'leads', label: 'Leads', value: n(totals, 'oneClickLeads'), delta: d('oneClickLeads'), compareValue: cv('oneClickLeads') },
```

- [ ] **Step 7: Run tests + typecheck.** `npx vitest run lib/paid-search/kpis.test.ts lib/meta/kpis.test.ts lib/linkedin/kpis.test.ts` → PASS (existing + new). `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit.**
```bash
git add lib/paid-search/types.ts lib/paid-search/kpis.ts lib/meta/kpis.ts lib/linkedin/kpis.ts lib/paid-search/kpis.test.ts lib/meta/kpis.test.ts lib/linkedin/kpis.test.ts
git commit -m "feat(paid-media): expose prior-period compareValue on channel KPIs"
```

---

## Task 2: Per-channel + blended deltas in `getPaidMediaOverview`

**Files:**
- Modify: `lib/paid-media/overview.ts`
- Test: `lib/paid-media/overview.test.ts`

**Interfaces:**
- Consumes: `Kpi.compareValue` (Task 1); `getXKpis(slug, dateRange, compareRange)`.
- Produces:
  - `getPaidMediaOverview(clientSlug, dateRange, compareRange?: string | null)`.
  - `ChannelMetrics` gains `spendDelta`, `clicksDelta`, `leadsDelta` (`number | undefined`).
  - `PaidMediaOverview` gains `blendedSpendDelta`, `blendedClicksDelta`, `blendedLeadsDelta`, `blendedCostPerLeadDelta` (`number | undefined`).

- [ ] **Step 1: Write the failing tests.** Append to `lib/paid-media/overview.test.ts`. First extend the `ps`/`meta`/`li` KPI builders at the top of the file to accept optional priors and attach `compareValue` (leave existing calls working — priors default `undefined`):
```ts
const ps = (cost: number, clicks: number, leads = 0, prior?: { cost: number; clicks: number; leads: number }): Kpi[] => [
  { key: 'cost', label: 'Cost', value: cost, format: 'money', delta: prior ? ((cost - prior.cost) / prior.cost) * 100 : undefined, compareValue: prior?.cost },
  { key: 'clicks', label: 'Clicks', value: clicks, delta: prior ? ((clicks - prior.clicks) / prior.clicks) * 100 : undefined, compareValue: prior?.clicks },
  { key: 'leads', label: 'Leads', value: leads, delta: prior ? ((leads - prior.leads) / prior.leads) * 100 : undefined, compareValue: prior?.leads },
]
const li = (spend: number, clicks: number, leads = 0, prior?: { spend: number; clicks: number; leads: number }): Kpi[] => [
  { key: 'spend', label: 'Spend', value: spend, format: 'money', delta: prior ? ((spend - prior.spend) / prior.spend) * 100 : undefined, compareValue: prior?.spend },
  { key: 'clicks', label: 'Clicks', value: clicks, delta: prior ? ((clicks - prior.clicks) / prior.clicks) * 100 : undefined, compareValue: prior?.clicks },
  { key: 'leads', label: 'Leads', value: leads, delta: prior ? ((leads - prior.leads) / prior.leads) * 100 : undefined, compareValue: prior?.leads },
]
```
Then add a describe block:
```ts
describe('getPaidMediaOverview — deltas', () => {
  test('per-channel and blended deltas compute from summed priors', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true })) // no Meta
    // Paid Search: spend 100 (prior 80), clicks 10 (prior 8), leads 5 (prior 4)
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    // LinkedIn: spend 300 (prior 200), clicks 30 (prior 20), leads 15 (prior 10)
    liMock.mockResolvedValue(li(300, 30, 15, { spend: 200, clicks: 20, leads: 10 }))

    const o = await getPaidMediaOverview('acme', 'last_30_days')

    // Per-channel deltas come straight from each Kpi.delta.
    const psRow = o.channels.find((c) => c.key === 'paid-search')!
    expect(psRow.spendDelta).toBeCloseTo(25) // (100-80)/80
    expect(psRow.clicksDelta).toBeCloseTo(25)
    expect(psRow.leadsDelta).toBeCloseTo(25)

    // Blended = delta(sumCurrent, sumPrior): spend (400 vs 280), clicks (40 vs 28), leads (20 vs 14).
    expect(o.blendedSpendDelta).toBeCloseTo(((400 - 280) / 280) * 100)
    expect(o.blendedClicksDelta).toBeCloseTo(((40 - 28) / 28) * 100)
    expect(o.blendedLeadsDelta).toBeCloseTo(((20 - 14) / 14) * 100)
    // Blended CPL: cur 400/20=20, prior 280/14=20 → 0% (invert handled in UI).
    expect(o.blendedCostPerLeadDelta).toBeCloseTo(0)
  })

  test('a configured channel missing its prior blanks the blended delta (all-or-nothing)', async () => {
    clientMock.mockResolvedValue(client({ ps: true, li: true }))
    psMock.mockResolvedValue(ps(100, 10, 5, { cost: 80, clicks: 8, leads: 4 }))
    liMock.mockResolvedValue(li(300, 30, 15)) // no prior → compareValue undefined

    const o = await getPaidMediaOverview('acme', 'last_30_days')
    expect(o.channels.find((c) => c.key === 'linkedin')!.spendDelta).toBeUndefined()
    expect(o.blendedSpendDelta).toBeUndefined()
    expect(o.blendedClicksDelta).toBeUndefined()
    expect(o.blendedLeadsDelta).toBeUndefined()
    expect(o.blendedCostPerLeadDelta).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, verify they fail.** `npx vitest run lib/paid-media/overview.test.ts` → the two new tests FAIL (`spendDelta`/`blendedSpendDelta` undefined-on-type / not present).

- [ ] **Step 3: Extend the interfaces.** In `lib/paid-media/overview.ts`:
  - Add to `ChannelMetrics` (after `ok`):
    ```ts
    /** Per-channel % change vs the prior period (undefined = no comparison). */
    spendDelta?: number
    clicksDelta?: number
    leadsDelta?: number
    ```
  - Add to `PaidMediaOverview` (after `blendedCostPerLead`):
    ```ts
    /** Blended % change vs the prior period; undefined unless every channel feeding the blend has a prior (same all-or-nothing gate as the value). */
    blendedSpendDelta?: number
    blendedClicksDelta?: number
    blendedLeadsDelta?: number
    blendedCostPerLeadDelta?: number
    ```

- [ ] **Step 4: Add reader helpers + a delta helper.** In `lib/paid-media/overview.ts`, below `readKpi`:
```ts
function readKpiDelta(kpis: Kpi[], key: string): number | undefined {
  return kpis.find((k) => k.key === key)?.delta
}
function readKpiCompare(kpis: Kpi[], key: string): number | undefined {
  return kpis.find((k) => k.key === key)?.compareValue
}
/** % change vs prior; undefined when prior is 0 or absent (matches the channels' rule). */
function pct(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}
```

- [ ] **Step 5: Request the compare period + capture deltas/priors per channel.** In `getPaidMediaOverview`:
  1. Change the signature to `(clientSlug: string, dateRange: string, compareRange: string | null = null)` and add, before the `settled` fetch:
     ```ts
     const effectiveCompare = compareRange ?? 'previous_period'
     ```
  2. Pass it to all three fetchers (replace the three `null` args):
     ```ts
     configured['paid-search'] ? getPaidSearchKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
     configured.meta ? getMetaKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
     configured.linkedin ? getLinkedInKpis(clientSlug, dateRange, effectiveCompare) : Promise.resolve(null),
     ```
  3. In the `CHANNELS.map`, the non-configured and `failed` return objects keep the new delta fields `undefined` implicitly (they're optional — no change needed). In the success return, add the per-channel deltas:
     ```ts
     return {
       key: c.key, label: c.label, configured: true, spend, clicks, leads, ok: true,
       spendDelta: readKpiDelta(res.value, c.spendKey),
       clicksDelta: readKpiDelta(res.value, c.clicksKey),
       leadsDelta: c.leadsKey ? readKpiDelta(res.value, c.leadsKey) : undefined,
     }
     ```
  4. Build a per-channel prior map for the blend (keyed by channel key), reading from the same `settled` results. Immediately after the `channels` array is built, add:
     ```ts
     // Prior-period absolutes per channel, for blended deltas. Only for channels that
     // reported (ok) with a defined compareValue on the blended key; undefined otherwise.
     const priorOf = (key: ChannelKey) => {
       const i = CHANNELS.findIndex((c) => c.key === key)
       const cfg = CHANNELS[i]
       const res = settled[i]
       if (!configured[key] || res.status !== 'fulfilled' || res.value == null) return null
       return {
         spend: readKpiCompare(res.value, cfg.spendKey),
         clicks: readKpiCompare(res.value, cfg.clicksKey),
         leads: cfg.leadsKey ? readKpiCompare(res.value, cfg.leadsKey) : undefined,
       }
     }
     ```

- [ ] **Step 6: Compute blended deltas under the all-or-nothing gate.** Replace the final `return { channels, blendedSpend, … }` with the blended-delta computation, then return. Insert before the `return`:
```ts
// Blended deltas: sum priors over the same channels feeding each blended value.
// Blank (undefined) unless the value itself is available AND every contributing
// channel has a defined prior for that metric.
const priorsFor = (rows: ChannelMetrics[], field: 'spend' | 'clicks' | 'leads') => {
  const vals = rows.map((c) => priorOf(c.key)?.[field])
  return vals.every((v) => v != null) ? (vals as number[]).reduce((s, v) => s + v, 0) : undefined
}

const blendedSpendPrior = allOk ? priorsFor(runs, 'spend') : undefined
const blendedClicksPrior = allOk ? priorsFor(runs, 'clicks') : undefined
const blendedLeadsPrior = leadsOk ? priorsFor(leadRuns, 'leads') : undefined
const leadSpendPrior = leadsOk ? priorsFor(leadRuns, 'spend') : undefined

const blendedSpendDelta = blendedSpend != null ? pct(blendedSpend, blendedSpendPrior) : undefined
const blendedClicksDelta = blendedClicks != null ? pct(blendedClicks, blendedClicksPrior) : undefined
const blendedLeadsDelta = blendedLeads != null ? pct(blendedLeads, blendedLeadsPrior) : undefined
const priorCpl =
  leadSpendPrior != null && blendedLeadsPrior != null && blendedLeadsPrior > 0
    ? leadSpendPrior / blendedLeadsPrior
    : undefined
const blendedCostPerLeadDelta =
  blendedCostPerLead != null ? pct(blendedCostPerLead, priorCpl) : undefined
```
then:
```ts
return {
  channels, blendedSpend, blendedClicks, blendedLeads, blendedCostPerLead,
  blendedSpendDelta, blendedClicksDelta, blendedLeadsDelta, blendedCostPerLeadDelta,
}
```

- [ ] **Step 7: Run tests + typecheck.** `npx vitest run lib/paid-media/overview.test.ts` → PASS (existing + new). `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit.**
```bash
git add lib/paid-media/overview.ts lib/paid-media/overview.test.ts
git commit -m "feat(paid-media): Overview computes per-channel + blended prior-period deltas"
```

---

## Task 3: Wire deltas into the Overview UI

**Files:**
- Modify: `components/report-sections/paid-media/overview/index.tsx`
- Test: `components/report-sections/paid-media/overview/index.test.tsx`

**Interfaces:**
- Consumes: `PaidMediaOverview.blendedXDelta` + `ChannelMetrics.xDelta` (Task 2).

- [ ] **Step 1: Extend the test.** In `components/report-sections/paid-media/overview/index.test.tsx`, add delta fields to the FIRST test's mocked overview object and assert they render. In that `mock.mockResolvedValue({ … })`, add to the channel objects and the blended fields:
```ts
// paid-search channel: add spendDelta: 25, clicksDelta: 10, leadsDelta: 5
// meta channel: add spendDelta: -8, clicksDelta: 4  (no leadsDelta — Meta)
// blended: add blendedSpendDelta: undefined, blendedClicksDelta: undefined,
//          blendedLeadsDelta: 12, blendedCostPerLeadDelta: -3
```
Then add assertions inside that test:
```ts
// Per-channel delta renders (Paid Search Spend +25%).
expect(screen.getByText(/25\.0% vs prior period/i)).toBeInTheDocument()
// Blended Leads delta renders (+12%).
expect(screen.getByText(/12\.0% vs prior period/i)).toBeInTheDocument()
// A blended tile with an undefined delta shows the greyed placeholder.
expect(screen.getAllByText(/^— vs prior period$/i).length).toBeGreaterThanOrEqual(1)
```
(The `KpiCard` renders a defined delta as `↑ 25.0% vs prior period` / `↓ …`; an undefined delta with `comparisonExpected` renders `— vs prior period`.)

- [ ] **Step 2: Run, verify it fails.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → FAIL (no delta text rendered yet).

- [ ] **Step 3: Thread `compareRange` + wire the tiles.** In `components/report-sections/paid-media/overview/index.tsx`:
  1. Add the prop and pass it through:
     ```ts
     export async function PaidMediaOverviewReport({
       clientSlug,
       dateRange = 'last_30_days',
       compareRange = null,
     }: {
       clientSlug: string
       dateRange?: string
       compareRange?: string | null
     }) {
       const [o, trend] = await Promise.all([
         getPaidMediaOverview(clientSlug, dateRange, compareRange),
         getPaidMediaTrend(clientSlug, dateRange),
       ])
     ```
  2. Blended tiles — add `delta` + `comparisonExpected` (and `invertDelta` on Cost per Lead):
     ```tsx
     <KpiCard title="Spend" value={asMoney(o.blendedSpend)} delta={o.blendedSpendDelta} comparisonExpected />
     <KpiCard
       title="Clicks"
       value={asNum(o.blendedClicks)}
       delta={o.blendedClicksDelta}
       comparisonExpected
       tooltip="Blended across the channels this client runs. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
     />
     <KpiCard title="Leads" value={asNum(o.blendedLeads)} delta={o.blendedLeadsDelta} comparisonExpected />
     <KpiCard title="Cost per Lead" value={asMoney(o.blendedCostPerLead)} delta={o.blendedCostPerLeadDelta} comparisonExpected invertDelta />
     ```
  3. Per-channel cards — add `delta` + `comparisonExpected`:
     ```tsx
     <KpiCard title="Spend" value={asMoney(c.spend)} delta={c.spendDelta} comparisonExpected />
     <KpiCard title="Clicks" value={asNum(c.clicks)} delta={c.clicksDelta} comparisonExpected />
     <KpiCard title="Leads" value={asNum(c.leads)} delta={c.leadsDelta} comparisonExpected />
     ```

- [ ] **Step 4: Run tests + RSC + typecheck.** `npx vitest run components/report-sections/paid-media/overview/index.test.tsx` → PASS; `npx tsx scripts/check-rsc-props.ts` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.**
```bash
git add components/report-sections/paid-media/overview/index.tsx components/report-sections/paid-media/overview/index.test.tsx
git commit -m "feat(paid-media): Overview KPI tiles show prior-period deltas"
```

---

## Final verification (before pushing to PR #204)

- [ ] `npx vitest run` → all green.
- [ ] `npx tsx scripts/check-rsc-props.ts` → passes.
- [ ] `npx tsc --noEmit` → clean.
- [ ] Manual: Overview tiles show `↑/↓ N.0% vs prior period` on blended Spend/Clicks/Leads/CPL and each per-channel Spend/Clicks/Leads; Meta's Leads shows `— vs prior period`; a channel with no prior-period data shows the greyed placeholder rather than a number; Cost per Lead colours a decrease green.

## Self-review (spec coverage)

- Spec §"Kpi type" + §"Channel transforms attach compareValue" → Task 1. §"getPaidMediaOverview — compute deltas" (signature, helpers, `ChannelMetrics`/`PaidMediaOverview` fields, blended gate, CPL) → Task 2. §"UI wiring" (compareRange prop, blended + per-channel `delta`/`comparisonExpected`, invert on CPL) → Task 3. §"Testing" → each task's tests. Non-goals (no `KpiCard` change, no trend delta, no compare-mode selector, Meta leads unchanged) respected.
- Type consistency: `Kpi.compareValue` (Task 1) read by `readKpiCompare` (Task 2); `ChannelMetrics.{spend,clicks,leads}Delta` + `PaidMediaOverview.blended*Delta` (Task 2) consumed in Task 3; `getPaidMediaOverview` third arg `compareRange` (Task 2) passed from Task 3. Names align.
