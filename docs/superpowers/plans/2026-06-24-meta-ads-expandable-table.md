# Meta Ads Expandable Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Meta ads table with a 3-level expandable Campaign → Ad Set → Ad tree, keeping the existing columns and adding interactive column sorting.

**Architecture:** One Supermetrics query fetches ad-level rows (now including `adset_name`); a pure `buildCreativeTree` function aggregates them bottom-up into campaign/ad-set nodes. A server wrapper computes grand totals and hands the serializable tree to a new `'use client'` component that owns expand/collapse and sorting.

**Tech Stack:** Next.js 15 App Router (RSC + client components), TypeScript strict, Tailwind v4. Tests are lightweight `node:assert` scripts run with `tsx`.

## Global Constraints

- All Supermetrics calls are server-side only (`lib/meta/base.ts` → DB). Never import `lib/meta/creative.ts` from a `'use client'` component — it pulls in the DB client.
- `ds_id` / field ids stay in the data layer. Meta campaign-name field is `adcampaign_name`, ad-set is `adset_name`, ad is `ad_name` (verified via Supermetrics field discovery).
- Keep the existing column set unchanged: Name, Spend, Impressions, Reach, Frequency, Link Clicks, CTR, CPC, LPV, Cost / LPV, Engagements, Share of Spend, Status.
- Match existing visual styling (rounded border, `bg-bg-surface`, uppercase muted headers, row hover, totals row with top border).
- Formatting helpers `usd`, `num`, `pct` live in `@/lib/supermetrics/format` (pure, client-safe).
- The LinkedIn modules (`lib/linkedin/*`, `components/report-sections/linkedin-ads/*`) are independent copies — do NOT touch them.

---

## Inter-Component Dependencies (for parallel execution)

```
Task 1 (types)  ─────────────┬─────────────┐
                             │             │
                             ▼             ▼
                      Task 2 (data)   Task 3 (client component)
                             │             │
                             └──────┬──────┘
                                    ▼
                          Task 4 (server wrapper + wiring)
```

- **Task 1** has no dependencies. It MUST land first — both Task 2 and Task 3 import the types it defines.
- **Task 2** (data layer) and **Task 3** (client UI component) depend ONLY on Task 1, not on each other. **They can be implemented in parallel** by separate agents: Task 2 needs the `CampaignNode`/`AdSetNode`/`CreativeRow`/`CreativeMetrics` type shapes (not Task 3's code); Task 3 needs the same types plus the pure `usd/num/pct` helpers (not Task 2's `buildCreativeTree` implementation).
- **Task 4** depends on BOTH Task 2 (`getCreativeTree`, `creativeGrandTotals`) and Task 3 (`CreativeTableClient`). It MUST run last.

The `Interfaces` block in each task is the contract a parallel agent codes against without reading sibling tasks.

---

## File Structure

- `lib/meta/types.ts` — **modify.** Add `CreativeMetrics`; extend `CreativeRow` with `adSet`; add `AdSetNode`, `CampaignNode`.
- `lib/meta/creative.ts` — **modify.** Add `adset_name` to query + `adSet` to `transformCreative`; add private `aggregate`; add `buildCreativeTree`, `creativeGrandTotals`, `getCreativeTree`; remove `getCreativeRows`, `creativeTotals`, `MetaCreativeTotals` (only the meta-ads section used them).
- `lib/meta/creative.test.ts` — **modify.** Keep existing flat assertions; add `buildCreativeTree` + `creativeGrandTotals` assertions.
- `components/report-sections/meta-ads/creative-table-client.tsx` — **create.** `'use client'` expandable tree renderer (state + sorting + formatting).
- `components/report-sections/meta-ads/creative-table.tsx` — **modify (rewrite).** Server wrapper: compute totals, render the client component.
- `components/report-sections/meta-ads/index.tsx` — **modify.** Fetch `getCreativeTree`, pass `campaigns` to `CreativeTable`.

---

### Task 1: Types

