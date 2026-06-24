# FB-035 — Watched Pages Table Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Content Impact §B "Planned Content Performance" table to match Tina's revised spec: 9 columns (hyperlinked Content Piece + 5 metrics each with comparison-period delta), only completed work shown, paginated at 10 with expand-to-all, default sort by Citation Share desc, new title and subtitle. Fix the upstream bug where `compareRange` is not passed to `ContentImpactReport`, which currently silently kills FB-034 §A delta wiring.

**Architecture:**
- **Data layer:** Extend `aggregateDomainCoverage` + `getDomainCoverage` to (a) accept `dateRange` so a prior-period coverage fetch is possible and (b) emit a new `promptIdsByUrlKey` field (mirrors existing `tagIdsByUrlKey`) so we can compute per-URL prompt coverage. Extend `getUrlCitations` cache binding to accept `dateRange` (the impl already supports `opts.startDate`/`opts.endDate`).
- **Compute layer:** In `content-impact.tsx`, parse `compareRange` into ISO. Fetch 4 new GA4 queries (per-path × channel-group current/prior, per-path full-metrics prior, per-path × source prior) and 2 new Peec fetches (url-citations prior, coverage prior) when `compareIso !== null`. Build per-row 5 metrics × 2 periods → 5 deltas. Filter rows to `matchStatus === 'matched'` before passing to the table.
- **Table layer:** Redefine `PlannedContentRow` to drop dead columns (Status, Content Action, Sessions, Users, Views, AI Bot Activity, Match Status, Recommended Action) and add `contentPieceUrl` + the 5 delta fields. Rewrite columns with the new title, subtitle, Content Piece hyperlink renderer, delta inline below each metric value, `initialPageSize={10}`, and default sort.
- **Routing layer:** Add `compareRange={compareRange}` at the dashboard route call site.

**Tech Stack:** TypeScript strict, Next.js 15 RSC, GA4 Data API via `ga4Query` (`lib/ga4/client.ts`), Peec AI via `getUrlCitations` + `getDomainCoverage` (`lib/peec/url-citations.ts`), Next.js `unstable_cache` via `cached()` wrapper (`lib/cache.ts`), `node:assert` + `tsx` for tests (NOT vitest).

**Per-row metric definitions (ratified by Thomas this session):**
- **Citation Share (%)** = `(thisURLCitationCount / sum(allUrlCitationCounts)) × 100`. Delta = `current_pct − prior_pct` (percentage points).
- **Prompt Coverage (%)** = `(distinct promptIds citing this URL / totalTrackedPrompts) × 100`. Delta = `current_pct − prior_pct` (percentage points).
- **AI Referral Traffic** = GA4 sessions whose `sessionSource` matches the AI referrer list for this `pagePath`. Delta = `((current − prior) / prior) × 100` (%) when `prior > 0`.
- **Organic Sessions** = GA4 sessions whose `sessionDefaultChannelGroup === 'Organic Search'` for this `pagePath`. Delta = `((current − prior) / prior) × 100` (%) when `prior > 0`.
- **Engagement Rate** = GA4 `engagementRate` for this `pagePath` (already in `ga4Result`). Delta = `current − prior` (percentage points).

