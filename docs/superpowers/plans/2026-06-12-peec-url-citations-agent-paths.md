# Peec URL Citations + Per-Path Bot Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo-only `null` fields in the AEO Technical Audit and Content Impact sections with real data from two Peec endpoints we already have access to: `POST /reports/urls` (URL-level citations) and `GET /agent-analytics/visits` grouped by `bot_id`+`request_path` (per-path-per-bot crawl visits).

**Architecture:** Two new/extended data functions in the Peec client layer expose verified API shapes as typed objects; a shared `urlJoinKey()` canonicalizes URLs so citations join to report rows; the RSC report sections fetch the new data and thread it into existing table components, replacing `demoMode ? demo[…] : null` branches with real lookups (demo mode unchanged).

**Tech Stack:** TypeScript, Next.js 15 RSC, Peec customer API (`X-API-Key`), `node:assert` test scripts run via `tsx` (no test framework in this repo).

**Spec:** [docs/superpowers/specs/2026-06-12-peec-url-citations-agent-paths-design.md](../specs/2026-06-12-peec-url-citations-agent-paths-design.md)
**Deferred follow-up (NOT in this plan):** [docs/superpowers/specs/2026-06-12-getchat-citation-position-followup.md](../specs/2026-06-12-getchat-citation-position-followup.md)

---

## Conventions for this repo

- **Tests** are standalone scripts using `import { strict as assert } from 'node:assert'`, ending with `console.log('<name>: all assertions passed')`. Run with `npx tsx <path>`. There is no `npm test`. Model new tests on `lib/aeo/bucket.test.ts`.
- **Typecheck** the whole project with `npx tsc --noEmit`. **Lint** with `npm run lint`.
- **Live probe** (read-only) for API shapes: `npx tsx --env-file=.env.local scripts/probe-peec-urls-agents.ts` (override project with `PEEC_AI_PROJECT_ID=or_043ae735-9397-48cf-a754-6e346a55f394`).
- The customer token is `PEEC_AI_CUSTOMER_TOKEN`; per-client project id is `peecCustomerProjectId` (resolved via `getClientBySlug`).

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `lib/url.ts` | Create | `urlJoinKey()` — canonical URL/path form for matching across vendors |
| `lib/url.test.ts` | Create | Unit tests for `urlJoinKey` |
| `lib/peec/url-citations.ts` | Create | `UrlCitation` type + pure transforms (`resolveYourBrandIds`, `mergeUrlCitations`) + `getUrlCitations()` network fn |
| `lib/peec/url-citations.test.ts` | Create | Unit tests for the pure transforms |
| `lib/peec/agent-analytics.ts` | Modify | Add `bucketBotType`, `aggregateVisitsByPath`, `byPath` to `AgentAnalyticsData`, one `/visits` fetch |
| `lib/peec/agent-analytics.test.ts` | Create | Unit tests for `bucketBotType` + `aggregateVisitsByPath` |
| `components/report-sections/peec-ai/technical-audit-tables.tsx` | Modify | PageOverlapTable + LogAnomaliesTable: read real data |
| `components/report-sections/peec-ai/technical-audit.tsx` | Modify | Fetch `getUrlCitations`, thread `urlCitations` prop |
| `components/report-sections/peec-ai/content-impact.tsx` | Modify | §B `aiCitations`, §F engines/cluster, §H competitor URLs |

## Dependency Graph & Parallelization

```
T1 (lib/url.ts)
        │
   ┌────┴─────┐
   ▼          ▼
  T2          T3            ← parallel: different files (client.ts vs agent-analytics.ts)
(url-cit)  (agent byPath)
   │          │
   └────┬─────┴───────────────┐
        ▼                      ▼
  STREAM A (technical-audit)   STREAM B (content-impact)
  T4 → T5 → T6                 T7 → T8
        (serialized:           (serialized:
   T4,T5 share tables file;    T7,T8 share content-impact.tsx)
   T6 needs T4/T5 props)
  STREAM A ∥ STREAM B          ← parallel: disjoint files
```

**Inter-task rules for a parallel workflow:**
- **T1 must complete before T2 and any UI task** (they import `urlJoinKey`).
- **T2 ∥ T3** — independent files, no shared symbols. Safe to run concurrently.
- **T4 and T5 edit the same file** (`technical-audit-tables.tsx`). Do NOT run concurrently — serialize, or assign both to one agent.
- **T6 depends on T4 + T5** (it passes the new `urlCitations` prop added in T4 and relies on `byPath` consumed in T4/T5).
- **T7 and T8 edit the same file** (`content-impact.tsx`). Serialize, or one agent.
- **Stream A (T4–T6) ∥ Stream B (T7–T8)** — disjoint files; safe concurrently. Both depend only on T2 (+T3 for Stream A).
- If running streams concurrently in separate worktrees, both modify only their own files plus import from the T1/T2/T3 libs (read-only) — no merge conflicts expected.

