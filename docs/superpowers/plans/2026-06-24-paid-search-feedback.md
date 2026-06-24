# Paid Search Tab Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace search terms with top keywords, add a Region→DMA drill-down to the geo section, add a custom date range with always-visible resolved dates to the shared date picker, and fix the `last_N_days` window so dashboard Google Ads numbers match the Google Ads UI.

**Architecture:** Four mostly-independent workstreams over the paid-search report (`lib/paid-search/*` + `components/report-sections/paid-search/*`) plus one shared, client-safe date module (`lib/date-range.ts`) that becomes the single source of truth for date-range resolution (fixing the window bug once, globally) and feeds the picker's resolved-date display.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript (strict), Supermetrics enterprise API (`ds_id = AW`), shadcn/ui + Tremol, Recharts, date-fns. Tests are standalone `node:assert` scripts run with `npx tsx <file>` (they print `ok`); there is no test runner or `test` npm script. Component-level tests are not part of the repo convention — only pure transforms are unit-tested.

## Global Constraints

- All Supermetrics calls are server-side only; never import `lib/paid-search/*` data fetchers into a Client Component.
- `ds_id` values come from `lib/supermetrics/constants.ts` (`DS_IDS.GOOGLE_ADS = 'AW'`); never hardcode.
- Supermetrics field IDs (verified via `field_discovery` for `AW`): keyword text = `Keyword`, match type = `Matchtype`, DMA/metro = `Metroarea`, region = `Region`, conversions = `Conversions`, conversion type = `ConversionTypeName`, metrics = `Clicks`, `Impressions`, `Cost`. `smQuery` auto-resolves the Supermetrics report type from the field set — no explicit `report_type` needed (the keyword fields resolve to KeywordView; the geo fields resolve to GeographicView).
- Tests: each `*.test.ts` is a standalone script importing `{ strict as assert } from 'node:assert'`, ending with `console.log('ok')`. Run with `npx tsx <path>`; success = prints `ok` and exits 0.
- Type/compile check command: `npx tsc --noEmit`. Lint: `npm run lint`.
- Commit after each task. Work on branch `feat/paid-search-feedback` (already created).
- `lib/date-range.ts` MUST NOT import anything server-only (no DB, no `@google-analytics/data`). Only `date-fns` is allowed. It is imported by a Client Component.

---

## Interconnected Components & Parallelization

This plan is written so a parallel agent fleet can pick up tasks with minimal collisions. Key facts:

**Shared files (collision points):**
- `lib/paid-search/types.ts` — **Only Task 1 (adds) and Task 9 (removes) edit this file**, and they are in different waves. Tasks 3–6 never touch it. This is what keeps the keyword and geo streams collision-free in the same wave.
- `components/report-sections/paid-search/index.tsx` — **Only Task 4 edits this file.** Task 6 (geo) deliberately preserves the `getGeoRows` and `GeoSection` names/imports so the geo data-shape change flows through `index.tsx` without an edit there.
- `lib/ga4/client.ts` — **Only Task 2 edits this file** (delegates `parseDateRange` to the new module; removes orphaned private helpers). 14 files import `parseDateRange`/`deriveCompareRange` from `@/lib/ga4/client`; Task 2 keeps that import path working via re-export, so none of them change.

**Dependency graph:**

| Task | Depends on | Can start after |
|---|---|---|
| 1. Types prep (`types.ts`) | — | immediately |
| 2. Date module + window fix | — | immediately (independent of Task 1) |
| 3. Keywords lib + test | Task 1 | Task 1 done |
| 4. Keywords component + wire-in | Task 3 | Task 3 done |
| 5. Geo DMA lib + test | Task 1 | Task 1 done |
| 6. Geo DMA component | Task 5 | Task 5 done |
| 7. Date picker custom range + resolved dates | Task 2 | Task 2 done |
| 8. Verify discrepancy fix (manual) | Tasks 2–7 merged | end (run by controller/human) |
| 9. Types cleanup (`types.ts`) | Tasks 3–6 | Tasks 4 & 6 done |

**Parallel waves:**
- **Wave 1 (parallel):** Task 1, Task 2.
- **Wave 2 (parallel):** Task 3, Task 5, Task 7 (3 & 5 need Task 1; 7 needs Task 2).
- **Wave 3 (parallel):** Task 4 (needs 3), Task 6 (needs 5).
- **Wave 4 (serial):** Task 9 (types cleanup, after 4 & 6).
- **Final:** Task 8 verification — run by the controller/human against live data, not a dispatched implementer (needs Google Ads UI access + client slug).

No two tasks in the same wave write the same file.

---

## Task 1: Types prep