**Files:**
- Modify: `lib/meta/types.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4):
  - `CreativeMetrics` — `{ spend, impressions, reach, frequency, linkClicks, ctr, cpc, lpv, costPerLpv, engagements, shareOfSpend }` (all `number`).
  - `CreativeRow extends CreativeMetrics` — adds `ad: string; campaign: string; adSet: string; status: string`.
  - `AdSetNode extends CreativeMetrics` — adds `name: string; ads: CreativeRow[]`.
  - `CampaignNode extends CreativeMetrics` — adds `name: string; adSets: AdSetNode[]`.

- [ ] **Step 1: Replace the `CreativeRow` interface and add the new types**

In `lib/meta/types.ts`, replace the existing `CreativeRow` interface (lines 1–16) with:

```typescript
export interface CreativeMetrics {
  spend: number
  impressions: number
  reach: number
  frequency: number
  linkClicks: number
  ctr: number
  cpc: number
  lpv: number
  costPerLpv: number
  engagements: number
  shareOfSpend: number
}

export interface CreativeRow extends CreativeMetrics {
  ad: string
  campaign: string
  adSet: string
  status: string
}

export interface AdSetNode extends CreativeMetrics {
  name: string
  ads: CreativeRow[]
}

export interface CampaignNode extends CreativeMetrics {
  name: string
  adSets: AdSetNode[]
}
```

Leave the `MetaGeoRow` interface below it unchanged.

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: errors ONLY in `lib/meta/creative.ts` (it still references the old flat `CreativeRow` shape / `MetaCreativeTotals`) and `components/report-sections/meta-ads/creative-table.tsx`. These are fixed in Tasks 2 and 4. No errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/meta/types.ts
git commit -m "feat(meta-ads): add tree node types for expandable table"
```

---

### Task 2: Data layer — build the tree

**Depends on:** Task 1. **Parallel with:** Task 3.

**Files:**
- Modify: `lib/meta/creative.ts`
- Test: `lib/meta/creative.test.ts`

**Interfaces:**
- Consumes (from Task 1): `CreativeMetrics`, `CreativeRow`, `AdSetNode`, `CampaignNode`.
- Consumes (existing): `metaQuery` from `./base`.
- Produces (consumed by Task 4):
  - `transformCreative(rows: Record<string,string>[]): CreativeRow[]` — now also sets `adSet`.
  - `buildCreativeTree(rows: Record<string,string>[]): CampaignNode[]`
  - `creativeGrandTotals(campaigns: CampaignNode[]): CreativeMetrics` — grand totals, `shareOfSpend: 100`.
  - `getCreativeTree(slug: string, dateRange: string): Promise<CampaignNode[]>`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/meta/creative.test.ts` with:

```typescript
import { strict as assert } from 'node:assert'
import { transformCreative, buildCreativeTree, creativeGrandTotals } from './creative'