---

## Task 1: `urlJoinKey()` shared URL canonicalizer

**Files:**
- Create: `lib/url.ts`
- Test: `lib/url.test.ts`

Rationale: a join key must be canonical (lowercase host, no protocol, no `www.`, no trailing slash, no query/hash). The existing `normalizeUrl` in `lib/content-calendar/client.ts` is a *cell-cleaner* (maps "TBD" → null, prepends `https://`) with different semantics — do NOT reuse it. Keep both.

- [ ] **Step 1: Write the failing test**

Create `lib/url.test.ts`:
```ts
// lib/url.test.ts
// Run: npx tsx lib/url.test.ts
import { strict as assert } from 'node:assert'
import { urlJoinKey } from './url'

// full URL → host + path, no protocol/www/trailing-slash/query
assert.equal(urlJoinKey('https://www.Example.com/Blog/Post/'), 'example.com/blog/post')
assert.equal(urlJoinKey('http://example.com/a?b=1#x'), 'example.com/a')
assert.equal(urlJoinKey('https://example.com'), 'example.com')
// bare path (agent-analytics request_path) → leading slash kept, lowercased, no trailing slash
assert.equal(urlJoinKey('/Guide/Intro/'), '/guide/intro')
assert.equal(urlJoinKey('/'), '/')
// host-only without scheme
assert.equal(urlJoinKey('Example.com/Path'), 'example.com/path')
// junk / empty
assert.equal(urlJoinKey(''), null)
assert.equal(urlJoinKey(undefined), null)
assert.equal(urlJoinKey('   '), null)

console.log('url.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/url.test.ts`
Expected: FAIL — `Cannot find module './url'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/url.ts`:
```ts
// lib/url.ts
/**
 * Canonical key for matching a URL or path across data sources
 * (Peec citations, content-calendar rows, Screaming Frog paths, agent logs).
 *
 * Rules: lowercase, strip protocol + leading `www.`, drop query/hash,
 * strip a trailing slash (except the root "/"). Returns null for empty input.
 *
 * NOTE: distinct from content-calendar's `normalizeUrl`, which validates
 * spreadsheet cells (TBD/pending → null) rather than producing a join key.
 */
export function urlJoinKey(raw: string | undefined | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // Drop query/hash.
  s = s.split('#')[0].split('?')[0]

  // Bare path (starts with "/"): no host to normalize.
  if (s.startsWith('/')) {
    const lower = s.toLowerCase()
    return lower === '/' ? '/' : lower.replace(/\/+$/, '')
  }

  // Strip protocol if present.
  s = s.replace(/^[a-z]+:\/\//i, '')
  // Strip leading www.
  s = s.replace(/^www\./i, '')
  const lower = s.toLowerCase()
  const trimmed = lower.replace(/\/+$/, '')
  return trimmed || null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/url.test.ts`
Expected: `url.test.ts: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add lib/url.ts lib/url.test.ts
git commit -m "feat(url): add urlJoinKey canonicalizer for cross-vendor matching"
```

---

## Task 2: `getUrlCitations()` + pure transforms

**Files:**
- Create: `lib/peec/url-citations.ts`
- Test: `lib/peec/url-citations.test.ts`

Verified `POST /reports/urls` row shape (from probe): `{ url, classification, title, channel_title, usage_count, citation_count, citation_avg, retrievals, retrieval_count, citation_rate, mentioned_brands: [{id}] }`; with `dimensions:['model_channel_id']` adds `model_channel:{id}`. No `domain`, no position.

- [ ] **Step 1: Write the failing test** (pure transforms only — network fn is not unit-tested)