**Files:**
- Modify: `lib/paid-search/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `KeywordRow`, `GeoDma`, `GeoRegion` interfaces consumed by Tasks 3–6.

- [ ] **Step 1: Add the new interfaces**

Add these three interfaces to `lib/paid-search/types.ts` (leave the existing `SearchTermRow` and `GeoRow` in place for now — Task 9 removes them in a final cleanup, so `types.ts` is only ever edited by Task 1 and Task 9):

```typescript
export interface KeywordRow { keyword: string; matchType: string; clicks: number; impressions: number; ctr: number; cost: number; leads: number; cpl: number }
export interface GeoDma { dma: string; clicks: number; cost: number; leads: number }
export interface GeoRegion { region: string; clicks: number; cost: number; leads: number; dmas: GeoDma[] }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes (no new errors).

- [ ] **Step 3: Commit**

```bash
git add lib/paid-search/types.ts
git commit -m "feat(paid-search): add KeywordRow, GeoDma, GeoRegion types"
```

---

## Task 2: Date module + global `last_N_days` window fix

**Files:**
- Create: `lib/date-range.ts`
- Create: `lib/date-range.test.ts`
- Modify: `lib/ga4/client.ts` (delegate `parseDateRange`; remove orphaned private helpers)

**Interfaces:**
- Consumes: nothing (only `date-fns`).
- Produces: `resolveDateRange(dateRange: string): { startDate: string; endDate: string }` and `formatResolvedRange(dateRange: string): string`, consumed by Task 7. `parseDateRange` keeps its existing signature and import path (`@/lib/ga4/client`) via re-export.

- [ ] **Step 1: Write the failing test**

Create `lib/date-range.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { resolveDateRange } from './date-range'

// last_N_days: exactly N days, ending YESTERDAY (Google Ads convention).
{
  const { startDate, endDate } = resolveDateRange('last_14_days')
  const s = new Date(`${startDate}T00:00:00`), e = new Date(`${endDate}T00:00:00`)
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  assert.equal(days, 14)
  const yesterday = new Date(); yesterday.setHours(0, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1)
  assert.equal(endDate, yesterday.toISOString().slice(0, 10))
}

// custom passthrough
{
  const r = resolveDateRange('custom:2026-01-01,2026-01-31')
  assert.equal(r.startDate, '2026-01-01')
  assert.equal(r.endDate, '2026-01-31')
}

// period-to-date presets start on the 1st (and still run through today)
{
  const r = resolveDateRange('this_month')
  assert.ok(/^\d{4}-\d{2}-01$/.test(r.startDate))
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/date-range.test.ts`
Expected: FAIL — `Cannot find module './date-range'`.

- [ ] **Step 3: Create the date module**

Create `lib/date-range.ts` (helpers copied verbatim from the current `lib/ga4/client.ts`; the `last_N_days` branch carries the fix):

```typescript
// Pure, client-safe date-range resolution. Single source of truth for turning
// a date-range string (preset or `custom:`) into ISO start/end dates. Imported
// by server query builders (via lib/ga4/client re-export) AND by the client
// date picker, so it must stay free of server-only deps (only date-fns).
import { format } from 'date-fns'

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function _startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday-based
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}
function _endOfWeek(d: Date): Date {
  const s = _startOfWeek(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  return e
}
function _startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function _endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function _startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}
function _endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3 + 3, 0)
}

/**
 * Resolve any date-range preset or custom string to ISO date strings.
 * Always returns { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }.
 */
export function resolveDateRange(dateRange: string): { startDate: string; endDate: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (dateRange.startsWith('custom:')) {
    const [s, e] = dateRange.replace('custom:', '').split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  if (dateRange.includes(',')) {
    const [s, e] = dateRange.split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  const match = dateRange.match(/last_(\d+)_days/)
  if (match) {
    const days = parseInt(match[1])
    // Match Google Ads "Last N days": exactly N days ending YESTERDAY, so
    // today's partial (intraday) data is excluded. The previous behavior
    // returned N+1 days INCLUDING today, which made dashboard cost/clicks
    // disagree with the Google Ads UI for the same nominal range.
    const end = new Date(today); end.setDate(today.getDate() - 1)
    const start = new Date(today); start.setDate(today.getDate() - days)
    return { startDate: toISO(start), endDate: toISO(end) }
  }

  switch (dateRange) {
    case 'this_week':
      return { startDate: toISO(_startOfWeek(today)), endDate: toISO(today) }
    case 'last_week': {
      const prev = new Date(today); prev.setDate(today.getDate() - 7)
      return { startDate: toISO(_startOfWeek(prev)), endDate: toISO(_endOfWeek(prev)) }
    }
    case 'this_month':
      return { startDate: toISO(_startOfMonth(today)), endDate: toISO(today) }
    case 'last_month': {
      const lastM = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { startDate: toISO(_startOfMonth(lastM)), endDate: toISO(_endOfMonth(lastM)) }
    }
    case 'this_quarter':
      return { startDate: toISO(_startOfQuarter(today)), endDate: toISO(today) }
    case 'last_quarter': {
      const lq = new Date(today); lq.setMonth(today.getMonth() - 3)
      return { startDate: toISO(_startOfQuarter(lq)), endDate: toISO(_endOfQuarter(lq)) }
    }
    case 'this_year':
    case 'year_to_date':
      return { startDate: `${today.getFullYear()}-01-01`, endDate: toISO(today) }
    case 'last_year': {
      const ly = today.getFullYear() - 1
      return { startDate: `${ly}-01-01`, endDate: `${ly}-12-31` }
    }
    default: {
      const start = new Date(today); start.setDate(today.getDate() - 30)
      const end = new Date(today); end.setDate(today.getDate() - 1)
      return { startDate: toISO(start), endDate: toISO(end) }
    }
  }
}

/**
 * Human-readable resolved range for display, e.g. "Jun 10 – Jun 23, 2026".
 * Parsed as local time (T00:00:00) so the label can't drift a day in
 * negative-UTC timezones.
 */
export function formatResolvedRange(dateRange: string): string {
  const { startDate, endDate } = resolveDateRange(dateRange)
  const s = new Date(`${startDate}T00:00:00`)
  const e = new Date(`${endDate}T00:00:00`)
  return s.getFullYear() === e.getFullYear()
    ? `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    : `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
}
```