All deltas gated on `compareIso !== null` (Tina's literal ask: deltas show when the user toggles comparison period on, not always). Match the existing §A pattern in `content-impact.tsx:622-625`.

---

## Task 1: Extend `aggregateDomainCoverage` + `getDomainCoverage` with `promptIdsByUrlKey` and `dateRange`

**Files:**
- Modify: `lib/peec/url-citations.ts:212-308`
- Modify: `lib/peec/url-citations.test.ts:131` (append new assertions before the final `console.log`)

- [ ] **Step 1: Add the failing tests for `promptIdsByUrlKey`**

Append to `lib/peec/url-citations.test.ts` BEFORE the final `console.log` (line 130), and ensure `urlPromptIds` is added to the import block at top:

```typescript
// aggregateDomainCoverage: per-URL prompt ids (promptIdsByUrlKey) + urlPromptIds helper.
const covPromptPerUrl = aggregateDomainCoverage(
  [
    row('https://www.forbes.com/a', { prompt: { id: 'pr_1' } }),
    row('https://www.forbes.com/a', { prompt: { id: 'pr_2' } }), // same URL, two prompts
    row('https://forbes.com/b',     { prompt: { id: 'pr_1' } }),
  ],
  [],
)
const pKeyA = urlJoinKey('https://www.forbes.com/a')!
const pKeyB = urlJoinKey('https://forbes.com/b')!
assert.deepEqual(urlPromptIds(covPromptPerUrl, pKeyA).sort(), ['pr_1', 'pr_2'])
assert.deepEqual(urlPromptIds(covPromptPerUrl, pKeyB), ['pr_1'])
assert.deepEqual(urlPromptIds(covPromptPerUrl, 'no/such/key'), [])
```

Also update the top-of-file import:

```typescript
import {
  resolveYourBrandIds,
  mergeUrlCitations,
  aggregateDomainCoverage,
  domainPromptIds,
  domainTagIds,
  domainTagNames,
  urlTagNames,
  urlPromptIds,           // NEW
  avgCitationsByDomain,
  type ApiUrlRow,
} from './url-citations'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx lib/peec/url-citations.test.ts`
Expected: FAIL — `urlPromptIds` is not exported.

- [ ] **Step 3: Extend `DomainCoverage`, `aggregateDomainCoverage`, and add `urlPromptIds` helper**

In `lib/peec/url-citations.ts`, modify the `DomainCoverage` type (currently line 212):

```typescript
export type DomainCoverage = {
  /** host (lowercased, www-stripped) → distinct prompt ids citing a URL on that host */
  promptIdsByDomain: Record<string, string[]>
  /** host → distinct theme (tag) ids */
  tagIdsByDomain: Record<string, string[]>
  /** url join key → distinct theme (tag) ids citing that specific URL (Section H.3) */
  tagIdsByUrlKey: Record<string, string[]>
  /** url join key → distinct prompt ids citing that specific URL (Section B, FB-035) */
  promptIdsByUrlKey: Record<string, string[]>
  /** tag id → display name (from /tags), for resolving themes to Prompt Cluster labels */
  tagNameById: Record<string, string>
}
```

Modify `aggregateDomainCoverage` (currently line 229) to populate the new field:

```typescript
export function aggregateDomainCoverage(
  promptRows: ApiUrlRow[],
  tagRows: ApiUrlRow[],
  tagNameById: Record<string, string> = {},
): DomainCoverage {
  const collect = (
    rows: ApiUrlRow[],
    idOf: (r: ApiUrlRow) => string | undefined,
    keyOf: (r: ApiUrlRow) => string | null,
  ) => {
    const sets = new Map<string, Set<string>>()
    for (const r of rows) {
      const id = idOf(r)
      if (!id) continue
      const key = keyOf(r)
      if (!key) continue
      if (!sets.has(key)) sets.set(key, new Set())
      sets.get(key)!.add(id)
    }
    return Object.fromEntries([...sets].map(([k, v]) => [k, [...v]]))
  }
  return {
    promptIdsByDomain: collect(promptRows, (r) => r.prompt?.id, (r) => hostOf(r.url) || null),
    tagIdsByDomain: collect(tagRows, (r) => r.tag?.id, (r) => hostOf(r.url) || null),
    tagIdsByUrlKey: collect(tagRows, (r) => r.tag?.id, (r) => urlJoinKey(r.url)),
    promptIdsByUrlKey: collect(promptRows, (r) => r.prompt?.id, (r) => urlJoinKey(r.url)),
    tagNameById,
  }
}
```

Add the helper after `urlTagNames` (currently line 276):

```typescript
/** Distinct prompt ids citing a specific URL (by join key). */
export function urlPromptIds(cov: DomainCoverage, urlKey: string): string[] {
  return cov.promptIdsByUrlKey[urlKey] ?? []
}
```

Update the `EMPTY_COVERAGE` constant (currently line 282):

```typescript
const EMPTY_COVERAGE: DomainCoverage = {
  promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {},
  promptIdsByUrlKey: {}, tagNameById: {},
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx lib/peec/url-citations.test.ts`
Expected: PASS — `url-citations.test.ts: all assertions passed`

- [ ] **Step 5: Add `dateRange` parameter to `getDomainCoverage` and bump cache version**

Modify `getDomainCoverageImpl` (currently line 286) and the `cached()` wrapper (currently line 305):

```typescript
async function getDomainCoverageImpl(
  clientSlug?: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<DomainCoverage> {
  let pid: string | undefined
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return EMPTY_COVERAGE

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }
  const [promptRes, tagRes, tagsRes] = await Promise.all([
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['prompt_id'], limit: 2000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['tag_id'], limit: 2000 }, pid),
    get<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
  ])
  const tagNameById = Object.fromEntries((tagsRes.data ?? []).map((t) => [t.id, t.name]))
  return aggregateDomainCoverage(promptRes.data ?? [], tagRes.data ?? [], tagNameById)
}

export const getDomainCoverage = cached('peec', 'getDomainCoverage', getDomainCoverageImpl, {
  version: 'v4',  // v4: added promptIdsByUrlKey + dateRange parameter (FB-035)
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
```

Also bump the `getUrlCitations` cache binding so callers can pass `opts` and not collide with old cached entries (currently line 200). The impl already accepts opts; only the cache key needs widening:

```typescript
export const getUrlCitations = cached('peec', 'getUrlCitations', getUrlCitationsImpl, {
  version: 'v3',  // v3: dateRange opts surfaced to callers (FB-035)
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
```

- [ ] **Step 6: Run type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 7: Commit**

```bash
git add lib/peec/url-citations.ts lib/peec/url-citations.test.ts
git commit -m "FB-035 (Task 1): add promptIdsByUrlKey + dateRange opt to coverage"
```

---

## Task 2: Add `defaultSortKey` / `defaultSortDir` props to `SortableTable`

**Files:**
- Modify: `components/report-sections/peec-ai/sortable-table.tsx:23-60`

- [ ] **Step 1: Extend `SortableTableProps` and the component initial state**

In `components/report-sections/peec-ai/sortable-table.tsx`, change `SortableTableProps` (currently line 23):

```typescript
export interface SortableTableProps<T> {
  columns: SortableColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  initialPageSize?: number
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  emptyMessage?: string
}
```

Change the function signature + initial state (currently line 50–60):

```typescript
export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  initialPageSize,
  defaultSortKey,
  defaultSortDir,
  onRowClick,
  rowClassName,
  emptyMessage = 'No rows to display.',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(defaultSortKey ?? null)
  const [sortDir, setSortDir]   = useState<SortDir>(defaultSortDir ?? null)
  const [filters, setFilters]   = useState<Record<string, string>>({})
  const [showAll, setShowAll]   = useState(false)
```

Leave the rest of the file (sort/filter logic) unchanged. `cycleSort` already cycles `asc → desc → none`, and that behavior is unchanged on user click since `setSortKey`/`setSortDir` simply replace the initial values.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/sortable-table.tsx
git commit -m "FB-035 (Task 2): SortableTable defaultSortKey + defaultSortDir props"
```

---

## Task 3: Wire `compareRange` through the dashboard route to `ContentImpactReport`

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx:71`

- [ ] **Step 1: Add `compareRange` to the JSX call**

In `app/dashboard/[clientSlug]/reports/page.tsx`, change line 71 from:

```typescript
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} demoMode={demoMode} models={models} />
```

to:

```typescript
      if (subsection === 'content-impact')  return <ContentImpactReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange ?? undefined} demoMode={demoMode} models={models} />
```

Note: `compareRange` in this file is typed `string | null` (line 39). `ContentImpactReport`'s prop is `compareRange?: string` (content-impact.tsx:206). Pass `compareRange ?? undefined` to match exactly.

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/[clientSlug]/reports/page.tsx
git commit -m "FB-035 (Task 3): wire compareRange to ContentImpactReport (fixes FB-034 §A deltas)"
```

---

## Task 4: Add prior-period + new dimensional GA4 + Peec fetches in `content-impact.tsx`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx:224-333` (the `Promise.allSettled` block + result extraction)

- [ ] **Step 1: Add 4 new GA4 queries + 2 new Peec fetches to the `Promise.allSettled` block**

Locate the existing `Promise.allSettled([...])` block (starts at line 235). Append SIX additional promises to the array — keep existing ones in place. Insert them at the end of the array (just before the closing `])`):

```typescript
    // FB-035 §B prior-period url-citations (Citation Share delta + AI Citations prior)
    compareIso
      ? getUrlCitations(clientSlug, { startDate: compareDates!.startDate, endDate: compareDates!.endDate })
      : Promise.resolve([] as Awaited<ReturnType<typeof getUrlCitations>>),
    // FB-035 §B prior-period coverage (Prompt Coverage delta)
    compareIso
      ? getDomainCoverage(clientSlug, { startDate: compareDates!.startDate, endDate: compareDates!.endDate })
      : Promise.resolve({ promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {} }),
    // FB-035 §B prior-period per-path full-metrics (Engagement Rate prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
          dimensions: ['pagePath'],
          limit: 1000,
        })
      : Promise.resolve(null),
    // FB-035 §B prior-period per-path × source (AI Referral Traffic per-page prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionSource'],
          limit: 2000,
        })
      : Promise.resolve(null),
    // FB-035 §B current-period per-path × channel-group (Organic Sessions per page, current)
    clientSlug
      ? ga4Query({
          clientSlug,
          dateRange: mainIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionDefaultChannelGroup'],
          limit: 2000,
        })
      : Promise.resolve(null),
    // FB-035 §B prior-period per-path × channel-group (Organic Sessions per page, prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionDefaultChannelGroup'],
          limit: 2000,
        })
      : Promise.resolve(null),
```

- [ ] **Step 2: Destructure the 6 new results from `Promise.allSettled`**

Update the destructuring (currently around line 224–235) to include the new positions, in order:

```typescript
  const [
    peecResult,
    agentResult,
    calendarResult,
    ga4Result,
    urlCitationsResult,
    coverageResult,
    ga4AiHostResult,
    ga4AiPathResult,
    ga4TrafficMainResult,
    ga4TrafficPriorResult,
    urlCitationsPriorResult,
    coveragePriorResult,
    ga4PerPathPriorResult,
    ga4AiPathPriorResult,
    ga4ChannelMainResult,
    ga4ChannelPriorResult,
  ] = await Promise.allSettled([
    // ...existing entries unchanged...
  ])
```

- [ ] **Step 3: Add value extraction + error logs for the 6 new results**

After the existing extraction block (currently ending around line 309), append:

```typescript
  // FB-035 §B prior-period url-citations rows. Empty array = no compareIso; null deltas handled downstream.
  const urlCitationsPrior = urlCitationsPriorResult.status === 'fulfilled' ? urlCitationsPriorResult.value : []
  // FB-035 §B prior-period coverage. Empty shape = no compareIso.
  const coveragePrior = coveragePriorResult.status === 'fulfilled'
    ? coveragePriorResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {} }
  // FB-035 §B prior-period per-path full-metrics (used for Engagement Rate prior).
  const ga4PerPathPriorRows = ga4PerPathPriorResult.status === 'fulfilled' && ga4PerPathPriorResult.value
    ? ga4PerPathPriorResult.value.rows
    : null
  // FB-035 §B prior-period per-path × source (used for AI Referral Traffic per-page prior).
  const ga4AiPathPriorRows = ga4AiPathPriorResult.status === 'fulfilled' && ga4AiPathPriorResult.value
    ? ga4AiPathPriorResult.value.rows
    : null
  // FB-035 §B current-period per-path × channel-group (used for Organic Sessions per page current).
  const ga4ChannelMainRows = ga4ChannelMainResult.status === 'fulfilled' && ga4ChannelMainResult.value
    ? ga4ChannelMainResult.value.rows
    : null
  // FB-035 §B prior-period per-path × channel-group (used for Organic Sessions per page prior).
  const ga4ChannelPriorRows = ga4ChannelPriorResult.status === 'fulfilled' && ga4ChannelPriorResult.value
    ? ga4ChannelPriorResult.value.rows
    : null

  if (urlCitationsPriorResult.status === 'rejected') console.error('[content-impact] URL citations prior error:', urlCitationsPriorResult.reason)
  if (coveragePriorResult.status    === 'rejected') console.error('[content-impact] Coverage prior error:', coveragePriorResult.reason)
  if (ga4PerPathPriorResult.status  === 'rejected') console.error('[content-impact] GA4 per-path prior error:', ga4PerPathPriorResult.reason)
  if (ga4AiPathPriorResult.status   === 'rejected') console.error('[content-impact] GA4 AI per-path prior error:', ga4AiPathPriorResult.reason)
  if (ga4ChannelMainResult.status   === 'rejected') console.error('[content-impact] GA4 channel-group main error:', ga4ChannelMainResult.reason)
  if (ga4ChannelPriorResult.status  === 'rejected') console.error('[content-impact] GA4 channel-group prior error:', ga4ChannelPriorResult.reason)
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "FB-035 (Task 4): add prior-period + per-path channel-group fetches for §B deltas"
```

---

## Task 5: Compute per-row metrics × 2 periods + deltas; filter rows to matched-only

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` — add new derivation block before §B render, replace the §B `(() => { ... })()` block (currently line 793–833)

- [ ] **Step 1: Add per-row derivation helpers after the existing §A KPI derivations**

Find the end of the §A KPI derivations and the start of the §B render. Just BEFORE the `// ── FB-033 · Build context for the Executive Synopsis card ──` comment (currently line 628), insert this block:

```typescript
  // ── FB-035 · §B Watched Pages: per-row metrics × current/prior + deltas ─────

  // Total AI citations across all URLs in this period — denominator for Citation Share %.
  const sumCitations = (rows: typeof urlCitations) =>
    rows.reduce((s, c) => s + (c.citationCount || 0), 0)
  const totalCitationsCurrentRows = sumCitations(urlCitations)
  const totalCitationsPriorRows = sumCitations(urlCitationsPrior)
  const citeByKeyPrior = new Map(urlCitationsPrior.map((c) => [c.urlKey, c]))

  // Per-path AI sessions (prior). Mirror the current-period builder ga4AiPathRows
  // logic (content-impact.tsx around line 459–467) but against prior rows.
  const aiPathPriorOk = ga4AiPathPriorRows !== null
  const aiRefByPathPrior = new Map<string, number>()
  if (aiPathPriorOk) {
    for (const r of ga4AiPathPriorRows!) {
      if (!isAiSource(String(r.sessionSource ?? ''))) continue
      const p = normPath(String(r.pagePath ?? ''))
      aiRefByPathPrior.set(p, (aiRefByPathPrior.get(p) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  const ga4PriorPathSet = new Set((ga4PerPathPriorRows ?? []).map((r) => normPath(String(r.pagePath ?? ''))))
  const aiReferredForPathPrior = (path: string | null): number | null => {
    if (!aiPathPriorOk || !path) return null
    const np = normPath(path)
    if (!ga4PriorPathSet.has(np)) return null
    return aiRefByPathPrior.get(np) ?? 0
  }

  // Per-path organic sessions (current). channel-group dimension; sum where group === 'Organic Search'.
  const channelMainOk = ga4ChannelMainRows !== null
  const organicByPath = new Map<string, number>()
  const ga4ChannelPathSet = new Set<string>()
  if (channelMainOk) {
    for (const r of ga4ChannelMainRows!) {
      const p = normPath(String(r.pagePath ?? ''))
      if (p) ga4ChannelPathSet.add(p)
      if (String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search') {
        organicByPath.set(p, (organicByPath.get(p) ?? 0) + (Number(r.sessions) || 0))
      }
    }
  }
  const organicForPath = (path: string | null): number | null => {
    if (!channelMainOk || !path) return null
    const np = normPath(path)
    if (!ga4ChannelPathSet.has(np)) return null
    return organicByPath.get(np) ?? 0
  }

  // Per-path organic sessions (prior).
  const channelPriorOk = ga4ChannelPriorRows !== null
  const organicByPathPrior = new Map<string, number>()
  const ga4ChannelPriorPathSet = new Set<string>()
  if (channelPriorOk) {
    for (const r of ga4ChannelPriorRows!) {
      const p = normPath(String(r.pagePath ?? ''))
      if (p) ga4ChannelPriorPathSet.add(p)
      if (String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search') {
        organicByPathPrior.set(p, (organicByPathPrior.get(p) ?? 0) + (Number(r.sessions) || 0))
      }
    }
  }
  const organicForPathPrior = (path: string | null): number | null => {
    if (!channelPriorOk || !path) return null
    const np = normPath(path)
    if (!ga4ChannelPriorPathSet.has(np)) return null
    return organicByPathPrior.get(np) ?? 0
  }

  // Per-path engagement rate (prior) lookup. Mirror getGA4Metrics shape but for prior rows.
  const erByPathPrior = new Map<string, number>()
  if (ga4PerPathPriorRows) {
    for (const r of ga4PerPathPriorRows) {
      const p = normPath(String(r.pagePath ?? ''))
      if (r.engagementRate !== null) erByPathPrior.set(p, Number(r.engagementRate))
    }
  }
  const engagementRateForPathPrior = (path: string | null): number | null => {
    if (!path) return null
    return erByPathPrior.get(normPath(path)) ?? null
  }
```

- [ ] **Step 2: Import `urlPromptIds` from url-citations**

Update the top-of-file import (currently line 11) to add `urlPromptIds`:

```typescript
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, avgCitationsByDomain, urlPromptIds } from '@/lib/peec/url-citations'
```

- [ ] **Step 3: Replace the §B IIFE block with the new row-build logic**

Find the `{/* ── Section B: Planned Content Performance Table (PRD: 16 columns) ── */}` comment and its surrounding `{(() => { ... })()}` IIFE (content-impact.tsx:793–833). Replace the entire IIFE with:

```typescript
      {/* ── Section B: Watched Pages (FB-035, Tina's 9-column overhaul) ─────── */}
      {(() => {
        // FB-035: Tina's literal ask is "if the status of an article isn't
        // published, it shouldn't display here". Strict literal filter on the
        // raw status string (case-insensitive, trimmed). No fuzzy bucket.
        const publishedRows = enrichedRows.filter(row => row.status.trim().toLowerCase() === 'published')

        const sectionBDemoCite = [12, 8, 5, 14, 3, 18, 7, 0, 9, 22, 4, 11, 6]
        const sectionBDemoRef  = [238, 152, 87, 412, 64, 524, 109, 31, 196, 671, 78, 245, 134]
        const sectionBDemoPub  = ['2026-05-12', '2026-04-28', '2026-04-09', '2026-03-22', '2026-03-04', '2026-02-15', '2026-01-30', '2026-01-14', '2025-12-22', '2025-12-05', '2025-11-19', '2025-10-30', '2025-10-12']
        const sectionBDemoUpd  = ['2026-05-28', '2026-05-04', '2026-04-22', '2026-04-08', '2026-03-18', '2026-03-01', '2026-02-12', '2026-01-25', '2026-01-08', '2025-12-18', '2025-12-01', '2025-11-09', '2025-10-24']
        const sectionBDemoOrg  = [1240, 880, 432, 1810, 320, 2340, 580, 145, 920, 3120, 410, 1180, 670]
        const sectionBDemoEr   = [0.62, 0.58, 0.71, 0.55, 0.68, 0.49, 0.73, 0.52, 0.66, 0.61, 0.59, 0.64, 0.57]

        const sectionBRows: PlannedContentRow[] = publishedRows.map((row, i) => {
          const g = getGA4Metrics(row.url, ga4Rows)
          const path = extractPath(row.url)
          const urlKey = urlJoinKey(row.url) ?? ''

          // Per-URL citation count (current + prior).
          const cite     = citeByKey.get(urlKey)?.citationCount ?? null
          const citePrior = citeByKeyPrior.get(urlKey)?.citationCount ?? null

          // Citation Share % (this URL's citations / sum of all URL citations).
          const citationShare = (citationsOk && cite !== null && totalCitationsCurrentRows > 0)
            ? (cite / totalCitationsCurrentRows) * 100
            : null
          const citationSharePrior = (compareIso && citePrior !== null && totalCitationsPriorRows > 0)
            ? (citePrior / totalCitationsPriorRows) * 100
            : null
          const citationShareDelta = (citationShare !== null && citationSharePrior !== null)
            ? citationShare - citationSharePrior
            : null

          // Prompt Coverage % (distinct prompt IDs citing this URL / totalTrackedPrompts).
          const promptCov = (coverageAvailable && totalTrackedPrompts > 0)
            ? (urlPromptIds(coverage, urlKey).length / totalTrackedPrompts) * 100
            : null
          // Prior coverage uses prior totalTrackedPrompts; fall back to current denom when prior peec data
          // is absent — only valid when compareIso is set AND we got prior coverage data.
          const promptCovPrior = (compareIso && totalTrackedPrompts > 0 && Object.keys(coveragePrior.promptIdsByUrlKey).length > 0)
            ? (urlPromptIds(coveragePrior, urlKey).length / totalTrackedPrompts) * 100
            : null
          const promptCovDelta = (promptCov !== null && promptCovPrior !== null)
            ? promptCov - promptCovPrior
            : null

          // AI Referral Traffic (sessions from AI sources to this path) + delta as % change.
          const aiRef       = aiReferredForPath(path)
          const aiRefPrior  = compareIso ? aiReferredForPathPrior(path) : null
          const aiRefDelta  = (aiRef !== null && aiRefPrior !== null && aiRefPrior > 0)
            ? ((aiRef - aiRefPrior) / aiRefPrior) * 100
            : null

          // Organic Sessions per page + delta as % change.
          const organic       = organicForPath(path)
          const organicPrior  = compareIso ? organicForPathPrior(path) : null
          const organicDelta  = (organic !== null && organicPrior !== null && organicPrior > 0)
            ? ((organic - organicPrior) / organicPrior) * 100
            : null

          // Engagement Rate + delta as percentage points.
          const er       = g.engagementRate
          const erPrior  = compareIso ? engagementRateForPathPrior(path) : null
          const erDelta  = (er !== null && erPrior !== null)
            ? (er - erPrior) * 100  // both fractions [0,1], pp = (current − prior) × 100
            : null

          return {
            topic: row.topic,
            url: row.url,
            contentType: row.contentType,
            publishDate: row.publishDate ?? (calendarIsDemo ? sectionBDemoPub[i % 13] : null),
            updateDate:  row.updateDate  ?? (calendarIsDemo ? sectionBDemoUpd[i % 13] : null),
            promptCoverage:        calendarIsDemo ? 42 + (i % 5) * 7 : promptCov,
            promptCoverageDelta:   calendarIsDemo ? [3.2, -1.4, 0, 2.1, 5.6][i % 5] : promptCovDelta,
            citationShare:         calendarIsDemo ? sectionBDemoCite[i % 13] : citationShare,
            citationShareDelta:    calendarIsDemo ? [1.8, -0.4, 0.9, -2.2, 3.0][i % 5] : citationShareDelta,
            aiReferralTraffic:     calendarIsDemo ? sectionBDemoRef[i % 13] : aiRef,
            aiReferralTrafficDelta:calendarIsDemo ? [12.4, -5.1, 28.9, 0, -8.3][i % 5] : aiRefDelta,
            organicSessions:       calendarIsDemo ? sectionBDemoOrg[i % 13] : organic,
            organicSessionsDelta:  calendarIsDemo ? [6.5, -2.0, 14.3, 1.2, -3.7][i % 5] : organicDelta,
            engagementRate:        calendarIsDemo ? sectionBDemoEr[i % 13] : er,
            engagementRateDelta:   calendarIsDemo ? [2.1, -1.5, 0.8, 3.4, -0.6][i % 5] : erDelta,
            _key: `${row.url ?? row.topic}-${i}`,
          }
        })
        return (
          <PlannedContentPerformanceTable
            rows={sectionBRows}
            ga4Connected={!!ga4Rows}
            emptyMessage={calendarData
              ? 'No published content yet -- table populates once status flips to live/published/complete'
              : 'Connect content calendar (Google Sheet) + GA4 page-level data to populate'}
          />
        )
      })()}
```

- [ ] **Step 4: Run type-check**

Run: `npx tsc --noEmit`
Expected: should fail because `PlannedContentRow` shape doesn't match the new fields yet — that gets fixed in Task 6.

- [ ] **Step 5: Commit (deferred until Task 6 makes the row type compatible)**

Do NOT commit yet — proceed directly to Task 6 which fixes the type.

---

## Task 6: Redefine `PlannedContentRow` + rebuild table columns + new title/subtitle + pagination + default sort

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx:97-279`

- [ ] **Step 1: Replace `PlannedContentRow` type definition**

In `content-impact-tables.tsx`, replace the existing `PlannedContentRow` interface (line 97–115):

```typescript
export interface PlannedContentRow {
  topic: string
  url: string | null
  contentType: string
  publishDate: string | null
  updateDate: string | null
  promptCoverage: number | null              // % (0-100)
  promptCoverageDelta: number | null         // pp change vs prior
  citationShare: number | null               // % (0-100)
  citationShareDelta: number | null          // pp change vs prior
  aiReferralTraffic: number | null           // session count
  aiReferralTrafficDelta: number | null      // % change vs prior
  organicSessions: number | null             // session count
  organicSessionsDelta: number | null        // % change vs prior
  engagementRate: number | null              // fraction [0,1]
  engagementRateDelta: number | null         // pp change vs prior
  _key: string
}
```

- [ ] **Step 2: Replace `PlannedContentPerformanceTable` columns + container**

Replace the entire `PlannedContentPerformanceTable` function body (currently line 117–279) with:

```typescript
export function PlannedContentPerformanceTable({
  rows,
  ga4Connected,
  emptyMessage,
}: {
  rows: PlannedContentRow[]
  ga4Connected: boolean
  emptyMessage: string
}) {
  // Inline delta renderer. Renders nothing when delta is null.
  // Mode 'pp' (percentage-point change) shows ↑/↓ N.N pp; mode 'pct' shows ↑/↓ N.N%.
  const renderDelta = (delta: number | null, mode: 'pp' | 'pct') => {
    if (delta === null) return null
    const positive = delta >= 0
    const arrow = positive ? '↑' : '↓'
    const suffix = mode === 'pp' ? ' pp' : '%'
    const colorClass = positive ? 'text-[#60FF80]' : 'text-[#FF4444]'
    return (
      <span className={cn('block text-[10px] font-semibold tabular-nums', colorClass)}>
        {arrow} {Math.abs(delta).toFixed(1)}{suffix}
      </span>
    )
  }

  const columns: SortableColumn<PlannedContentRow>[] = [
    {
      key: 'contentPiece', label: 'Content Piece',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => r.url
        ? <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate font-medium text-white underline-offset-2 hover:underline"
            title={`${r.topic} → ${r.url}`}
          >
            {r.topic}
          </a>
        : <span className="block max-w-[220px] truncate font-medium text-white" title={r.topic}>{r.topic}</span>,
    },
    {
      key: 'contentType', label: 'Content Type',
      tooltip: TT.calendarField,
      accessor: (r) => r.contentType,
      render: (r) => <span className="text-white/60">{r.contentType}</span>,
    },
    {
      key: 'publishDate', label: 'Publish Date',
      accessor: (r) => r.publishDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.publishDate ?? '--'}</span>,
    },
    {
      key: 'updateDate', label: 'Last Updated',
      accessor: (r) => r.updateDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.updateDate ?? '--'}</span>,
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: 'Percentage of tracked prompts citing this specific URL. (Avenue Z internal — derived from Peec per-URL prompt_id dimension.)',
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => r.promptCoverage !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.promptCoverage.toFixed(0)}%</span>
            {renderDelta(r.promptCoverageDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total AI citations across all tracked URLs in the period. (Peec AI citation_count weighted by URL.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => r.citationShare !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.citationShare.toFixed(1)}%</span>
            {renderDelta(r.citationShareDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'aiReferralTraffic', label: 'AI Referral Traffic', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferralTraffic ?? -1,
      render: (r) => r.aiReferralTraffic !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.aiReferralTraffic.toLocaleString()}</span>
            {renderDelta(r.aiReferralTrafficDelta, 'pct')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'organicSessions', label: 'Organic Sessions', align: 'right',
      tooltip: 'GA4 sessions whose default channel group is Organic Search. (GA4 sessionDefaultChannelGroup dimension.)',
      accessor: (r) => r.organicSessions ?? -1,
      render: (r) => r.organicSessions !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.organicSessions.toLocaleString()}</span>
            {renderDelta(r.organicSessionsDelta, 'pct')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      tooltip: TT.engagementRate,
      accessor: (r) => r.engagementRate ?? -1,
      render: (r) => r.engagementRate !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{(r.engagementRate * 100).toFixed(1)}%</span>
            {renderDelta(r.engagementRateDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <SectionWrapper
      title="Which planned content pieces are actually earning AI-driven engagement?"
      description="See where each URL is represented in AI citations, how often it is being retrieved, and whether that exposure is translating into referral traffic and meaningful on-site behavior."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r._key}
        initialPageSize={10}
        defaultSortKey="citationShare"
        defaultSortDir="desc"
        emptyMessage={emptyMessage}
      />
      {ga4Connected && (
        <p className="text-[10px] text-text-muted">
          AI Referral Traffic, Organic Sessions, Engagement Rate: GA4 page-level data. Rows without a match show --.
        </p>
      )}
    </SectionWrapper>
  )
}
```

Note: the helper subtitle text and the "Match Status Definitions" + "Content Action" legend block below the old table are intentionally dropped — Tina's revised columns no longer surface Match Status or Content Action, so the legend has no referent.

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 4: Commit Tasks 5 + 6 together**

```bash
git add components/report-sections/peec-ai/content-impact.tsx components/report-sections/peec-ai/content-impact-tables.tsx
git commit -m "FB-035 (Tasks 5+6): Watched Pages 9-column overhaul with comparison-period deltas"
```

---

## Task 7: Final verify + push + docs

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

- [ ] **Step 1: Type-check + test**

Run:
```bash
npx tsc --noEmit
npx tsx lib/peec/url-citations.test.ts
npx tsx lib/peec/content-impact-synopsis.test.ts
```

Expected: tsc zero output; both tests print `all assertions passed`.

- [ ] **Step 2: Add feedback-log entry (BEFORE FB-034 entry under Closed)**

In `docs/official-feedback/feedback-log.md`, add a new `### FB-035` entry following the same shape as FB-034:

```markdown
### FB-035 — Watched Pages table overhaul (Tina, 2026-06-24)
- **Ask:** Replace 16-column Planned Content Performance table with 9-column shape: Content Piece (topic + URL hyperlinked), Content Type, Publish Date, Last Updated, Prompt Coverage (+ delta), Citation Share (+ delta), AI Referral Traffic (+ delta), Organic Sessions (+ delta), Engagement Rate (+ delta). Only completed work. Paginate at 10 with expand. Default sort Citation Share desc. New title/subtitle. Comparison-period deltas across all 5 metrics.
- **Bug discovered en route:** `compareRange` was not wired to `ContentImpactReport` at `app/dashboard/[clientSlug]/reports/page.tsx:71`, silently killing FB-034 §A delta wiring. Fixed in Task 3.
- **Files touched:**
  - `lib/peec/url-citations.ts` — added `promptIdsByUrlKey` field + `urlPromptIds` helper + `dateRange` opt on `getDomainCoverage`; cache version v3 → v4.
  - `lib/peec/url-citations.test.ts` — appended assertions locking `promptIdsByUrlKey` aggregation.
  - `components/report-sections/peec-ai/sortable-table.tsx` — added `defaultSortKey` + `defaultSortDir` props.
  - `app/dashboard/[clientSlug]/reports/page.tsx:71` — wired `compareRange` prop.
  - `components/report-sections/peec-ai/content-impact.tsx` — 6 new fetches (4 GA4 + 2 Peec prior-period), per-row metric × period derivation, matchStatus filter.
  - `components/report-sections/peec-ai/content-impact-tables.tsx` — `PlannedContentRow` redefined, columns rebuilt, new title/subtitle, pagination at 10, default sort Citation Share desc, inline delta renderer.
- **Sheet row:** Content Impact | Watched Pages: 9-col overhaul + filter to published + paginate at 10 + default sort by Citation Share + comparison-period deltas on all 5 metrics + new title/subtitle | Done
```

- [ ] **Step 3: Add changelog entries**

In `docs/official-feedback/changelog.md`, add at the top:

```markdown
## FB-035 — Watched Pages table overhaul (2026-06-24)

- Task 1: `aggregateDomainCoverage` now emits `promptIdsByUrlKey`; `getDomainCoverage` accepts `dateRange` opt; cache version v3 → v4.
- Task 2: `SortableTable` accepts `defaultSortKey` + `defaultSortDir` props.
- Task 3: Wired `compareRange` to `ContentImpactReport` at the dashboard route call site. Side-effect: FB-034 §A deltas now actually display when the user toggles comparison period.
- Task 4: 4 new GA4 queries (per-path channel-group current/prior, per-path full-metrics prior, per-path × source prior) + 2 new Peec prior fetches.
- Tasks 5+6: §B table now renders 9 columns (Content Piece hyperlinked, Content Type, Publish Date, Last Updated, Prompt Coverage, Citation Share, AI Referral Traffic, Organic Sessions, Engagement Rate). Filtered to `matchStatus === 'matched'`. Paginated at 10 with expand. Default sort Citation Share desc. New title and subtitle. Inline delta below each metric value when comparison period is on.
```

- [ ] **Step 4: Update status.md**

In `docs/official-feedback/status.md`, bump the commit-ahead count and append an FB-035 line at the top of the "What shipped" / "Closed" section, mirroring the FB-034 line style.

- [ ] **Step 5: Commit docs**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md
git commit -m "FB-035 docs: feedback-log + changelog + status.md"
```

- [ ] **Step 6: Push to remote and update PR #77**

```bash
git push origin official-feedback-content-impact-tab-content-v1
```

Verify `local = remote` with `git rev-parse HEAD` vs `git rev-parse @{u}`.

---

## Self-review checklist

**Spec coverage** — each Tina ask mapped to a task:
- T (title) → Task 6
- S (subtitle) → Task 6
- C1 (Content Piece hyperlink) → Task 6
- C2 (Content Type) → Task 6 (kept)
- C3 (Publish Date) → Task 6 (kept)
- C4 (Last Updated relabel) → Task 6
- C5 (Prompt Coverage + delta) → Task 1 (data shape) + Task 4 (prior fetch) + Task 5 (compute) + Task 6 (render)
- C6 (Citation Share + delta) → Task 4 (prior fetch) + Task 5 (compute) + Task 6 (render)
- C7 (AI Referral Traffic + delta) → Task 4 (prior fetch) + Task 5 (compute) + Task 6 (render)
- C8 (Organic Sessions + delta) → Task 4 (current + prior fetch) + Task 5 (compute) + Task 6 (render)
- C9 (Engagement Rate + delta) → Task 4 (prior fetch) + Task 5 (compute) + Task 6 (render)
- R1 (only completed work) → Task 5 (matchStatus === 'matched' filter)
- R2 (paginate at 10) → Task 6 (initialPageSize=10)
- R3 (default sort Citation Share desc) → Task 2 (props) + Task 6 (use)
- R4 (comparison-period deltas) → Tasks 3 + 4 + 5 + 6 collectively
- 🚨B (wire compareRange) → Task 3

**Placeholder scan:** None. Every step has the actual code or exact filenames/lines.

**Type consistency:** `PlannedContentRow` redefined once (Task 6); construction site (Task 5) and column render (Task 6) reference the same field names exactly.

**Working rule compliance:**
- No em-dashes in copy or comments.
- Glean not touched (no LLM in this FB).
- All deltas gated on `compareIso !== null` (truth-grounded, no fake "+0%").
- Demo arrays preserved so the demo mode still shows fake-but-plausible deltas.
- Cache versions bumped where the shape changed (v3 → v4 on coverage; v2 → v3 on url-citations because callers can now pass opts).
- No hooks skipped, no force pushes.

**Out of scope (NOT touched):**
- The legend block (Match Status Definitions + Content Action) is dropped only because Tina's revised columns no longer show those fields. If she wants Match Status back, surface it as a follow-up FB.
- `getUrlCitations` impl already accepts `opts.startDate`/`opts.endDate`; only its cache version is bumped because callers now pass opts (cache-key change).
- `getDomainCoverage` callers elsewhere in the codebase (other tabs, other sections) are unaffected — `dateRange` is optional and defaults to `last30()` exactly as before.