Create `lib/peec/url-citations.test.ts`:
```ts
// lib/peec/url-citations.test.ts
// Run: npx tsx lib/peec/url-citations.test.ts
import { strict as assert } from 'node:assert'
import { resolveYourBrandIds, mergeUrlCitations, type ApiUrlRow } from './url-citations'

// resolveYourBrandIds: match brand name (case-insensitive) → id(s)
const brands = [
  { brand: { id: 'kw_self', name: 'Avenue Z' } },
  { brand: { id: 'kw_comp', name: 'Edelman' } },
]
assert.deepEqual(resolveYourBrandIds(brands, 'avenue z'), ['kw_self'])
assert.deepEqual(resolveYourBrandIds(brands, 'Unknown'), [])
assert.deepEqual(resolveYourBrandIds(brands, ''), [])

// mergeUrlCitations: base rows + per-engine rows → UrlCitation[]
const base: ApiUrlRow[] = [{
  url: 'https://www.avenuez.com/Blog/Post/', classification: 'LISTICLE', title: 'T',
  channel_title: null, usage_count: 10, citation_count: 30, citation_avg: 3,
  retrievals: 10, retrieval_count: 10, citation_rate: 3,
  mentioned_brands: [{ id: 'kw_self' }, { id: 'kw_comp' }],
}]
const perEngine: ApiUrlRow[] = [
  { ...base[0], model_channel: { id: 'openai-0' } },
  { ...base[0], model_channel: { id: 'perplexity-0' } },
]
const brandNameById = new Map([['kw_self', 'Avenue Z'], ['kw_comp', 'Edelman']])
const merged = mergeUrlCitations(base, perEngine, ['kw_self'], brandNameById)
assert.equal(merged.length, 1)
assert.equal(merged[0].urlKey, 'avenuez.com/blog/post')
assert.equal(merged[0].domain, 'avenuez.com')
assert.equal(merged[0].citationCount, 30)
assert.equal(merged[0].mentionsYourBrand, true)
assert.deepEqual(merged[0].engines.sort(), ['ChatGPT', 'Perplexity'])
// competitor names exclude your own brand
assert.deepEqual(merged[0].competitorBrandNames, ['Edelman'])

// competitor-only URL → mentionsYourBrand false, your brand absent
const compRow: ApiUrlRow[] = [{ ...base[0], url: 'https://edelman.com/x', mentioned_brands: [{ id: 'kw_comp' }] }]
const compMerged = mergeUrlCitations(compRow, [], ['kw_self'], brandNameById)
assert.equal(compMerged[0].mentionsYourBrand, false)
assert.deepEqual(compMerged[0].competitorBrandNames, ['Edelman'])

console.log('url-citations.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/peec/url-citations.test.ts`
Expected: FAIL — `Cannot find module './url-citations'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/peec/url-citations.ts`. It defines its own tiny `normalizeEngine` mapper (the equivalent in `client.ts` is a nested closure, not exportable; duplicating ~8 lines is cheaper than extracting a closure from a 700-line function — and keeps this task to NEW FILES ONLY).
```ts
// lib/peec/url-citations.ts
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'

const BASE_URL = 'https://api.peec.ai/customer/v1'

/** Map a Peec model_channel id (e.g. "openai-0") to a friendly engine label. */
function normalizeEngine(id: string): string | null {
  const s = id.toLowerCase()
  if (s.includes('openai') || s.includes('chatgpt')) return 'ChatGPT'
  if (s.includes('perplexity')) return 'Perplexity'
  if (s.includes('gemini')) return 'Gemini'
  if (s.includes('claude')) return 'Claude'
  if (s.includes('copilot')) return 'Copilot'
  if (s.includes('google')) return 'Google'
  return null
}

export type ApiUrlRow = {
  url: string
  classification: string
  title: string | null
  channel_title: string | null
  model_channel?: { id: string }
  usage_count: number
  citation_count: number
  citation_avg: number
  retrievals: number
  retrieval_count: number
  citation_rate: number
  mentioned_brands: { id: string }[]
}

type ApiBrandNameRow = { brand: { id: string; name: string } }

export type UrlCitation = {
  url: string
  urlKey: string
  domain: string
  classification: string
  title: string | null
  citationCount: number
  citationRate: number
  engines: string[]
  mentionedBrandIds: string[]
  competitorBrandNames: string[]   // mentioned brand names excluding "your brand"
  mentionsYourBrand: boolean
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() }
  catch { return (urlJoinKey(url) ?? '').split('/')[0] }
}

/** Match the configured "your brand" display name to its Peec brand id(s). */
export function resolveYourBrandIds(brands: ApiBrandNameRow[], yourBrand: string): string[] {
  const needle = yourBrand.trim().toLowerCase()
  if (!needle) return []
  return brands.filter((b) => b.brand?.name?.trim().toLowerCase() === needle).map((b) => b.brand.id)
}

/** Merge base URL rows with per-engine rows into typed citations. */
export function mergeUrlCitations(
  base: ApiUrlRow[],
  perEngine: ApiUrlRow[],
  yourBrandIds: string[],
  brandNameById: Map<string, string> = new Map(),
): UrlCitation[] {
  const enginesByKey = new Map<string, Set<string>>()
  for (const r of perEngine) {
    const key = urlJoinKey(r.url)
    if (!key || !r.model_channel?.id) continue
    const engine = normalizeEngine(r.model_channel.id)
    if (!engine) continue
    if (!enginesByKey.has(key)) enginesByKey.set(key, new Set())
    enginesByKey.get(key)!.add(engine)
  }
  const yours = new Set(yourBrandIds)
  const out: UrlCitation[] = []
  for (const r of base) {
    const urlKey = urlJoinKey(r.url)
    if (!urlKey) continue
    const brandIds = (r.mentioned_brands ?? []).map((b) => b.id)
    const competitorBrandNames = brandIds
      .filter((id) => !yours.has(id))
      .map((id) => brandNameById.get(id))
      .filter((n): n is string => !!n)
    out.push({
      url: r.url,
      urlKey,
      domain: hostOf(r.url),
      classification: r.classification,
      title: r.title,
      citationCount: r.citation_count,
      citationRate: r.citation_rate,
      engines: Array.from(enginesByKey.get(urlKey) ?? []),
      mentionedBrandIds: brandIds,
      competitorBrandNames,
      mentionsYourBrand: brandIds.some((id) => yours.has(id)),
    })
  }
  return out
}

function getKey(): string {
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  if (!key) throw new Error('Missing env var: PEEC_AI_CUSTOMER_TOKEN')
  return key
}

async function post<T>(path: string, body: Record<string, unknown>, pid?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(pid ? { project_id: pid } : {}), ...body }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  return res.json()
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function last30() {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29)
  return { start_date: isoDate(start), end_date: isoDate(end) }
}

async function getUrlCitationsImpl(
  clientSlug?: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<UrlCitation[]> {
  let pid: string | undefined
  let yourBrand = ''
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
    yourBrand = config?.peecYourBrand ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return []

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }

  const [baseRes, engineRes, brandsRes] = await Promise.all([
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, limit: 1000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['model_channel_id'], limit: 2000 }, pid),
    post<{ data: ApiBrandNameRow[] }>('/reports/brands', { ...window, limit: 200 }, pid),
  ])
  const brandRows = brandsRes.data ?? []
  const yourBrandIds = resolveYourBrandIds(brandRows, yourBrand)
  const brandNameById = new Map(brandRows.map((b) => [b.brand.id, b.brand.name]))
  return mergeUrlCitations(baseRes.data ?? [], engineRes.data ?? [], yourBrandIds, brandNameById)
}

export const getUrlCitations = cached('peec', 'getUrlCitations', getUrlCitationsImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/peec/url-citations.test.ts`
Expected: `url-citations.test.ts: all assertions passed`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/peec/url-citations.ts lib/peec/url-citations.test.ts
git commit -m "feat(peec): add getUrlCitations for URL-level AI citation data"
```

---

## Task 3: Per-path-per-bot `byPath` on `getAgentAnalytics`

**Files:**
- Modify: `lib/peec/agent-analytics.ts`
- Test: `lib/peec/agent-analytics.test.ts`

Verified shapes: `GET /agent-analytics/visits?group_by=bot_id&group_by=request_path&time_bucket=day` → rows `{ bot_id, time_bucket, request_path, visits }`. `/agent-analytics/bots` → `{data:[{id, provider, type}]}` with `type ∈ {training, search, userQuery, other}`. Approved mapping: `training`→training; `search`+`userQuery`→indexing; `other`→other.

- [ ] **Step 1: Write the failing test** (pure helpers)

Create `lib/peec/agent-analytics.test.ts`:
```ts
// lib/peec/agent-analytics.test.ts
// Run: npx tsx lib/peec/agent-analytics.test.ts
import { strict as assert } from 'node:assert'
import { bucketBotType, aggregateVisitsByPath, type RawVisitRow } from './agent-analytics'