Note: the `default` branch (unknown range ≈ `last_30_days`) now also ends yesterday, staying consistent with the `last_N_days` fix.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/date-range.test.ts`
Expected: PASS — prints `ok`.

- [ ] **Step 5: Delegate `parseDateRange` from `lib/ga4/client.ts` and remove orphaned helpers**

In `lib/ga4/client.ts`:

1. Add this import near the top (after the existing imports):

```typescript
import { resolveDateRange } from '@/lib/date-range'
```

2. Replace the entire `parseDateRange` function body (the `export function parseDateRange(...) { ... }` block) with this delegation:

```typescript
export function parseDateRange(dateRange: string): { startDate: string; endDate: string } {
  return resolveDateRange(dateRange)
}
```

3. Delete the now-orphaned private helpers `_startOfWeek`, `_endOfWeek`, `_startOfMonth`, `_endOfMonth`, `_startOfQuarter`, `_endOfQuarter` (they were only used by the old `parseDateRange` body and now live in `lib/date-range.ts`). **Keep `toISO`** — it is still used elsewhere in the file (including by `deriveCompareRange`). **Keep `deriveCompareRange` unchanged** — it calls the delegating `parseDateRange` and the local `toISO`.

- [ ] **Step 6: Verify no orphans and the file still compiles**

Run: `grep -n "_startOfWeek\|_endOfWeek\|_startOfMonth\|_endOfMonth\|_startOfQuarter\|_endOfQuarter" lib/ga4/client.ts`
Expected: no matches (all removed).

Run: `grep -c "toISO" lib/ga4/client.ts`
Expected: > 0 (toISO still present and used).

Run: `npx tsc --noEmit && npm run lint`
Expected: passes with no unused-variable errors in `lib/ga4/client.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/date-range.ts lib/date-range.test.ts lib/ga4/client.ts
git commit -m "fix(date-range): last_N_days ends yesterday; extract client-safe resolver

last_N_days previously returned N+1 days including today's partial data,
causing dashboard Google Ads cost/clicks to disagree with the Google Ads
UI. Resolution logic moves to lib/date-range.ts (single source of truth,
client-safe) and parseDateRange re-exports it so all 14 callers are
unaffected."
```

---

## Task 3: Keywords data layer

**Files:**
- Create: `lib/paid-search/keywords.ts` (via `git mv` from `search-terms.ts`)
- Create: `lib/paid-search/keywords.test.ts` (via `git mv` from `search-terms.test.ts`)
- Modify: `lib/paid-search/types.ts` — remove the now-unused `SearchTermRow` (cleanup of this task's orphan)

**Interfaces:**
- Consumes: `KeywordRow` (Task 1); `awQuery`, `isLeadAction` from `./base`.
- Produces: `transformKeywords(metricRows, leadRows, cfg): KeywordRow[]` and `getKeywordRows(slug, dateRange): Promise<KeywordRow[]>`, consumed by Task 4.

- [ ] **Step 1: Rename the files via git**

```bash
git mv lib/paid-search/search-terms.ts lib/paid-search/keywords.ts
git mv lib/paid-search/search-terms.test.ts lib/paid-search/keywords.test.ts
```

- [ ] **Step 2: Write the failing test**

Replace the contents of `lib/paid-search/keywords.test.ts` with:

```typescript
import { strict as assert } from 'node:assert'
import { transformKeywords } from './keywords'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  Clicks: '80', Impressions: '1000', Cost: '300' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', Clicks: '40', Impressions: '500',  Cost: '500' },
  { Keyword: 'no leads kw',      Matchtype: 'Broad',  Clicks: '10', Impressions: '200',  Cost: '90'  },
]
const leads = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'broker_group_lead', Conversions: '3' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'ignored_action',    Conversions: '9' },
]
const rows = transformKeywords(metrics, leads, cfg)