// --- flat transform (unchanged behavior) ---
const rows = [
  { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '10000', reach: '8000', Frequency: '1.25', inline_link_clicks: '200', CTR: '2.0', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]
const out = transformCreative(rows)
assert.equal(out[0].ad, 'Ad A')                 // sorted by spend desc
assert.equal(out[0].campaign, 'Awareness')      // adcampaign_name -> campaign
assert.equal(out[0].adSet, 'Set 1')             // adset_name -> adSet
assert.equal(out[0].shareOfSpend, 75)           // 300 / 400 * 100

// --- tree build + aggregation ---
const treeRows = [
  { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '8000', reach: '5000', Frequency: '1.6', inline_link_clicks: '200', CTR: '2.5', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad C', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '100', impressions: '4000', reach: '3000', Frequency: '1.3', inline_link_clicks: '100', CTR: '2.5', CPC: '1.0', landing_page_views: '50', cost_per_landing_page_view: '2.0', action_post_engagement: '200' },
  { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]
const tree = buildCreativeTree(treeRows)
// grand total spend = 500
assert.equal(tree.length, 2)                    // Awareness, Traffic
assert.equal(tree[0].name, 'Awareness')         // 400 spend, sorted desc
assert.equal(tree[0].spend, 400)
assert.equal(tree[0].adSets.length, 1)
assert.equal(tree[0].adSets[0].name, 'Set 1')
assert.equal(tree[0].adSets[0].ads.length, 2)
assert.equal(tree[0].adSets[0].spend, 400)
// derived metrics recomputed from sums (NOT summed):
// impressions 12000, reach 8000 -> frequency 1.5
assert.equal(tree[0].frequency, 1.5)
// linkClicks 300 / impressions 12000 * 100 = 2.5
assert.equal(tree[0].ctr, 2.5)
// cost 400 / linkClicks 300 = 1.33
assert.equal(tree[0].cpc, 1.33)
// cost 400 / lpv 200 = 2
assert.equal(tree[0].costPerLpv, 2)
// share of grand total: 400 / 500 * 100 = 80
assert.equal(tree[0].shareOfSpend, 80)
assert.equal(tree[1].name, 'Traffic')
assert.equal(tree[1].shareOfSpend, 20)          // 100 / 500
assert.equal(tree[0].shareOfSpend + tree[1].shareOfSpend, 100)

// --- grand totals ---
const totals = creativeGrandTotals(tree)
assert.equal(totals.spend, 500)
assert.equal(totals.impressions, 17000)
assert.equal(totals.reach, 12000)
assert.equal(totals.engagements, 880)
assert.equal(totals.shareOfSpend, 100)
console.log('ok')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `DATABASE_URL=postgres://x:x@localhost/x node_modules/.bin/tsx lib/meta/creative.test.ts`
Expected: FAIL — `buildCreativeTree` / `creativeGrandTotals` are not exported yet (import error or "is not a function"). (The dummy `DATABASE_URL` only satisfies the import chain; the test never connects.)

- [ ] **Step 3: Update `transformCreative` and the query to include ad set**

In `lib/meta/creative.ts`:

(a) Update the import line to drop the unused single-row type and keep what's needed:

```typescript
import { metaQuery } from './base'
import type { CreativeRow, CreativeMetrics, AdSetNode, CampaignNode } from './types'
```

(b) In `transformCreative`, add `adSet` to the returned object (right after `campaign`):

```typescript
        ad: r.ad_name,
        campaign: r.adcampaign_name,
        adSet: r.adset_name,
        status: r.adstatus ?? '',
```

(c) Delete the existing `MetaCreativeTotals` interface and the `creativeTotals` function entirely (lines 4–25 in the current file). They were only used by the meta-ads flat table, which Task 4 replaces.

- [ ] **Step 4: Add the aggregation + tree functions**

Add to `lib/meta/creative.ts` (after `transformCreative`):

```typescript
function aggregate(items: CreativeMetrics[], grandTotalSpend: number): CreativeMetrics {
  const spend = items.reduce((s, r) => s + r.spend, 0)
  const impressions = items.reduce((s, r) => s + r.impressions, 0)
  const reach = items.reduce((s, r) => s + r.reach, 0)
  const linkClicks = items.reduce((s, r) => s + r.linkClicks, 0)
  const lpv = items.reduce((s, r) => s + r.lpv, 0)
  const engagements = items.reduce((s, r) => s + r.engagements, 0)
  return {
    spend,
    impressions,
    reach,
    linkClicks,
    lpv,
    engagements,
    // Derived metrics are recomputed from the sums, never summed.
    // CTR/CPC use link clicks to stay consistent with the Link Clicks column.
    frequency: reach ? +(impressions / reach).toFixed(1) : 0,
    ctr: impressions ? +((linkClicks / impressions) * 100).toFixed(1) : 0,
    cpc: linkClicks ? +(spend / linkClicks).toFixed(2) : 0,
    costPerLpv: lpv ? Math.round(spend / lpv) : 0,
    shareOfSpend: grandTotalSpend ? +((spend / grandTotalSpend) * 100).toFixed(1) : 0,
  }
}

export function buildCreativeTree(rows: Record<string, string>[]): CampaignNode[] {
  const ads = transformCreative(rows)
  const grandTotalSpend = ads.reduce((s, r) => s + r.spend, 0)

  // Group by campaign, then ad set (Map preserves insertion order).
  const byCampaign = new Map<string, Map<string, CreativeRow[]>>()
  for (const ad of ads) {
    const campKey = ad.campaign || '—'
    const setKey = ad.adSet || '—'
    if (!byCampaign.has(campKey)) byCampaign.set(campKey, new Map())
    const sets = byCampaign.get(campKey)!
    if (!sets.has(setKey)) sets.set(setKey, [])
    sets.get(setKey)!.push(ad)
  }

  const campaigns: CampaignNode[] = []
  for (const [campName, sets] of byCampaign) {
    const adSets: AdSetNode[] = []
    for (const [setName, setAds] of sets) {
      adSets.push({ name: setName, ...aggregate(setAds, grandTotalSpend), ads: setAds })
    }
    const allAds = adSets.flatMap((s) => s.ads)
    campaigns.push({ name: campName, ...aggregate(allAds, grandTotalSpend), adSets })
  }

  // Default ordering: spend desc at every level (the client re-sorts on demand).
  campaigns.sort((a, b) => b.spend - a.spend)
  for (const c of campaigns) {
    c.adSets.sort((a, b) => b.spend - a.spend)
    for (const s of c.adSets) s.ads.sort((a, b) => b.spend - a.spend)
  }
  return campaigns
}

export function creativeGrandTotals(campaigns: CampaignNode[]): CreativeMetrics {
  const grandSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  return aggregate(campaigns, grandSpend)
}
```

- [ ] **Step 5: Replace `getCreativeRows` with `getCreativeTree`**

In `lib/meta/creative.ts`, replace the entire `getCreativeRows` function with:

```typescript
export async function getCreativeTree(
  slug: string,
  dateRange: string,
): Promise<CampaignNode[]> {
  const rows = await metaQuery(slug, [
    'ad_name',
    'adcampaign_name',
    'adset_name',
    'adstatus',
    'cost',
    'impressions',
    'reach',
    'Frequency',
    'inline_link_clicks',
    'CTR',
    'CPC',
    'landing_page_views',
    'cost_per_landing_page_view',
    'action_post_engagement',
  ], dateRange, { maxRows: 200 })
  return buildCreativeTree(rows)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `DATABASE_URL=postgres://x:x@localhost/x node_modules/.bin/tsx lib/meta/creative.test.ts`
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add lib/meta/creative.ts lib/meta/creative.test.ts
git commit -m "feat(meta-ads): build campaign/ad set/ad tree with aggregation"
```

---

### Task 3: Client table component

**Depends on:** Task 1. **Parallel with:** Task 2.

**Files:**
- Create: `components/report-sections/meta-ads/creative-table-client.tsx`

**Interfaces:**
- Consumes (from Task 1): `CampaignNode`, `AdSetNode`, `CreativeRow`, `CreativeMetrics`.
- Consumes (existing): `usd`, `num`, `pct` from `@/lib/supermetrics/format`.
- Produces (consumed by Task 4): `CreativeTableClient({ campaigns, totals }: { campaigns: CampaignNode[]; totals: CreativeMetrics })` — default export NOT used; named export.

This is a presentational client component. There is no component-test harness in this repo (tests are node assert scripts for pure logic), so verification is `tsc` + manual. The complex pure logic (tree build) is already tested in Task 2.

- [ ] **Step 1: Create the client component**

Create `components/report-sections/meta-ads/creative-table-client.tsx` with:

```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { CampaignNode, AdSetNode, CreativeRow, CreativeMetrics } from '@/lib/meta/types'

type MetricKey =
  | 'spend' | 'impressions' | 'reach' | 'frequency' | 'linkClicks'
  | 'ctr' | 'cpc' | 'lpv' | 'costPerLpv' | 'engagements' | 'shareOfSpend'

interface Col {
  key: MetricKey
  label: string
  fmt: (n: number) => string
  tooltip?: string
}

const usd2 = (n: number) => '$' + n.toFixed(2)
const freq = (n: number) => n.toFixed(1) + 'x'

const COLS: Col[] = [
  { key: 'spend', label: 'Spend', fmt: usd },
  { key: 'impressions', label: 'Impressions', fmt: num },
  { key: 'reach', label: 'Reach', fmt: num },
  {
    key: 'frequency',
    label: 'Frequency',
    fmt: freq,
    tooltip:
      'At campaign and ad set level, frequency sums reach across ad sets and may double-count users reached in more than one ad set.',
  },
  { key: 'linkClicks', label: 'Link Clicks', fmt: num },
  { key: 'ctr', label: 'CTR', fmt: pct },
  { key: 'cpc', label: 'CPC', fmt: usd2 },
  { key: 'lpv', label: 'LPV', fmt: num },
  { key: 'costPerLpv', label: 'Cost / LPV', fmt: usd },
  { key: 'engagements', label: 'Engagements', fmt: num },
  { key: 'shareOfSpend', label: 'Share of Spend', fmt: pct },
]

type SortKey = MetricKey | 'name'

function sortItems<T extends CreativeMetrics & { name?: string; ad?: string }>(
  items: T[],
  key: SortKey,
  dir: 'asc' | 'desc',
): T[] {
  const sorted = [...items].sort((a, b) => {
    const av = key === 'name' ? (a.name ?? a.ad ?? '') : (a[key] as number)
    const bv = key === 'name' ? (b.name ?? b.ad ?? '') : (b[key] as number)
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function CreativeTableClient({
  campaigns,
  totals,
}: {
  campaigns: CampaignNode[]
  totals: CreativeMetrics
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' })
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set())
  const [openAdSets, setOpenAdSets] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  const onSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const sortedCampaigns = sortItems(campaigns, sort.key, sort.dir)

  const indent = (depth: number) => ({ paddingLeft: 20 + depth * 22 })

  const metricCells = (m: CreativeMetrics) =>
    COLS.map((c) => (
      <td key={c.key} className="px-5 py-3 text-right text-white">
        {c.fmt(m[c.key])}
      </td>
    ))

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th
              onClick={() => onSort('name')}
              className="cursor-pointer select-none px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white"
            >
              Name{sort.key === 'name' ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className="cursor-pointer select-none px-5 py-3 text-right text-[11px] font-extrabold uppercase tracking-widest text-text-muted hover:text-white"
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.tooltip && (
                    <span className="group relative inline-flex flex-shrink-0">
                      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
                        ?
                      </span>
                      <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-56 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                        {c.tooltip}
                      </span>
                    </span>
                  )}
                  {sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                </span>
              </th>
            ))}
            <th className="px-5 py-3 text-left text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCampaigns.map((camp) => {
            const campOpen = openCampaigns.has(camp.name)
            const adSets = sortItems(camp.adSets, sort.key, sort.dir)
            return (
              <CampaignRows
                key={camp.name}
                camp={camp}
                campOpen={campOpen}
                adSets={adSets}
                openAdSets={openAdSets}
                sort={sort}
                indent={indent}
                metricCells={metricCells}
                onToggleCampaign={() => setOpenCampaigns((s) => toggle(s, camp.name))}
                onToggleAdSet={(setKey: string) => setOpenAdSets((s) => toggle(s, setKey))}
              />
            )
          })}
          <tr className="border-t border-white/[0.12] font-semibold">
            <td className="px-5 py-3 text-left text-white" style={indent(0)}>
              {`Total (${campaigns.length} ${campaigns.length === 1 ? 'Campaign' : 'Campaigns'})`}
            </td>
            {metricCells(totals)}
            <td className="px-5 py-3 text-left text-white" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return <span className="inline-block w-4 text-text-muted">{open ? '▾' : '▸'}</span>
}

function CampaignRows({
  camp,
  campOpen,
  adSets,
  openAdSets,
  sort,
  indent,
  metricCells,
  onToggleCampaign,
  onToggleAdSet,
}: {
  camp: CampaignNode
  campOpen: boolean
  adSets: AdSetNode[]
  openAdSets: Set<string>
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: CreativeMetrics) => ReactNode
  onToggleCampaign: () => void
  onToggleAdSet: (setKey: string) => void
}) {
  return (
    <>
      <tr
        onClick={onToggleCampaign}
        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white" style={indent(0)}>
          <Chevron open={campOpen} /> {camp.name}
        </td>
        {metricCells(camp)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {campOpen &&
        adSets.map((set) => {
          const setKey = `${camp.name}||${set.name}`
          const setOpen = openAdSets.has(setKey)
          const ads = sortItems(set.ads, sort.key, sort.dir)
          return (
            <AdSetRows
              key={setKey}
              set={set}
              setOpen={setOpen}
              ads={ads}
              indent={indent}
              metricCells={metricCells}
              onToggle={() => onToggleAdSet(setKey)}
            />
          )
        })}
    </>
  )
}

function AdSetRows({
  set,
  setOpen,
  ads,
  indent,
  metricCells,
  onToggle,
}: {
  set: AdSetNode
  setOpen: boolean
  ads: CreativeRow[]
  indent: (depth: number) => { paddingLeft: number }
  metricCells: (m: CreativeMetrics) => ReactNode
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/[0.04] bg-white/[0.015] transition-colors hover:bg-bg-subtle/50"
      >
        <td className="px-5 py-3 text-left text-white/90" style={indent(1)}>
          <Chevron open={setOpen} /> {set.name}
        </td>
        {metricCells(set)}
        <td className="px-5 py-3 text-left text-white" />
      </tr>
      {setOpen &&
        ads.map((ad) => (
          <tr key={ad.ad} className="border-b border-white/[0.04] bg-white/[0.03]">
            <td className="px-5 py-3 text-left text-white/80" style={indent(2)}>
              {ad.ad}
            </td>
            {metricCells(ad)}
            <td className="px-5 py-3 text-left text-white/80">{ad.status}</td>
          </tr>
        ))}
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors introduced by this file. (Errors may still exist in `creative-table.tsx`/`index.tsx` until Task 4; those are unrelated to this component.)

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/meta-ads/creative-table-client.tsx
git commit -m "feat(meta-ads): add expandable tree table client component"
```

---

### Task 4: Server wrapper + wiring

**Depends on:** Task 2 AND Task 3.

**Files:**
- Modify (rewrite): `components/report-sections/meta-ads/creative-table.tsx`
- Modify: `components/report-sections/meta-ads/index.tsx`

**Interfaces:**
- Consumes (from Task 2): `getCreativeTree`, `creativeGrandTotals`.
- Consumes (from Task 3): `CreativeTableClient`.
- Consumes (from Task 1): `CampaignNode`.

- [ ] **Step 1: Rewrite the server wrapper**

Replace the entire contents of `components/report-sections/meta-ads/creative-table.tsx` with:

```tsx
import { creativeGrandTotals } from '@/lib/meta/creative'
import type { CampaignNode } from '@/lib/meta/types'
import { CreativeTableClient } from './creative-table-client'

export function CreativeTable({ campaigns }: { campaigns: CampaignNode[] }) {
  const totals = creativeGrandTotals(campaigns)
  return <CreativeTableClient campaigns={campaigns} totals={totals} />
}
```

- [ ] **Step 2: Update `index.tsx` to fetch the tree**

In `components/report-sections/meta-ads/index.tsx`:

(a) Replace the import on line 2:

```typescript
import { getCreativeTree } from '@/lib/meta/creative'
```

(b) Replace the creative fetch line (currently `safe(getCreativeRows(clientSlug, dateRange))`):

```typescript
    safe(getCreativeTree(clientSlug, dateRange)),
```

(c) Replace the creative render line (currently `<CreativeTable rows={creative.data} />`):

```tsx
      {creative.data ? <CreativeTable campaigns={creative.data} /> : <Fallback kind={creative.error!} />}
```

- [ ] **Step 3: Typecheck the whole project**

Run: `node_modules/.bin/tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: Re-run the data-layer test**

Run: `DATABASE_URL=postgres://x:x@localhost/x node_modules/.bin/tsx lib/meta/creative.test.ts`
Expected: `ok`

- [ ] **Step 5: Manual verification on localhost**

Ensure the dev server is running (`npm run dev`; note the port — 3000 or fallback like 3003). Log in via the login page's "Preview Access" button, then open `/dashboard/renaissance/reports/meta-ads`. Confirm:
- Only campaign rows show initially, sorted by Spend desc.
- Clicking a campaign reveals indented ad-set rows; clicking an ad set reveals indented ad rows.
- Ad rows show the Status value; campaign/ad-set rows have a blank Status.
- Clicking a column header re-sorts within every group while preserving the hierarchy.
- The Frequency header shows a "?" tooltip with the double-count disclaimer on hover.
- The totals row at the bottom matches the previous grand totals.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/meta-ads/creative-table.tsx components/report-sections/meta-ads/index.tsx
git commit -m "feat(meta-ads): wire expandable tree table into report"
```

---

## Notes / Accepted Trade-offs

- **CTR/CPC at parent levels** are recomputed as link-clicks-based (`linkClicks / impressions`, `spend / linkClicks`) to stay consistent with the Link Clicks column. A single-ad ad set's recomputed CTR may differ slightly from that ad's Meta `CTR` field — accepted and minor.
- **Frequency at parent levels** sums reach (double-counts cross-ad-set reach). Accepted; surfaced via the column-header tooltip disclaimer.
- **Status** is blank on campaign/ad-set rows by design (aggregated status would be misleading; the app is read-only).
</content>