// 4 API types → 3 columns
assert.equal(bucketBotType('training'), 'training')
assert.equal(bucketBotType('search'), 'indexing')
assert.equal(bucketBotType('userQuery'), 'indexing')
assert.equal(bucketBotType('other'), 'other')
assert.equal(bucketBotType(null), 'other')

const catalog = new Map<string, { provider: string; type: string }>([
  ['GPTBot', { provider: 'OpenAI', type: 'training' }],
  ['OAI-SearchBot', { provider: 'OpenAI', type: 'search' }],
])
const visits: RawVisitRow[] = [
  { bot_id: 'GPTBot', request_path: '/Guide/', time_bucket: '2026-06-01 00:00:00', visits: 5 },
  { bot_id: 'GPTBot', request_path: '/Guide/', time_bucket: '2026-06-03 00:00:00', visits: 2 },
  { bot_id: 'OAI-SearchBot', request_path: '/guide', time_bucket: '2026-06-02 00:00:00', visits: 4 },
]
const byPath = aggregateVisitsByPath(visits, catalog)
// '/Guide/' and '/guide' canonicalize to the same key
const entry = byPath['/guide']
assert.equal(entry.totalVisits, 11)
assert.equal(entry.byType.training, 7)
assert.equal(entry.byType.indexing, 4)
assert.equal(entry.byType.other, 0)
// dominant bot first (most visits), lastSeen = max day
assert.equal(entry.bots[0].botId, 'GPTBot')
assert.equal(entry.bots[0].visits, 7)
assert.equal(entry.bots[0].lastSeen, '2026-06-03')
assert.equal(entry.bots[0].provider, 'OpenAI')

