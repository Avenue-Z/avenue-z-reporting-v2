# Paid Search Refinements (Round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add period-over-period deltas to the five paid-search KPIs that lack them, remove the duplicate leads trend line, and show the loading skeleton when the date range changes (dashboard + portal).

**Architecture:** Three independent changes over the existing paid-search report. KPI deltas are computed in the pure `transformKpis` from comparison data that's already fetched; the duplicate line is removed by making the shared `ComboChart`'s `line` prop optional; the loading indicator is fixed by adding the date range to the report's Suspense key so a range change remounts the boundary and re-shows the existing skeleton.

**Tech Stack:** Next.js 16 (App Router, RSC + Suspense), TypeScript (strict), Recharts (via `ComboChart`), Tailwind. Tests are standalone `node:assert` scripts run with `npx tsx <file>` (they print `ok`); there is no test runner or `test` npm script. Component/page code is verified with `npx tsc --noEmit` AND `npm run build` (the Next build is the only check that catches client/server bundling errors).

## Global Constraints

- Builds on the round-1 work on branch `feat/paid-search-feedback` (PR #79, not yet merged). Any isolated workspace MUST branch from that branch's current HEAD — NOT an older base — or files round-1 changed will regress. The only round-2 file that round-1 also modified is `lib/paid-search/types.ts`: it must already contain `KeywordRow`, `GeoDma`, `GeoRegion` and must NOT contain `SearchTermRow`/`GeoRow` (round-1 removed them). Round-2 only ADDS one optional field to the `Kpi` interface in that file.
- Delta coloring: `invertDelta: true` ONLY on `cpc` (Avg CPC) and `cpl` (Cost/Lead) — a decrease shows green. `impressions`, `ctr`, `convRate` use normal up=green. `cost` stays up=green (unchanged).
- A delta must be `undefined` when there is no comparison period or the comparison denominator is 0 (use the existing `delta(cur, prev)` helper, which already returns `undefined` when `prev` is `null`/`0`). No false deltas.
- `ComboChart` must stay backward-compatible: `bar` required, `line` optional. `components/report-sections/paid-search/hero.tsx` still passes a `line` and must keep rendering it.
- Tests: standalone `node:assert` scripts ending in `console.log('ok')`, run with `npx tsx <path>`. `lib/paid-search/kpis.test.ts` transitively imports the DB client at module load, so run it with env present: `DATABASE_URL="${DATABASE_URL:-postgresql://fake:fake@localhost/fake}" npx tsx --env-file=.env.local lib/paid-search/kpis.test.ts` (the fake URL is enough; the test exercises only the pure transform).
- Verify component/page tasks with `npx tsc --noEmit` AND `npm run build`.
- Commit after each task; do not push.

---

## Interconnected Components & Parallelization

**The three tasks touch completely disjoint file sets — they can all run in one parallel wave.**

| Task | Files (exclusive) |
|---|---|
| 1. KPI deltas | `lib/paid-search/types.ts`, `lib/paid-search/kpis.ts`, `lib/paid-search/kpis.test.ts`, `components/report-sections/paid-search/kpi-grid.tsx` |
| 2. Remove leads line | `components/charts/combo-chart.tsx`, `components/report-sections/paid-search/leads-section.tsx` |
| 3. Loading on range change | `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` |

- **No file is shared between tasks** → no merge collisions; dependency graph is flat.
- **Within Task 1**, edit order matters: add the `invertDelta` field to the `Kpi` type (`types.ts`) before `kpis.ts`/`kpi-grid.tsx` reference it. Within Task 2, make `ComboChart.line` optional (`combo-chart.tsx`) before removing the `line` usage (`leads-section.tsx`). These are intra-task orderings, not cross-task dependencies.
- **Cross-task type/UX contracts:** Task 1 sets `invertDelta` on `cpc`/`cpl`; `KpiCard` already consumes `invertDelta` (no change to `kpi-card.tsx`). Task 2 relies on `ComboChart` staying backward-compatible so `hero.tsx` is untouched. Task 3 reuses the existing `SectionSkeleton` fallback (no change to the skeleton).
- **Execution-environment caveat (carried from round-1):** the harness's worktree isolation branches new worktrees from a stale base that predates round-1, so a worktree's `types.ts` would be the pre-round-1 version. If running this fleet with worktree isolation, do NOT integrate `types.ts` by copying the whole file from a stale-base worktree — apply only the one-line `Kpi` addition onto the live branch's `types.ts`. The other round-2 files were not touched by round-1, so they integrate cleanly. Running the tasks in the main working tree (sequential or carefully serialized commits) avoids this entirely.

---

## Task 1: KPI deltas for Impressions, CTR, Avg CPC, Cost/Lead, Conversion Rate

**Files:**
- Modify: `lib/paid-search/types.ts` (add `invertDelta?` to `Kpi`)
- Modify: `lib/paid-search/kpis.ts` (`transformKpis`)
- Modify: `lib/paid-search/kpis.test.ts` (extend assertions)
- Modify: `components/report-sections/paid-search/kpi-grid.tsx` (forward `invertDelta`)

**Interfaces:**
- Consumes: `delta(cur, prev)` helper and `scopedLeads` (already in `kpis.ts`); `KpiCard`'s existing `invertDelta?: boolean` prop.
- Produces: `Kpi` objects where `impressions`/`ctr`/`cpc`/`cpl`/`convRate` carry `delta`, and `cpc`/`cpl` carry `invertDelta: true`.

- [ ] **Step 1: Add `invertDelta` to the `Kpi` type**

In `lib/paid-search/types.ts`, change the `Kpi` interface line to add `invertDelta?`:

```typescript
export interface Kpi { key: string; label: string; value: number; prefix?: string; suffix?: string; delta?: number; invertDelta?: boolean; tooltip?: string }
```

- [ ] **Step 2: Extend the failing test**

Append these assertions to `lib/paid-search/kpis.test.ts`, immediately before the final `console.log('ok')` line:

```typescript
// Round 2: deltas present for all comparable metrics when a comparison period exists
for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
  const card = kpis2.find((k) => k.key === key)!
  assert.ok(card.delta !== undefined, `${key} delta should be defined with a comparison period`)
}
// Cost-efficiency metrics invert delta coloring (down = good)
assert.equal(kpis2.find((k) => k.key === 'cpc')!.invertDelta, true)
assert.equal(kpis2.find((k) => k.key === 'cpl')!.invertDelta, true)
// Non-cost metrics do not invert
assert.ok(!kpis2.find((k) => k.key === 'ctr')!.invertDelta)
assert.ok(!kpis2.find((k) => k.key === 'impressions')!.invertDelta)
// Without a comparison period, the new deltas stay undefined
for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
  assert.equal(kpis.find((k) => k.key === key)!.delta, undefined, `${key} delta should be undefined without comparison`)
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `DATABASE_URL="${DATABASE_URL:-postgresql://fake:fake@localhost/fake}" npx tsx --env-file=.env.local lib/paid-search/kpis.test.ts`
Expected: FAIL — e.g. `impressions delta should be defined with a comparison period` (current `transformKpis` sets no delta on impressions).

- [ ] **Step 4: Implement deltas in `transformKpis`**

In `lib/paid-search/kpis.ts`, replace the entire `transformKpis` function body with this version (computes current derived values and comparison-derived values, then attaches deltas; `cpc`/`cpl` get `invertDelta: true`):

```typescript
export function transformKpis(
  totals: Record<string, string>,
  actionRows: Record<string, string>[],
  compareTotals: Record<string, string> | null,
  compareActionRows: Record<string, string>[] | null,
  cfg: PaidSearchConfig,
): Kpi[] {
  const cost = Number(totals.Cost || 0), clicks = Number(totals.Clicks || 0), impressions = Number(totals.Impressions || 0)
  const leads = scopedLeads(actionRows, cfg)
  const ctr = impressions ? +((clicks / impressions) * 100).toFixed(1) : 0
  const cpc = clicks ? +(cost / clicks).toFixed(2) : 0
  const cpl = leads ? Math.round(cost / leads) : 0
  const convRate = clicks ? +((leads / clicks) * 100).toFixed(1) : 0

  // Comparison-period values. Each derived value is undefined when there is no
  // comparison period or its denominator is 0, so delta() then yields undefined.
  const cLeads = compareActionRows ? scopedLeads(compareActionRows, cfg) : undefined
  const cCost = compareTotals ? Number(compareTotals.Cost || 0) : undefined
  const cClicks = compareTotals ? Number(compareTotals.Clicks || 0) : undefined
  const cImpr = compareTotals ? Number(compareTotals.Impressions || 0) : undefined
  const cCtr = cImpr ? (cClicks! / cImpr) * 100 : undefined
  const cCpc = cClicks ? cCost! / cClicks : undefined
  const cCpl = cLeads ? cCost! / cLeads : undefined
  const cConvRate = cClicks && cLeads != null ? (cLeads / cClicks) * 100 : undefined

  return [
    { key: 'cost', label: 'Cost', value: Math.round(cost), prefix: '$', delta: delta(cost, cCost) },
    { key: 'clicks', label: 'Clicks', value: clicks, delta: delta(clicks, cClicks) },
    { key: 'impressions', label: 'Impressions', value: impressions, delta: delta(impressions, cImpr) },
    { key: 'ctr', label: 'CTR', value: ctr, suffix: '%', delta: delta(ctr, cCtr) },
    { key: 'cpc', label: 'Avg. CPC', value: cpc, prefix: '$', delta: delta(cpc, cCpc), invertDelta: true },
    { key: 'leads', label: 'Leads', value: leads, delta: delta(leads, cLeads) },
    { key: 'cpl', label: 'Cost / Lead', value: cpl, prefix: '$', delta: delta(cpl, cCpl), invertDelta: true },
    { key: 'convRate', label: 'Conversion Rate', value: convRate, suffix: '%', delta: delta(convRate, cConvRate) },
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `DATABASE_URL="${DATABASE_URL:-postgresql://fake:fake@localhost/fake}" npx tsx --env-file=.env.local lib/paid-search/kpis.test.ts`
Expected: PASS — prints `ok`.

- [ ] **Step 6: Forward `invertDelta` from the grid to the card**

In `components/report-sections/paid-search/kpi-grid.tsx`, add the `invertDelta` prop to the `<KpiCard>`:

```tsx
        <KpiCard
          key={k.key}
          title={k.label}
          value={k.value}
          prefix={k.prefix}
          suffix={k.suffix}
          delta={k.delta}
          invertDelta={k.invertDelta}
          tooltip={k.tooltip}
        />
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/paid-search/types.ts lib/paid-search/kpis.ts lib/paid-search/kpis.test.ts components/report-sections/paid-search/kpi-grid.tsx
git commit -m "feat(paid-search): add deltas to all KPIs; invert CPC & cost/lead"
```

---

## Task 2: Remove the duplicate leads trend line

**Files:**
- Modify: `components/charts/combo-chart.tsx` (make `line` optional)
- Modify: `components/report-sections/paid-search/leads-section.tsx` (drop the `line` prop)

**Interfaces:**
- Consumes: nothing new.
- Produces: a `ComboChart` whose `line` is optional; when omitted, no right-hand Y-axis or line is rendered.

- [ ] **Step 1: Make `line` optional in `ComboChart`**

Replace the entire contents of `components/charts/combo-chart.tsx` with:

```tsx
'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ComboChartProps<T extends object> {
  data: T[]
  xKey: keyof T & string
  bar: { key: keyof T & string; color: string; label: string }
  line?: { key: keyof T & string; color: string; label: string }
  valueFormatter?: (n: number) => string
  xFormatter?: (v: string) => string
}

export function ComboChart<T extends object>({ data, xKey, bar, line, valueFormatter, xFormatter }: ComboChartProps<T>) {
  const fmtLine = (n: number) => Number(n).toLocaleString()
  const fmtBar = (n: number) => (valueFormatter ? valueFormatter(Number(n)) : fmtLine(n))
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormatter} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickFormatter={(v) => fmtBar(Number(v))} width={56} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          {line && <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtLine(Number(v))} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />}
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            formatter={(v, name) => (line && name === line.label ? fmtLine(Number(v)) : fmtBar(Number(v)))}
          />
          <Bar yAxisId="left" dataKey={bar.key} name={bar.label} fill={bar.color} radius={[3, 3, 0, 0]} />
          {line && <Line yAxisId="right" dataKey={line.key} name={line.label} stroke={line.color} strokeDasharray="5 4" dot={false} strokeWidth={2} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Drop the `line` prop from the "Leads Over Time" chart**

In `components/report-sections/paid-search/leads-section.tsx`, replace the `<ComboChart ...>` block (the one under the "Leads Over Time" heading) with the line-less version:

```tsx
        <ComboChart
          data={data.weekly}
          xKey="week"
          xFormatter={weekLabel}
          bar={{ key: 'leads', color: CHART_COLORS.googleAds, label: 'Leads' }}
        />
```

(Leave the rest of the file unchanged. `CHART_COLORS` stays imported — it's still used for `googleAds`.)

- [ ] **Step 3: Type-check, lint, and build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx eslint components/charts/combo-chart.tsx components/report-sections/paid-search/leads-section.tsx`
Expected: 0 errors, 0 warnings (no unused `CHART_COLORS`/imports left behind).

Run: `npm run build`
Expected: "Compiled successfully"; build exits 0. (`hero.tsx` still uses `ComboChart` with a line — the build confirms it still type-checks and bundles.)

- [ ] **Step 4: Commit**

```bash
git add components/charts/combo-chart.tsx components/report-sections/paid-search/leads-section.tsx
git commit -m "fix(paid-search): drop duplicate leads trend line (ComboChart.line now optional)"
```

---

## Task 3: Loading skeleton on date-range change (dashboard + portal)

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx` (Suspense key)
- Modify: `app/portal/[clientSlug]/reports/page.tsx` (add Suspense key)

**Interfaces:**
- Consumes: existing `SectionSkeleton` fallback; in-scope `activeSection`, `subsection`, `dateRange`, `compareRange`.
- Produces: a Suspense boundary that remounts on date-range/compare change, re-showing the skeleton.

- [ ] **Step 1: Add the date range to the dashboard Suspense key**

In `app/dashboard/[clientSlug]/reports/page.tsx`, change the Suspense opening tag from:

```tsx
        <Suspense key={`${activeSection}:${subsection ?? ''}`} fallback={<SectionSkeleton />}>
```

to:

```tsx
        <Suspense key={`${activeSection}:${subsection ?? ''}:${dateRange}:${compareRange ?? ''}`} fallback={<SectionSkeleton />}>
```

- [ ] **Step 2: Add the same key to the portal Suspense (currently unkeyed)**

In `app/portal/[clientSlug]/reports/page.tsx`, change:

```tsx
        <Suspense fallback={<SectionSkeleton />}>
```

to:

```tsx
        <Suspense key={`${activeSection}:${subsection ?? ''}:${dateRange}:${compareRange ?? ''}`} fallback={<SectionSkeleton />}>
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: exit 0. (Confirms `activeSection`, `subsection`, `dateRange`, `compareRange` are all in scope in both files.)

Run: `npm run build`
Expected: "Compiled successfully"; build exits 0.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[clientSlug]/reports/page.tsx" "app/portal/[clientSlug]/reports/page.tsx"
git commit -m "fix(reports): show section skeleton when the date range changes (dashboard + portal)"
```

---

## Self-Review

**Spec coverage:**
- Item 1 (deltas for the 5 metrics + invert CPC/Cost-Lead): Task 1. ✓
- Item 2 (remove duplicate leads line, keep hero's line): Task 2. ✓
- Item 3 (loading on range change, dashboard + portal): Task 3. ✓
- Out-of-scope items (other tabs, table deltas, loading.tsx) are not touched. ✓

**Type consistency:** `invertDelta?: boolean` is added to `Kpi` (Task 1 Step 1), set in `transformKpis` (Step 4), and forwarded in `kpi-grid.tsx` (Step 6); `KpiCard` already declares `invertDelta`. `ComboChart`'s `line` becomes optional (Task 2 Step 1) before `leads-section.tsx` omits it (Step 2); `hero.tsx` keeps passing `line` and is untouched.

**Placeholder scan:** none — every code step shows the full code; every run step has an exact command and expected result.

**Parallel-safety:** the three tasks edit disjoint files (table above); only `types.ts` overlaps with round-1 and is edited solely by Task 1 with a one-line addition — flagged in Global Constraints and the parallelization section with the worktree-base caveat.