assert.equal(rows[0].keyword, 'broker benefits') // 3 leads ranks first
assert.equal(rows[0].matchType, 'Phrase')
assert.equal(rows[0].leads, 3)                    // 'ignored_action' excluded
assert.equal(rows[1].keyword, 'dental insurance') // 2 leads
assert.equal(rows[1].ctr, 8)                       // 80/1000 = 8%
assert.equal(rows[2].leads, 0)                     // no qualified leads

console.log('ok')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx lib/paid-search/keywords.test.ts`
Expected: FAIL — `transformKeywords` is not exported (file still has `transformSearchTerms`).

- [ ] **Step 4: Implement keywords.ts**

Replace the contents of `lib/paid-search/keywords.ts` with:

```typescript
import { awQuery, isLeadAction } from './base'
import type { KeywordRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformKeywords(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): KeywordRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = `${r.Keyword}␟${r.Matchtype}`
    leads.set(k, (leads.get(k) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): KeywordRow => {
      const clicks = Number(r.Clicks || 0), impressions = Number(r.Impressions || 0), cost = Number(r.Cost || 0)
      const l = leads.get(`${r.Keyword}␟${r.Matchtype}`) ?? 0
      return { keyword: r.Keyword, matchType: r.Matchtype, clicks, impressions, cost, leads: l, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, cpl: l ? Math.round(cost / l) : 0 }
    })
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getKeywordRows(slug: string, dateRange: string): Promise<KeywordRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Keyword', 'Matchtype', 'Clicks', 'Impressions', 'Cost'], dateRange),
    awQuery(slug, ['Keyword', 'Matchtype', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  // Surface the TOP keywords (sorted leads→cost desc), not the long tail.
  return transformKeywords(m, l, cfg).slice(0, 50)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx lib/paid-search/keywords.test.ts`
Expected: PASS — prints `ok`.

Do NOT touch `lib/paid-search/types.ts` here — the now-unused `SearchTermRow` interface is removed later in Task 9 (final cleanup), so `types.ts` stays owned by Task 1 only and this task never collides with Task 5 in the same wave.

- [ ] **Step 6: Commit**

```bash
git add lib/paid-search/keywords.ts lib/paid-search/keywords.test.ts
git commit -m "feat(paid-search): keyword data layer (replaces search terms)"
```

---

## Task 4: Keywords component + report wire-in

**Files:**
- Create: `components/report-sections/paid-search/keywords.tsx` (via `git mv` from `search-terms.tsx`)
- Modify: `components/report-sections/paid-search/index.tsx`

**Interfaces:**
- Consumes: `getKeywordRows` (Task 3), `KeywordRow` (Task 1), `DataTable` from `@/components/charts/data-table`, `usd/pct/num` from `@/lib/paid-search/base`.
- Produces: `KeywordsTable({ rows: KeywordRow[] })`.

- [ ] **Step 1: Rename the component file via git**

```bash
git mv components/report-sections/paid-search/search-terms.tsx components/report-sections/paid-search/keywords.tsx
```

- [ ] **Step 2: Implement KeywordsTable**

Replace the contents of `components/report-sections/paid-search/keywords.tsx` with:

```tsx
import { DataTable } from '@/components/charts/data-table'
import { usd, pct, num } from '@/lib/paid-search/base'
import type { KeywordRow } from '@/lib/paid-search/types'

const COLUMNS = [
  { key: 'keyword', label: 'Keyword', align: 'left' as const },
  { key: 'matchType', label: 'Match Type', align: 'left' as const },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'cpl', label: 'CPL', align: 'right' as const, sortable: true, sortKey: '_cpl' },
]

export function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
  const tableRows = rows.map((r) => ({
    keyword: r.keyword,
    matchType: r.matchType,
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: pct(r.ctr),
    cost: usd(r.cost),
    leads: num(r.leads),
    cpl: usd(r.cpl),
    // raw numeric values for sort — prefixed with _ to avoid column key collision
    _clicks: r.clicks,
    _impressions: r.impressions,
    _ctr: r.ctr,
    _cost: r.cost,
    _leads: r.leads,
    _cpl: r.cpl,
  }))

  return (
    <DataTable
      columns={COLUMNS}
      rows={tableRows}
      defaultSort={{ key: 'leads', dir: 'desc' }}
    />
  )
}
```

- [ ] **Step 3: Wire it into the report**

In `components/report-sections/paid-search/index.tsx` make exactly these replacements:

Replace the import line:
```tsx
import { getSearchTermRows } from '@/lib/paid-search/search-terms'
```
with:
```tsx
import { getKeywordRows } from '@/lib/paid-search/keywords'
```

Replace the import line:
```tsx
import { SearchTermsTable } from './search-terms'
```
with:
```tsx
import { KeywordsTable } from './keywords'
```

In the `Promise.all` destructuring, rename `terms` to `keywords`:
```tsx
  const [kpis, hero, campaigns, leads, geo, keywords] = await Promise.all([
```
and replace the corresponding fetch line:
```tsx
    safe(getSearchTermRows(clientSlug, dateRange)),
```
with:
```tsx
    safe(getKeywordRows(clientSlug, dateRange)),
```

Replace the render line:
```tsx
      {terms.data ? <SearchTermsTable rows={terms.data} /> : <Fallback kind={terms.error!} />}
```
with:
```tsx
      {keywords.data ? <KeywordsTable rows={keywords.data} /> : <Fallback kind={keywords.error!} />}
```

- [ ] **Step 4: Verify no stale references and it compiles**

Run: `grep -rn "search-terms\|SearchTerm\|getSearchTermRows" components/ lib/`
Expected: no matches.

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/paid-search/keywords.tsx components/report-sections/paid-search/index.tsx
git commit -m "feat(paid-search): top keywords table with match type"
```

---

## Task 5: Geo Region→DMA data layer

**Files:**
- Modify: `lib/paid-search/geo.ts`
- Modify: `lib/paid-search/geo.test.ts`
- Modify: `lib/paid-search/types.ts` — remove the now-unused `GeoRow` (cleanup of this task's orphan)

**Interfaces:**
- Consumes: `GeoRegion`, `GeoDma` (Task 1); `awQuery`, `isLeadAction` from `./base`.
- Produces: `transformGeo(metricRows, leadRows, cfg): GeoRegion[]` and `getGeoRows(slug, dateRange): Promise<GeoRegion[]>` (names preserved so `index.tsx` needs no edit). Consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Replace the contents of `lib/paid-search/geo.test.ts` with:

```typescript
import { strict as assert } from 'node:assert'
import { transformGeo } from './geo'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Region: 'Texas', Metroarea: 'Dallas-Ft. Worth TX', Clicks: '100', Cost: '400' },
  { Region: 'Texas', Metroarea: 'Houston TX',          Clicks: '60',  Cost: '250' },
  { Region: 'Ohio',  Metroarea: 'Columbus OH',         Clicks: '50',  Cost: '200' },
]
const leads = [
  { Region: 'Ohio',  Metroarea: 'Columbus OH',         ConversionTypeName: 'broker_group_lead', Conversions: '5' },
  { Region: 'Texas', Metroarea: 'Dallas-Ft. Worth TX', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Region: 'Texas', Metroarea: 'Houston TX',          ConversionTypeName: 'broker_group_lead', Conversions: '1' },
]
const rows = transformGeo(metrics, leads, cfg)

assert.equal(rows[0].region, 'Ohio')   // 5 leads ranks first
assert.equal(rows[0].leads, 5)
assert.equal(rows[1].region, 'Texas')  // 2 + 1 = 3 leads
assert.equal(rows[1].leads, 3)
assert.equal(rows[1].clicks, 160)      // region totals aggregate its DMAs
assert.equal(rows[1].dmas.length, 2)
assert.equal(rows[1].dmas[0].dma, 'Dallas-Ft. Worth TX') // 2 leads ranks first within region

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/paid-search/geo.test.ts`
Expected: FAIL — `rows[0].dmas` is undefined (old `transformGeo` returns flat `GeoRow[]`).

- [ ] **Step 3: Implement the nested transform**

Replace the contents of `lib/paid-search/geo.ts` with:

```typescript
import { awQuery, isLeadAction } from './base'
import type { GeoRegion } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformGeo(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): GeoRegion[] {
  const leads = new Map<string, number>() // key: region␟dma
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = `${r.Region}␟${r.Metroarea}`
    leads.set(k, (leads.get(k) ?? 0) + Number(r.Conversions || 0))
  }

  const regions = new Map<string, GeoRegion>()
  for (const r of metricRows) {
    const region = r.Region || 'Unknown'
    const dma = r.Metroarea || '—'
    const clicks = Number(r.Clicks || 0), cost = Number(r.Cost || 0)
    const l = leads.get(`${r.Region}␟${r.Metroarea}`) ?? 0
    let reg = regions.get(region)
    if (!reg) { reg = { region, clicks: 0, cost: 0, leads: 0, dmas: [] }; regions.set(region, reg) }
    reg.clicks += clicks; reg.cost += cost; reg.leads += l
    reg.dmas.push({ dma, clicks, cost, leads: l })
  }

  const out = [...regions.values()]
  for (const reg of out) reg.dmas.sort((a, b) => b.leads - a.leads || b.cost - a.cost)
  return out.sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getGeoRows(slug: string, dateRange: string): Promise<GeoRegion[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Region', 'Metroarea', 'Clicks', 'Cost'], dateRange),
    awQuery(slug, ['Region', 'Metroarea', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformGeo(m, l, cfg)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/paid-search/geo.test.ts`
Expected: PASS — prints `ok`.

Do NOT touch `lib/paid-search/types.ts` here — the now-unused `GeoRow` interface is removed later in Task 9 (final cleanup), so `types.ts` stays owned by Task 1 only and this task never collides with Task 3 in the same wave.

- [ ] **Step 5: Commit**

```bash
git add lib/paid-search/geo.ts lib/paid-search/geo.test.ts
git commit -m "feat(paid-search): nest geo data as region -> DMA breakdown"
```

---

## Task 6: Geo section with Region→DMA drill-down

**Files:**
- Modify: `components/report-sections/paid-search/geo-section.tsx` (becomes a Client Component)

**Interfaces:**
- Consumes: `GeoRegion`, `GeoDma` (Task 1); `BarChart`, `KpiCard`, `CHART_COLORS`, `usd`, `num`.
- Produces: `GeoSection({ rows: GeoRegion[] })` (name preserved; `index.tsx` unchanged).

- [ ] **Step 1: Implement the expandable section**

Replace the contents of `components/report-sections/paid-search/geo-section.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import { usd, num } from '@/lib/paid-search/base'
import { cn } from '@/lib/utils'
import type { GeoRegion } from '@/lib/paid-search/types'

export function GeoSection({ rows }: { rows: GeoRegion[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const top10 = rows.slice(0, 10)

  const toggle = (region: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })

  const chartData = top10.map((r) => ({ region: r.region, leads: r.leads }))
  const yKeys = [{ key: 'leads', label: 'Leads', color: CHART_COLORS.googleAds }]
  const topRegion = top10[0] ?? null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard title="Top Region" value={topRegion?.region ?? '—'} />
        <KpiCard title="Leads (Top Region)" value={topRegion?.leads ?? 0} />
        <KpiCard title="Total Regions" value={rows.length} />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Leads
        </p>
        {top10.length > 0 ? (
          <BarChart data={chartData} xKey="region" yKeys={yKeys} height={320} />
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
            No geo data available for this period.
          </div>
        )}
      </div>

      {top10.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
            Region → DMA Breakdown
          </p>
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-2 text-left font-bold">Region / DMA</th>
                  <th className="px-4 py-2 text-right font-bold">Clicks</th>
                  <th className="px-4 py-2 text-right font-bold">Cost</th>
                  <th className="px-4 py-2 text-right font-bold">Leads</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r) => {
                  const isOpen = expanded.has(r.region)
                  return (
                    <FragmentRow
                      key={r.region}
                      region={r}
                      isOpen={isOpen}
                      onToggle={() => toggle(r.region)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentRow({
  region,
  isOpen,
  onToggle,
}: {
  region: GeoRegion
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
      >
        <td className="px-4 py-2.5 text-left font-medium text-white">
          <span className="inline-flex items-center gap-2">
            <ChevronRightIcon
              className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isOpen && 'rotate-90')}
            />
            {region.region}
            <span className="text-xs text-text-muted">({region.dmas.length} DMA{region.dmas.length === 1 ? '' : 's'})</span>
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-white/80">{num(region.clicks)}</td>
        <td className="px-4 py-2.5 text-right text-white/80">{usd(region.cost)}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-white">{num(region.leads)}</td>
      </tr>
      {isOpen &&
        region.dmas.map((dma) => (
          <tr key={`${region.region}-${dma.dma}`} className="border-b border-white/[0.03] bg-white/[0.015]">
            <td className="px-4 py-2 pl-11 text-left text-text-muted">{dma.dma}</td>
            <td className="px-4 py-2 text-right text-text-muted">{num(dma.clicks)}</td>
            <td className="px-4 py-2 text-right text-text-muted">{usd(dma.cost)}</td>
            <td className="px-4 py-2 text-right text-text-muted">{num(dma.leads)}</td>
          </tr>
        ))}
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles and no stale `GeoRow` references remain**

Run: `grep -rn "GeoRow" lib/ components/`
Expected: no matches.

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/paid-search/geo-section.tsx
git commit -m "feat(paid-search): region -> DMA drill-down in geo section"
```

---

## Task 7: Date picker — custom range + always-visible resolved dates

**Files:**
- Modify: `components/report-sections/ga4/date-picker.tsx`

**Interfaces:**
- Consumes: `resolveDateRange`, `formatResolvedRange` (Task 2); `Calendar` from `@/components/ui/calendar`; `format` from `date-fns`; `DateRange` from `react-day-picker`.
- Produces: enhanced `GA4DatePicker` (same props: `{ dateRange, compareRange }`).

This is shared by GA4, inbound-funnel, paid-media (paid search) and AEO (peec-ai) headers — all gain the custom range and resolved-date display.

- [ ] **Step 1: Replace the picker with the enhanced version**

Replace the entire contents of `components/report-sections/ga4/date-picker.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { resolveDateRange, formatResolvedRange } from '@/lib/date-range'

const DATE_PRESETS = [
  { value: 'last_7_days',  label: 'Last 7 Days'  },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_60_days', label: 'Last 60 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_month',   label: 'This Month'   },
  { value: 'last_month',   label: 'Last Month'   },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'last_year',    label: 'Last Year'    },
] as const

const COMPARE_PRESETS = [
  { value: null,               label: 'No Comparison'   },
  { value: 'previous_period',  label: 'Previous Period' },
  { value: 'previous_year',    label: 'Previous Year'   },
] as const

function getDateLabel(value: string): string {
  if (value.startsWith('custom:')) return 'Custom Range'
  return DATE_PRESETS.find((p) => p.value === value)?.label ?? value
}

function getCompareLabel(value: string | null): string | null {
  if (!value) return null
  return COMPARE_PRESETS.find((p) => p.value === value)?.label ?? null
}

function customToCalendarRange(value: string): DateRange | undefined {
  if (!value.startsWith('custom:')) return undefined
  const [s, e] = value.replace('custom:', '').split(',')
  if (s && e) return { from: new Date(`${s}T00:00:00`), to: new Date(`${e}T00:00:00`) }
  return undefined
}

interface GA4DatePickerProps {
  dateRange: string
  compareRange: string | null
}

export function GA4DatePicker({ dateRange, compareRange }: GA4DatePickerProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen]                     = useState(false)
  const [pendingDate, setPendingDate]       = useState(dateRange)
  const [pendingCompare, setPendingCompare] = useState<string | null>(compareRange)
  const [customOpen, setCustomOpen]         = useState(dateRange.startsWith('custom:'))
  const [pendingCalendar, setPendingCalendar] = useState<DateRange | undefined>(
    customToCalendarRange(dateRange),
  )

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPendingDate(dateRange)
      setPendingCompare(compareRange)
      setCustomOpen(dateRange.startsWith('custom:'))
      setPendingCalendar(customToCalendarRange(dateRange))
    }
    setOpen(next)
  }

  const handlePresetClick = (value: string) => {
    setCustomOpen(false)
    setPendingDate(value)
  }

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setPendingCalendar(range)
    if (range?.from && range?.to) {
      setPendingDate(`custom:${format(range.from, 'yyyy-MM-dd')},${format(range.to, 'yyyy-MM-dd')}`)
    }
  }

  const canApply = pendingDate.startsWith('custom:')
    ? !!(pendingCalendar?.from && pendingCalendar?.to)
    : !!pendingDate

  const handleApply = () => {
    if (!canApply) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', pendingDate)
    if (pendingCompare) params.set('compareRange', pendingCompare)
    else params.delete('compareRange')
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const dateLabel    = getDateLabel(dateRange)
  const compareLabel = getCompareLabel(compareRange)
  const resolved     = formatResolvedRange(dateRange)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button suppressHydrationWarning className="flex items-center gap-2 rounded-md border border-white/10 bg-bg-surface px-3.5 py-2 text-sm text-white transition-colors hover:border-white/25 hover:bg-white/[0.04]">
          <span className="flex flex-col items-start leading-tight">
            <span className="flex items-center gap-2">
              <span className="font-medium">{dateLabel}</span>
              {compareLabel && (
                <>
                  <span className="text-white/25">vs</span>
                  <span className="text-xs text-text-muted">{compareLabel}</span>
                </>
              )}
            </span>
            <span className="text-[11px] text-text-muted">{resolved}</span>
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto border-white/[0.08] bg-[#1a1a1a] p-0 shadow-2xl" align="end" sideOffset={8}>
        <div className="flex divide-x divide-white/[0.06]">
          {/* Date range column */}
          <div className="w-44 py-2">
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Date Range
            </p>
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                  !customOpen && pendingDate === preset.value ? 'font-semibold text-brand-cyan' : 'text-white/75',
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setCustomOpen(true)}
              className={cn(
                'mt-1 block w-full border-t border-white/[0.06] px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                customOpen ? 'font-semibold text-brand-cyan' : 'text-white/75',
              )}
            >
              Custom Range
            </button>
          </div>

          {/* Custom calendar column (only when Custom Range is active) */}
          {customOpen && (
            <div className="flex flex-col p-3">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                Custom Range
              </p>
              <Calendar
                mode="range"
                selected={pendingCalendar}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                showOutsideDays={false}
                className="!bg-transparent"
                classNames={{ today: 'text-white font-bold' }}
              />
              <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs text-text-muted">
                {pendingCalendar?.from && pendingCalendar?.to
                  ? `${format(pendingCalendar.from, 'MMM d, yyyy')} – ${format(pendingCalendar.to, 'MMM d, yyyy')}`
                  : 'Select start and end dates'}
              </p>
            </div>
          )}

          {/* Compare column */}
          <div className="flex w-44 flex-col py-2">
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Compare To
            </p>
            {COMPARE_PRESETS.map((opt) => (
              <button
                key={opt.value ?? 'none'}
                onClick={() => setPendingCompare(opt.value)}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                  pendingCompare === opt.value ? 'font-semibold text-brand-cyan' : 'text-white/75',
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className="mt-auto px-3 pb-2 pt-4">
              <button
                onClick={handleApply}
                disabled={!canApply}
                className="w-full rounded-full bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`, open a paid search report and an AEO report. Confirm: the picker trigger shows the resolved dates beneath the label (e.g. `Last 14 Days` / `Jun 10 – Jun 23, 2026`); a "Custom Range" option opens a calendar; selecting a range and clicking Apply updates the URL `dateRange=custom:...` and the data reloads.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/ga4/date-picker.tsx
git commit -m "feat(date-picker): custom range + always-visible resolved dates"
```

---

## Task 8: Verify the cost/clicks discrepancy is resolved

**Files:** none (verification task).

This task confirms Task 2's window fix makes the dashboard match the Google Ads UI, and triages any residual gap.

- [ ] **Step 1: Pick one explicit fixed window**

Choose a closed window with no "today" in it, e.g. `custom:2026-06-09,2026-06-22` (14 full days). Using an explicit custom range removes preset-interpretation differences from the comparison.

- [ ] **Step 2: Read the dashboard numbers**

With Task 2 + Task 7 merged, load the paid search report for the target client with that custom range. Record Cost, Clicks, Conversions from the KPI grid. Confirm the picker's resolved-date line reads `Jun 9 – Jun 22, 2026`.

- [ ] **Step 3: Read the Google Ads UI numbers**

In the Google Ads UI for the same account, set the date range to the identical explicit dates (Jun 9–22, 2026). Record Cost, Clicks, Conversions.

- [ ] **Step 4: Compare**

Expected: Cost, Clicks, and Conversions match within rounding (cost is rounded to whole dollars in the KPI grid via `Math.round`). Document the three pairs of numbers in the PR description.

- [ ] **Step 5: Triage any residual gap**

If numbers still diverge on an identical explicit window, the remaining suspect is timezone: `smQuery` sends `date_range_type: 'custom'` with bare `YYYY-MM-DD` strings, which Google Ads interprets in the **account's** timezone, while the dashboard computes dates in the **server's** timezone. To confirm, add `Timezone` (or `system_metadata.query_timezone`) to a one-off geo/KPI query and compare to the Google Ads account timezone. Do not implement a timezone fix in this plan — record findings and open a follow-up. (This was scoped out in the design.)

- [ ] **Step 6: No commit** (verification only). Capture results in the PR description.

---

## Task 9: Final types cleanup

**Files:**
- Modify: `lib/paid-search/types.ts`

**Interfaces:**
- Consumes: nothing. Runs only after Tasks 4 and 6 have removed every consumer of `SearchTermRow` and `GeoRow`.
- Produces: nothing.

- [ ] **Step 1: Remove the two now-unused interfaces**

In `lib/paid-search/types.ts`, delete these two lines:

```typescript
export interface SearchTermRow { term: string; clicks: number; impressions: number; ctr: number; cost: number; leads: number; cpl: number }
export interface GeoRow { region: string; leads: number; clicks: number; cost: number }
```

- [ ] **Step 2: Verify nothing references them and the project compiles**

Run: `grep -rn "SearchTermRow\|GeoRow" lib/ components/ app/`
Expected: no matches.

Run: `npx tsc --noEmit && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/paid-search/types.ts
git commit -m "chore(paid-search): remove unused SearchTermRow and GeoRow types"
```

---

## Self-Review

**Spec coverage:**
- Item 1 (search terms → top keywords, with match type): Tasks 1, 3, 4. ✓
- Item 2 (region → DMA drill-down): Tasks 1, 5, 6. ✓
- Item 3 (custom range + visible resolved dates, shared picker): Tasks 2, 7. ✓
- Item 4 (window fix, global) + verify: Tasks 2, 8. ✓
- Cleanup of replaced types: Task 9. ✓
- Out-of-scope timezone work: explicitly deferred in Task 8 Step 5. ✓

**Type consistency:** `KeywordRow`/`GeoDma`/`GeoRegion` defined in Task 1 and used identically in Tasks 3–6. `resolveDateRange`/`formatResolvedRange` defined in Task 2, consumed in Task 7. `getGeoRows`/`GeoSection` names preserved so `index.tsx` is touched only by Task 4. Field IDs (`Keyword`, `Matchtype`, `Metroarea`) match `field_discovery`.

**Placeholder scan:** none — every code step contains full content; every run step has an exact command and expected result.

**Parallel-safety:** `lib/paid-search/types.ts` is edited only by Task 1 (add) and Task 9 (remove), in different waves — so the keyword and geo streams never collide on it. The replaced types (`SearchTermRow`, `GeoRow`) stay in place until every consumer is gone (after Tasks 4 & 6), so no wave boundary leaves the branch failing to compile; Task 9 then deletes them. `smQuery` report-type auto-resolution noted in Global Constraints.