console.log('agent-analytics.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/peec/agent-analytics.test.ts`
Expected: FAIL — `bucketBotType` / `aggregateVisitsByPath` not exported.

- [ ] **Step 3: Add the pure helpers + types**

In `lib/peec/agent-analytics.ts`, add near the top of the module (after existing imports — and add `import { urlJoinKey } from '@/lib/url'`):
```ts
export type RawVisitRow = { bot_id: string; request_path: string; time_bucket: string; visits: number }

export type PathBot = {
  botId: string
  provider: string | null
  type: string | null
  visits: number
  lastSeen: string | null
}
export type PathAgg = {
  totalVisits: number
  byType: { training: number; indexing: number; other: number }
  bots: PathBot[]
}

export function bucketBotType(type: string | null): 'training' | 'indexing' | 'other' {
  if (type === 'training') return 'training'
  if (type === 'search' || type === 'userQuery') return 'indexing'
  return 'other'
}

/** Aggregate /agent-analytics/visits rows (grouped by bot_id+request_path+day)
 *  into a per-path map keyed by urlJoinKey(request_path). */
export function aggregateVisitsByPath(
  rows: RawVisitRow[],
  catalog: Map<string, { provider: string; type: string }>,
): Record<string, PathAgg> {
  // key -> path -> bot accumulator
  const paths = new Map<string, Map<string, { visits: number; lastSeen: string }>>()
  for (const r of rows) {
    const key = urlJoinKey(r.request_path)
    if (!key) continue
    const day = r.time_bucket.slice(0, 10)
    if (!paths.has(key)) paths.set(key, new Map())
    const bots = paths.get(key)!
    const cur = bots.get(r.bot_id) ?? { visits: 0, lastSeen: day }
    cur.visits += r.visits
    if (day > cur.lastSeen) cur.lastSeen = day
    bots.set(r.bot_id, cur)
  }
  const out: Record<string, PathAgg> = {}
  for (const [key, bots] of paths) {
    const list: PathBot[] = Array.from(bots.entries())
      .map(([botId, acc]) => ({
        botId,
        provider: catalog.get(botId)?.provider ?? null,
        type: catalog.get(botId)?.type ?? null,
        visits: acc.visits,
        lastSeen: acc.lastSeen || null,
      }))
      .sort((a, b) => b.visits - a.visits)
    const byType = { training: 0, indexing: 0, other: 0 }
    let total = 0
    for (const b of list) { byType[bucketBotType(b.type)] += b.visits; total += b.visits }
    out[key] = { totalVisits: total, byType, bots: list }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/peec/agent-analytics.test.ts`
Expected: `agent-analytics.test.ts: all assertions passed`

- [ ] **Step 5: Add `byPath` to `AgentAnalyticsData` and wire the `/visits` fetch**

5a. Extend the interface (`AgentAnalyticsData`, currently ending ~line 107). Add field:
```ts
  /** Per-path-per-bot crawl breakdown, keyed by urlJoinKey(request_path). */
  byPath: Record<string, PathAgg>
```

5b. In `getAgentAnalyticsImpl`, add a fetch for visits. The existing `agentGet` takes a flat `Record<string,string>` and cannot emit repeated `group_by` params — add a dedicated fetch. Insert this helper near `getBotCatalog`:
```ts
async function fetchVisitRows(projectId: string, start: string, end: string): Promise<RawVisitRow[]> {
  const url = new URL(`${BASE_URL}/agent-analytics/visits`)
  url.searchParams.set('project_id', projectId)
  url.searchParams.set('start_date', start)
  url.searchParams.set('end_date', end)
  url.searchParams.append('group_by', 'bot_id')
  url.searchParams.append('group_by', 'request_path')
  url.searchParams.set('time_bucket', 'day')
  url.searchParams.set('limit', '10000')
  const res = await fetch(url.toString(), { headers: { 'X-API-Key': getKey() }, cache: 'no-store' })
  if (!res.ok) return []   // degrade: byPath stays empty, never throws the whole report
  const json = await res.json() as { data?: RawVisitRow[] } | RawVisitRow[]
  return Array.isArray(json) ? json : (json.data ?? [])
}
```
(`BASE_URL` and `getKey` already exist in this file; confirm with `grep -n "const BASE_URL\|function getKey" lib/peec/agent-analytics.ts`.)

5c. In `getAgentAnalyticsImpl`, add `fetchVisitRows` to the parallel fetch and build `byPath`. Change the existing `Promise.all([...])` (lines ~208-214) to include it:
```ts
  const [logsResult, catalog, visitRows] = await Promise.all([
    agentGet<{ data?: RawLog[] } | RawLog[]>(
      '/agent-analytics/logs',
      { project_id: projectId, start_date, end_date, limit: '10000' },
    ),
    getBotCatalog(projectId),
    fetchVisitRows(projectId, start_date, end_date),
  ])
```
Then before the final `return {`, add:
```ts
  const byPath = aggregateVisitsByPath(visitRows, catalog)
```
And add `byPath,` to the returned object literal.

Note: `getBotCatalog` returns the catalog already used for display names; confirm its value type exposes `provider` and `type` (it wraps the `/bots` rows `{id, provider, type}`). If the catalog map value is `RawBotCatalog`, pass it directly — `aggregateVisitsByPath` only reads `.provider` and `.type`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `getBotCatalog`'s map value type differs, adjust the `catalog` param type of `aggregateVisitsByPath` to match — e.g. `Map<string, RawBotCatalog>` — keeping `.provider`/`.type` reads.)

- [ ] **Step 7: Optional live smoke check**

Run: `PEEC_AI_PROJECT_ID=or_043ae735-9397-48cf-a754-6e346a55f394 npx tsx --env-file=.env.local scripts/probe-peec-urls-agents.ts`
Expected: the `/agent-analytics/visits` section prints rows `{bot_id, time_bucket, request_path, visits}` (confirms the live shape this task consumes).

- [ ] **Step 8: Commit**

```bash
git add lib/peec/agent-analytics.ts lib/peec/agent-analytics.test.ts
git commit -m "feat(peec): add per-path-per-bot byPath to getAgentAnalytics"
```

---

## Task 4: PageOverlapTable — real `aiCitations` + indexing/training visits

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit-tables.tsx`

Depends on: T2 (`UrlCitation`), T3 (`byPath`). **Shares file with T5 — do not run concurrently with T5.**

- [ ] **Step 1: Add the `urlCitations` prop**

Add an import at the top of the file:
```ts
import type { UrlCitation } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'
```
Extend `PageOverlapTableProps` (currently `{ agentData, sfData, clientDomain, demoMode? }`):
```ts
export interface PageOverlapTableProps {
  agentData: AgentAnalyticsData
  sfData: SFData
  clientDomain: string
  urlCitations?: UrlCitation[]
  demoMode?: boolean
}
```
Update the destructure in the function signature:
```ts
export function PageOverlapTable({ agentData, sfData, clientDomain, urlCitations = [], demoMode = false }: PageOverlapTableProps) {
```

- [ ] **Step 2: Build a citation lookup and replace the demo-only fields**

Immediately before `const rows: PageOverlapRow[] = agentData.topPaths...` (line ~397), add:
```ts
  const citeByKey = new Map(urlCitations.map((c) => [c.urlKey, c]))
```
Then replace the three demo-only lines (current lines ~410-412):
```ts
      aiCitations:      demoMode ? demoCites[idx % demoCites.length]       : null,
      aiIndexingVisits: demoMode ? demoIndex[idx % demoIndex.length]       : null,
      aiTrainingVisits: demoMode ? demoTraining[idx % demoTraining.length] : null,
```
with:
```ts
      aiCitations:      demoMode ? demoCites[idx % demoCites.length]
                                 : (citeByKey.get(urlJoinKey(fullUrl) ?? '')?.citationCount ?? null),
      aiIndexingVisits: demoMode ? demoIndex[idx % demoIndex.length]
                                 : (agentData.byPath[urlJoinKey(p.path) ?? '']?.byType.indexing ?? null),
      aiTrainingVisits: demoMode ? demoTraining[idx % demoTraining.length]
                                 : (agentData.byPath[urlJoinKey(p.path) ?? '']?.byType.training ?? null),
```
Leave `humanFromAI` and `changeSinceLastCrawl` exactly as-is (out of scope — they stay `null` in non-demo).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/technical-audit-tables.tsx
git commit -m "feat(aeo): wire real AI citations + indexing/training visits into PageOverlapTable"
```

---

## Task 5: LogAnomaliesTable — real platform / botType / lastSeen

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit-tables.tsx`

Depends on: T3 (`byPath`). **Shares file with T4 — serialize (do T4 then T5, or one agent).**

- [ ] **Step 1: Replace the demo-only fields with dominant-bot lookup**

In `LogAnomaliesTable` (rows built ~line 586), inside the `.map((p, idx) => {`, before the `return {`, add:
```ts
    const pathAgg = agentData.byPath[urlJoinKey(p.path) ?? '']
    const topBot = pathAgg?.bots[0] ?? null   // bots sorted by visits desc
    const lastSeenReal = pathAgg
      ? pathAgg.bots.reduce<string | null>((max, b) => (b.lastSeen && (!max || b.lastSeen > max) ? b.lastSeen : max), null)
      : null
```
Then replace the three demo-only lines (current ~599-606):
```ts
      platform: demoMode ? demoPlatforms[idx % demoPlatforms.length] : null,
      botType:  demoMode ? demoBotTypes[idx % demoBotTypes.length]   : null,
      ...
      lastSeen:   demoMode ? demoLastSeen[idx % demoLastSeen.length] : null,
```
with:
```ts
      platform: demoMode ? demoPlatforms[idx % demoPlatforms.length] : (topBot?.provider ?? null),
      botType:  demoMode ? demoBotTypes[idx % demoBotTypes.length]   : (topBot?.type ?? null),
      ...
      lastSeen:   demoMode ? demoLastSeen[idx % demoLastSeen.length] : lastSeenReal,
```
(`urlJoinKey` is already imported in T4. If T5 is somehow done first, add `import { urlJoinKey } from '@/lib/url'`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/technical-audit-tables.tsx
git commit -m "feat(aeo): wire real platform/botType/lastSeen into LogAnomaliesTable"
```

---

## Task 6: Technical Audit RSC — fetch citations, thread prop

**Files:**
- Modify: `components/report-sections/peec-ai/technical-audit.tsx`

Depends on: T2 (`getUrlCitations`) and T4 (the new `urlCitations` prop). **Do after T4/T5.**

- [ ] **Step 1: Import and fetch**

Add import near the other lib imports (top of file):
```ts
import { getUrlCitations } from '@/lib/peec/url-citations'
```
Add `getUrlCitations(clientSlug)` to the existing `Promise.allSettled` (currently `[getSFData, getSitebulbData, getAgentAnalytics]`, ~line 299):
```ts
  const [sfResult, sitebulbResult, agentResult, urlCitationsResult] = await Promise.allSettled([
    getSFData(clientSlug),
    getSitebulbData(clientSlug),
    getAgentAnalytics(clientSlug),
    getUrlCitations(clientSlug),
  ])
```
After the existing result unpacking, add:
```ts
  let urlCitations = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
```
In the `if (demoMode) {` block (~line 313) add:
```ts
    urlCitations = []   // demo: PageOverlapTable uses its own demo arrays
```

- [ ] **Step 2: Pass the prop**

Update the `PageOverlapTable` usage (~line 444):
```ts
        <PageOverlapTable agentData={agentData} sfData={sfData} clientDomain={clientDomain} urlCitations={urlCitations} demoMode={demoMode} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/technical-audit.tsx
git commit -m "feat(aeo): fetch URL citations and pass into Technical Audit tables"
```

---

## Task 7: Content Impact §B — real `aiCitations`

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

Depends on: T2. **Shares file with T8 — serialize.**

- [ ] **Step 1: Fetch citations in the RSC**

Add import:
```ts
import { getUrlCitations } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'
```
Add `getUrlCitations(clientSlug)` to the `Promise.allSettled` (currently `[getPeecOverview, getAgentAnalytics, getContentCalendarData, ga4Query]`, ~line 172):
```ts
  const [peecResult, agentResult, calendarResult, ga4Result, urlCitationsResult] = await Promise.allSettled([
    getPeecOverview(clientSlug),
    getAgentAnalytics(clientSlug),
    getContentCalendarData(clientSlug),
    ga4Query({ clientSlug, dateRange: dateRange ?? 'last_30_days',
      metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
      dimensions: ['pagePath'], limit: 1000 }),
    getUrlCitations(clientSlug),
  ])
```
After the existing unpacking (~line 188), add:
```ts
  let urlCitations = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
```
In the `if (demoMode) {` block (~line 195), add:
```ts
    urlCitations = []   // demo: §B/§F/§H use their own demo arrays
```
After the derived-metrics block, add a shared lookup (near line ~217):
```ts
  const citeByKey = new Map(urlCitations.map((c) => [c.urlKey, c]))
```

- [ ] **Step 2: Replace §B `aiCitations`**

At the §B row builder (current line ~351):
```ts
            aiCitations: calendarIsDemo ? sectionBDemoCite[i % 13] : null,
```
replace with:
```ts
            aiCitations: calendarIsDemo ? sectionBDemoCite[i % 13]
                                        : (citeByKey.get(urlJoinKey(row.url) ?? '')?.citationCount ?? null),
```
(`row.url` is the content-calendar row URL. Leave `aiReferredSessions` as-is — GA4, out of scope.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "feat(aeo): wire real AI citations into Content Impact section B"
```

---

## Task 8: Content Impact §F engines/cluster + §H competitor URLs

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

Depends on: T2 and T7 (uses the `citeByKey`/`urlCitations` added in T7). **Do after T7 (same file).**

§F rows are currently per **owned domain** (`ownDomains`), so engines are aggregated across the URLs of each owned domain. §H surfaces competitor-cited URLs (rows where `mentionsYourBrand === false`).

- [ ] **Step 1: §F — real `aiEnginesCiting` (aggregate engines per owned domain)**

Before the §F `ownedRows` builder (~line 507), add an engines-by-domain aggregation:
```ts
        const enginesByDomain = new Map<string, Set<string>>()
        for (const c of urlCitations) {
          if (!c.mentionsYourBrand) continue
          if (!enginesByDomain.has(c.domain)) enginesByDomain.set(c.domain, new Set())
          for (const e of c.engines) enginesByDomain.get(c.domain)!.add(e)
        }
```
Replace the §F `aiEnginesCiting` line (current ~512):
```ts
          aiEnginesCiting: calendarIsDemo ? demoEngines[i % demoEngines.length] : null,
```
with:
```ts
          aiEnginesCiting: calendarIsDemo ? demoEngines[i % demoEngines.length]
            : (enginesByDomain.get(d.domain)?.size ? Array.from(enginesByDomain.get(d.domain)!).join(', ') : null),
```
Leave `topic`, `promptCluster`, `averagePosition`, `aiReferredSessions` as-is. (`promptCluster`/`topic` need the `tag_id`/`topic_id` dimension — a follow-up extension of `getUrlCitations`; `averagePosition` is the deferred Get-Chat follow-up; `aiReferredSessions` is GA4.)

- [ ] **Step 2: §H sub-view 2 "Brand-Absent Editorial URLs" — real competitor-cited URLs**

This sub-view renders `<CompetitorUrlsBrandAbsentTable>` from `h2Rows`, currently a per-owned-domain demo map producing rows of shape:
`{ domain, articleTitle, url, promptCluster, citationCount, competitorsMentioned, brandMentioned, opportunityPriority, suggestedPRAngle }` (see the object literal at ~line 694-704).

Replace the `h2Rows` builder body so that, when NOT in demo mode, it maps real competitor-cited URLs instead of owned domains. Inside the §H sub-view 2 IIFE, compute the real list and branch:
```ts
            const competitorCitedUrls = urlCitations
              .filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
              .sort((a, b) => b.citationCount - a.citationCount)
              .slice(0, 10)

            const h2Rows = calendarIsDemo
              ? /* keep the EXISTING demo `.map((d, i) => { ... return {…} })` block unchanged */ demoH2Rows
              : competitorCitedUrls.map((c) => ({
                  domain: c.domain,
                  articleTitle: c.title,
                  url: c.url,
                  promptCluster: null,                       // needs tag_id dimension (follow-up)
                  citationCount: c.citationCount,
                  competitorsMentioned: c.competitorBrandNames.join(', ') || null,
                  brandMentioned: 'No',
                  opportunityPriority: 'Review',
                  suggestedPRAngle: `Secure coverage on ${c.domain} to displace competitor citations`,
                }))
```
Implementation detail: keep the existing demo `.map(...)` exactly as-is but assign it to a `const demoH2Rows = (...)` (or inline it in the `calendarIsDemo ?` branch). Do not delete the demo arrays. The row object keys must match the demo literal so `CompetitorUrlsBrandAbsentTable` typechecks.

Then update the caveat note (~line 712-715): since URL-level data now exists, change it to only mention the still-missing field:
```tsx
              {!calendarIsDemo && (
                <p className="text-[10px] text-text-muted">
                  Prompt Cluster requires tag-level citation data from Peec AI (follow-up).
                </p>
              )}
```

Leave §H sub-view 3 "Repeated Competitor Pages" as-is for this task (it aggregates by theme/cluster, which needs the tag dimension — a follow-up). Note this explicitly in the commit body.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in the edited files.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "feat(aeo): wire real engines + competitor-cited URLs into Content Impact"
```

---

## Final verification (after all tasks)

- [ ] All unit tests pass:
```bash
npx tsx lib/url.test.ts && npx tsx lib/peec/url-citations.test.ts && npx tsx lib/peec/agent-analytics.test.ts
```
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.
- [ ] `npm run build` succeeds.
- [ ] Spot-check against a real client (non-demo) that previously showed `--` in PageOverlap AI Citations / Indexing / Training and LogAnomalies Platform/BotType/LastSeen now show values; confirmed-out-of-scope fields (`humanFromAI`, `changeSinceLastCrawl`, §F `averagePosition`, `aiReferredSessions`) remain `--`.

## Notes on what intentionally stays `--` (not regressions)

- `humanFromAI`, content-impact `aiReferredSessions` → GA4 (separate task)
- `changeSinceLastCrawl` → Screaming Frog page-level diff (separate task)
- §F `averagePosition` → Get-Chat `citationPosition` (deferred follow-up doc)
- §F `topic` / `promptCluster` → need `tag_id`/`topic_id` dimension on `getUrlCitations` (small follow-up; not in this plan)
