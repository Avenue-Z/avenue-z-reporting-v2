# AEO Overview v2 — Slice 2 (02 · Visibility vs Competitors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section 02 of the v2 Overview, for Peec and Profound: a year-to-date trend chart with one line per brand, a checkbox legend and a Show competitors switch, and directly under it a brand table with Visibility, Share of voice and Used as a source %, each with its own Δ column, the client pinned as a last row when it falls outside the top 10.

**Architecture:** Two new part versions, `visibility-chart@2` and `brand-rankings@2`. Each part's `render` stays synchronous and returns an async server child behind `Suspense` + `ReportErrorBoundary` (the `competitor-gaps.tsx` pattern). The child calls one provider-neutral loader, `getVisibilityV2(provider, clientSlug, dateRange, compareMode)`, wrapped in React `cache()` so both parts share one fetch per render; it dispatches to a new cached fetcher per provider (`lib/peec/visibility-v2.ts`, `lib/profound/visibility-v2.ts`). `getPeecOverview` / `getProfoundOverview` are **not** changed in behavior or cache key, so v1 pages, the v1 cache and the cache warmer are untouched. `lib/peec/client.ts` and `lib/profound/client.ts` change only to export helpers the new fetchers reuse.

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript strict, Tailwind v4, vitest + @testing-library/react (jsdom), `unstable_cache` via `lib/cache.ts`.

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (on `origin/docs/aeo-overview-v2-spec`): section 6 "02 · Visibility vs Competitors", 5.3 (units), 7 (prompt scope), 10 (edge cases), 9 (Tina's answers). Slice 1 plan for conventions: `docs/superpowers/plans/2026-11-25-aeo-overview-v2-slice-1-foundation.md`. Live-check record: section "Vendor facts" below.

**Where to work:** build starts only after slice 1 (PR #532) is merged into `dev`. Fresh worktree outside `.claude/` (memory: `check:rsc` skips `/.claude/` paths; a symlinked `node_modules` breaks `next build`):

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-visibility /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice2 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice2 && npm ci && cp ../reporting-dashboard-renaissance/.env.local .
```

Mockup screenshots: the spec says each slice plan attaches the Glean mockup section it builds. This plan was written without Glean access; Paul attaches the "Visibility vs Competitors" screenshots to the feature PR description before review.

## Vendor facts (live, read-only, 2026-11-25)

Renaissance = Peec project `or_60dbe88c-…`; Avenue Z = Profound category `8cf8471d-…` (both from the dev DB `clients` rows).

- **Peec `GET /brands?project_id=&limit=1000`** → `{ data, total_count, totalCount }`; row `{ id, name, domains: string[], aliases, regex, is_own, color }`. 29 brands for Renaissance. Renaissance `domains: ["renaissancebenefits.com","tenncare.renaissancebenefits.com"]`, `is_own: true`. Peec's own `color` values collide (Renaissance and Reliance Matrix are both `#f59e0b`), so they are not used. **Data issue for Paul:** UnitedHealthcare's domain in Peec is `whalewisdom.com` (its Used as a source % reads 0 until fixed in Peec); Dearborn Group's `dearborngroup.com` has no domain row this window.
- **Peec `POST /reports/domains`** row: `domain, classification, retrieved_percentage, retrieved_chat_count, total_chat_count, citation_count, retrieval_count, cited_chat_count, …, mentioned_brands`. `total_chat_count` is the window's answer count, the same on every row (8,981 for 25 Oct–23 Nov). Used as a source % for a brand with one matching row = `retrieved_chat_count / total_chat_count` = `retrieved_percentage` (Renaissance 3,294 / 8,981 = **36.68%**). Every Renaissance brand matches at most one row today. A `dimensions: ['chat_id']` call filtered `{ field: 'domain', operator: 'in', values }` returns one row per (domain, chat) with `domain` and `chat.id` (13,012 rows, 2.6 s for all 27 matched domains), which gives distinct answers when a brand has several rows.
- **Peec `POST /reports/brands` with `dimensions: ['date']`** returns one row per (brand, day): the YTD rows the v1 chart already fetches carry all 29 brands (v1 filters them to "you" and pooled competitors). About 9,500 rows by late November; **`fetchAllRows` stops at 10,000**, which a 29-brand project passes in late December (365 × 29 = 10,585). The v2 fetch raises the ceiling.
- **Profound returns dimensions AND metrics in alphabetical order**, not request order: `info.query.metrics` for `['visibility_score','share_of_voice','average_position']` comes back `['average_position','share_of_voice','visibility_score']`, and `info.query.dimensions` for `['date','asset_name']` is `['asset_name','date']`. Every v2 Profound read goes through a parser keyed on `info.query` names (Task 3).
- **Profound `/v1/reports/visibility` by `asset_name`** returns every brand any answer mentioned (4,107 rows for Avenue Z), sorted by the first alphabetical metric. The tracked brands are the category's assets: **`GET /v1/org/categories/{id}/assets`** → a bare array of `{ id, name, website, alternate_domains: string[] | null, is_owned, created_at, logo_url }` (Avenue Z: Avenue Z (owned, `avenuez.com`), First Page Sage, iPullRank, OMNISCIENT). Filter `{ field: 'asset_name', operator: 'in', value: [names] }` returns exactly those 4. Visibility and SoV are 0–1 fractions.
- **Profound YTD `['date','asset_name']`** filtered to the 4 assets: 1,008 rows. Unfiltered it is 134,808 rows (the v1 call takes the first 2,000).
- **Profound prompt scope (spec 7):** the category has 144 prompts: 75 `analysis_types: ["visibility"]`, 29 sentiment (`sentiment_v2`), 40 `accuracy`. `prompt_type` is deprecated in favour of `analysis_type`; values are lowercase `visibility` / `sentiment`. `/v1/reports/visibility` covers **only the 75 visibility prompts by construction** and **rejects** a `prompt_type`/`analysis_type` filter (422). `/v1/reports/citations` covers **all 144** unless filtered: `{ field: 'analysis_type', operator: 'is', value: 'visibility' }` returns exactly the 75 (the deprecated `prompt_type` filter does the same). `/v2/reports/sentiment` covers only the 29 sentiment prompts by construction; `/v1/reports/sentiment` now returns 422 for any date on or after 2026-07-09 (slice 6's concern).
- **Profound Used as a source:** there is no per-answer retrieval metric. `/v1/reports/citations` gives `citation_share` (share of all citations) and `count` per hostname. Per-answer share is only computable from `/v1/prompts/answers` (19,051 answers for the window, ~8 MB per 10,000 rows, ~10 s per page): too heavy for a render. Avenue Z for comparison, visibility prompts: answers citing avenuez.com 6.6% vs its citation share.

## Global Constraints

- v1 output must not change: no `-u` on any existing golden/snapshot; `parity.golden.test.tsx` and every `parts/*.golden.test.tsx` stay green untouched. `getPeecOverview` / `getProfoundOverview` keep their behavior and cache `version`.
- Peec uses all prompts. Profound visibility metrics use Visibility-type prompts (the visibility report already does; every citations call adds `filters: [{ field: 'analysis_type', operator: 'is', value: 'visibility' }]`). Sentiment, when a later slice shows it, uses Sentiment-type prompts (the sentiment report already does).
- Units (spec 5.3): Visibility, Share of voice, Used as a source % change in `pts` (`formatDelta(v, 'pts')`, `betterWhen: 'higher'`). No prior value → `–` with "No comparison data" (`deltaColumn` already does this), never 0.
- Every prior figure uses the page's one comparison window: `fetchCompareMode(ctx.compare)`. No part computes its own window.
- Show deltas off (`ctx.showDeltas === false`) removes every Δ column and the comparison shading.
- Client line/row color `#60FDFF` (`CHART_COLORS.primary`). Delta colors come from `deltaColumn` only.
- `'use client'` only on files with hooks/state; client components get plain data, never function props from a server component (`npm run check:rsc`). No `any`.
- New v2 fetchers: `cached()` with `healthCritical: false` (a failed v2 part shows its own error card; it must not page Slack while the page is staging-only), `extractTags: ([, clientSlug]) => ({ client: clientSlug })`.

## Review Focus

1. **A brand with domains but no domain row** (Dearborn Group) and **a brand with no domains at all.** Expect `0.0%` for the first, `–` for the second. Test: Task 2 (`usedAsSourceByBrand` cases).
2. **A brand new this period** (no row in the prior window). Expect `–` in its three Δ cells, not `0.0 pts` (v1 fabricates 0 by falling back to the current value). Test: Task 4 (`peec brand rows`) and Task 5 (`profound brand rows`).
3. **`aeoTrend` hand-edited or stale** (`aeoTrend=nope,guardian,,GUARDIAN`, nine keys, a brand dropped from the roster). Expect known keys only, at most 7 competitors, falling back to the default when none survive. Test: Task 6 (`parseTrendParam`).
4. **A comparison window outside the YTD chart** (Same period last year; a January range whose previous period is last December). Expect the band drawn only where it overlaps the chart, nothing when it doesn't, no throw. Test: Task 7 (`shadeRange`).
5. **The client ranks #14 of 29.** Expect 10 rows plus a set-apart 11th row `#14 Renaissance`; no pinned row after "See all"; no pinned row when the client is in the top 10 or not identified. Test: Task 8 (`pinnedRow`).

---

### Task 1: Rank deltas round half away from zero

**Files:**
- Modify: `components/report-sections/peec-ai/v2/delta.ts` (`roundForUnit`)
- Test: `components/report-sections/peec-ai/v2/delta.test.ts`

**Interfaces:**
- Produces: `roundForUnit` places branch = `Math.sign(value) * Math.round(Math.abs(value))`. Average positions are fractional, so a ±0.5 rank delta is common (slice 3's Rank Δ is the first consumer); `Math.round(-0.5)` is `-0`, which printed `0 places` for a drop and `↑ 1 place` for the same-size rise.

- [ ] **Step 1: Write the failing tests**

```ts
test.each([
  [0.5, '↑ 1 place'], [-0.5, '↓ 1 place'], [1.5, '↑ 2 places'], [-1.5, '↓ 2 places'], [-0.49, '0 places'],
])('formatDelta(%s, places) = %s', (v, want) => expect(formatDelta(v, 'places')).toBe(want))
test('deltaTone agrees with the rounded places value', () => {
  expect(deltaTone(-0.5, 'higher', 'places')).toBe('bad')
  expect(deltaTone(0.5, 'higher', 'places')).toBe('good')
  expect(deltaTone(-0.49, 'higher', 'places')).toBe('neutral')
})
```

- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/delta.test.ts` — Expected: FAIL on `-0.5` and `-1.5`.
- [ ] **Step 3: Implement** the one-line change.
- [ ] **Step 4: Run** the same command — Expected: PASS (existing cases unchanged).
- [ ] **Step 5: Commit** `fix(aeo-v2): rank deltas round half away from zero`

---

### Task 2: Peec building blocks (exports, roster, Used as a source %)

**Files:**
- Modify: `lib/peec/client.ts` (exports only; hoist `normalizeSource` out of `getPeecOverviewImpl` to module scope unchanged; `fetchAllRows` gains `maxRows`)
- Create: `lib/peec/roster.ts`, `lib/aeo/v2/used-as-source.ts`
- Test: `lib/aeo/v2/used-as-source.test.ts`

**Interfaces:**
- Produces (`lib/peec/client.ts`, all existing code, newly exported):
  - `peecPost`, `peecGet`, `aggregateBrandRows`, `aggToMetrics`, `normalizeSource(id: string): AEOModel | null`, types `ApiBrandRow`, `ApiDomainRow` (add `retrieved_chat_count: number`, `total_chat_count: number` already present; add `chat?: { id: string }`).
  - `fetchAllRows(body, projectId?, maxRows = 10_000)`: loop condition `offset < maxRows`. The v1 call site passes nothing, so v1 is unchanged.
- Produces (`lib/peec/roster.ts`):
  - `type PeecRosterBrand = { id: string; name: string; isOwn: boolean; domains: string[] }`
  - `getPeecRoster(projectId: string): Promise<PeecRosterBrand[]>` — `peecGet('/brands', { limit: '1000' }, projectId)`, `domains ?? []`; `cached('peec', 'getRoster', …, { version: 'v1', ttlSeconds: 86_400, healthCritical: false })`.
- Produces (`lib/aeo/v2/used-as-source.ts`, pure):
  - `type DomainShareRow = { domain: string; answers: number; totalAnswers: number }`
  - `brandDomainRows(domains: readonly string[], rows: readonly DomainShareRow[]): DomainShareRow[]` — match with `bareDomain` + `sameOrSubdomain` from `lib/aeo-outbound/own-rows.ts` (the same match the AEO outbound report uses).
  - `usedAsSourceByBrand(brands: readonly { name: string; domains: readonly string[] }[], rows: readonly DomainShareRow[], distinct?: ReadonlyMap<string, number>): Map<string, number | null>` — per brand: no domains → `null`; no `rows` at all (window empty) → `null`; no matching row → `0`; one row → `answers / totalAnswers * 100`; several rows → `distinct.get(name) / totalAnswers * 100`, or `null` when `distinct` lacks the brand (never a sum: answers that retrieved two of a brand's domains would count twice).
  - `multiRowBrands(brands, rows): { name: string; domains: string[] }[]` — brands with more than one matching row, with the matched row domains.
  - `distinctAnswersByBrand(multi: { name: string; domains: string[] }[], chatRows: readonly { domain: string; chat?: { id: string } }[]): Map<string, number>` — distinct `chat.id` per brand over its matched domains.

- [ ] **Step 1: Write the failing tests**, after adding `'lib/aeo/v2/**/*.test.{ts,tsx}'` and `'lib/peec/visibility-v2.test.ts'` to the `include` allowlist in `vitest.config.ts` (it lists `lib/peec` tests one by one and has no `lib/aeo` glob, so a new test there is silently skipped; `lib/profound/**` and `lib/export/**` are already globbed). `rows` = `[{domain:'renaissancebenefits.com',answers:3294,totalAnswers:8981},{domain:'guardianlife.com',answers:1855,totalAnswers:8981},{domain:'www.metlife.com',answers:600,totalAnswers:8981},{domain:'investor.metlife.com',answers:500,totalAnswers:8981}]`.
  - `usedAsSourceByBrand`: Renaissance (`['renaissancebenefits.com','tenncare.renaissancebenefits.com']`) → `≈ 36.68`; Guardian → `≈ 20.65`; Dearborn (`['dearborngroup.com']`) → `0`; NoDomains (`[]`) → `null`; MetLife (`['metlife.com']`) without `distinct` → `null`, with `distinct = new Map([['MetLife', 900]])` → `≈ 10.02`; any brand with `rows = []` → `null`.
  - `multiRowBrands` → `[{ name: 'MetLife', domains: ['www.metlife.com','investor.metlife.com'] }]`.
  - `distinctAnswersByBrand`: chat rows `c1` on both MetLife domains, `c2` on one → `MetLife: 2`.
- [ ] **Step 2: Run** `npx vitest run lib/aeo/v2/used-as-source.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** the test, then `npx vitest run components/report-sections/peec-ai lib/peec` — Expected: PASS, no snapshot changes.
- [ ] **Step 5: Commit** `feat(aeo-v2): Peec roster and per-brand Used as a source`

---

### Task 3: Profound building blocks (named rows, pagination, assets)

**Files:**
- Modify: `lib/profound/client.ts` (export `profoundGet(path: string): Promise<unknown>`, the GET twin of `profoundPost`, 1 h revalidate)
- Create: `lib/profound/report-rows.ts`, `lib/profound/assets.ts`
- Test: `lib/profound/report-rows.test.ts`

**Interfaces:**
- Produces (`report-rows.ts`):
  - `type ProfoundNamedRow = { dims: Record<string, string | null>; metrics: Record<string, number> }`
  - `profoundRows(res: { info: Record<string, unknown>; data: { dimensions: (string | null)[]; metrics: number[] }[] }): ProfoundNamedRow[]` — names columns from `info.query.dimensions` / `info.query.metrics` (the order Profound actually used). Throws `Error('[profound] response has no info.query; cannot name its columns')` when either list is missing or its length differs from a row's, so a shape change fails loud instead of misreading.
  - `profoundPostAll(path: string, body: Record<string, unknown>, maxRows = 50_000): Promise<ProfoundNamedRow[]>` — pages with `pagination: { limit: 10_000, offset }` until a page is shorter than 10,000 or `info.total_rows` is reached; logs `[profound] <path> truncated at <maxRows> rows` and stops at `maxRows`.
  - `visibilityPromptsOnly = [{ field: 'analysis_type', operator: 'is', value: 'visibility' }] as const` — the citations filter for spec 7.
- Produces (`assets.ts`):
  - `type ProfoundAsset = { name: string; website: string | null; alternateDomains: string[]; isOwned: boolean }`
  - `getProfoundAssets(categoryId: string): Promise<ProfoundAsset[]>` — `profoundGet('/v1/org/categories/${categoryId}/assets')` (a bare array), `cached('profound', 'getAssets', …, { version: 'v1', ttlSeconds: 86_400, healthCritical: false })`.
  - `assetDomains(a: ProfoundAsset): string[]` — `[website, ...alternateDomains]` without empties.

- [ ] **Step 1: Write the failing tests**
  - `names columns from info.query, not request order`: response `{ info: { query: { dimensions: ['asset_name','date'], metrics: ['average_position','share_of_voice','visibility_score'] } }, data: [{ dimensions: ['Avenue Z','2026-11-01'], metrics: [4.72, 0.0224, 0.1859] }] }` → `[{ dims: { asset_name: 'Avenue Z', date: '2026-11-01' }, metrics: { average_position: 4.72, share_of_voice: 0.0224, visibility_score: 0.1859 } }]`.
  - `throws without info.query`, and `throws when a row has more metrics than names`.
  - `profoundPostAll pages until short page` (mock `profoundPost` via `vi.mock('./client')`: page 1 = 10,000 rows, page 2 = 3 rows → 10,003 rows; second call's body has `pagination: { limit: 10000, offset: 10000 }`).
  - `assetDomains({ website: 'avenuez.com', alternateDomains: ['avenuez.co'] })` → both; `website: null` → `[]`.
- [ ] **Step 2: Run** `npx vitest run lib/profound/report-rows.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npx vitest run lib/profound` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): Profound named rows, pagination and tracked assets`

---

### Task 4: Visibility v2 data, Peec

**Files:**
- Create: `lib/aeo/v2/types.ts`, `lib/peec/visibility-v2.ts`
- Test: `lib/peec/visibility-v2.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (`lib/aeo/v2/types.ts`; slices 3 and 5 add their own types to this file):
  - `type AeoV2Provider = 'peec' | 'profound'`
  - `type CompareMode = 'previous_period' | 'previous_year'`
  - `type UsedAsSourceBasis = 'answers' | 'citations'`
  - `type BrandRowV2 = { name: string; isYou: boolean; rank: number; visibility: number; visibilityPrior: number | null; sov: number; sovPrior: number | null; usedAsSource: number | null; usedAsSourcePrior: number | null }` (percent values, 0–100)
  - `type BrandTrend = { name: string; isYou: boolean; points: DailyPoint[] }`
  - `type VisibilityV2 = { roster: string[]; brands: BrandRowV2[]; trend: BrandTrend[]; usedAsSourceBasis: UsedAsSourceBasis }` — `roster` = every tracked brand name (drives colors); `brands` sorted by visibility desc, `rank` 1..n; `trend` holds every brand with at least one point.
- Produces (`lib/peec/visibility-v2.ts`):
  - `getPeecVisibilityV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<VisibilityV2>`, `cached('peec', 'getVisibilityV2', impl, { version: 'v1', healthCritical: false, … })`.
  - Pure, exported for tests: `buildPeecBrandRows(current: ApiBrandRow[], prior: ApiBrandRow[], used: Map<string, number | null>, usedPrior: Map<string, number | null>, yourBrand: string): BrandRowV2[]`.
- Impl: resolve `pid` / `yourBrand` / windows exactly as `getPeecOverviewImpl` does (`peecYourBrand ?? PEEC_AI_YOUR_BRAND`; `deriveCompareRange(range, compareMode) ?? mainDates`; YTD = 1 Jan of today's year → today). `Promise.all`: `getPeecRoster(pid)`, `/reports/brands` current and prior, `/reports/domains` current and prior (`limit: 10_000`; warn `[peec] domains report hit 10000 rows` when full), `fetchAllRows({ ...ytd, dimensions: ['date'] }, pid, 20_000)`. Then, per window, `multiRowBrands`; only when it is non-empty, one `/reports/domains` call with `dimensions: ['chat_id']`, `filters: [{ field: 'domain', operator: 'in', values }]`, `limit: 10_000` paged by `offset`, fed to `distinctAnswersByBrand`. Metrics per brand use `aggregateBrandRows` + `aggToMetrics` (the same math as v1's brand table and KPI tile, so the numbers agree). `isYou` = v1's rule, `name.toLowerCase().includes(yourBrand.toLowerCase())`, false when `yourBrand` is empty. `trend`: the YTD rows grouped per brand name into `DailyPoint`s (`visibility_count / visibility_total * 100` per day). `usedAsSourceBasis: 'answers'`.

- [ ] **Step 1: Write the failing tests** for `buildPeecBrandRows` (`yourBrand = 'Renaissance'`; current rows Guardian 300/1000 + SoV .2, Renaissance 200/1000 + SoV .1, NewCo 50/1000; prior rows Guardian 250/1000, Renaissance 220/1000; NewCo absent):
  - order and rank: Guardian #1, Renaissance #2, NewCo #3; `isYou` only on Renaissance.
  - `visibilityPrior`: Guardian 25, Renaissance 22, **NewCo `null`** (and `sovPrior` null).
  - `usedAsSource` comes from the map; a brand missing from the map → `null`.
  - with `yourBrand = ''` nobody `isYou`.
  - one impl test with `peecPost`/`peecGet`/`fetchAllRows` mocked (`vi.mock('./client', …importOriginal)`) and `getClientBySlug` mocked: no `chat_id` call when every brand has ≤ 1 domain row; exactly one per window when one does; `fetchAllRows` called with `maxRows` 20,000.
- [ ] **Step 2: Run** `npx vitest run lib/peec/visibility-v2.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Live check (read-only)**, scratchpad script, `CACHE_DISABLE=1 npx tsx --tsconfig ./tsconfig.json --env-file=.env.local <scratch>/peec-vis.ts` calling `getPeecVisibilityV2('renaissance','last_30_days','previous_period')`: 29 brands, Renaissance `usedAsSource ≈` its domain row's `retrieved_percentage × 100`, Renaissance `visibility` equal to `getPeecOverview('renaissance','last_30_days')`'s `brandRankings` "you" row.
- [ ] **Step 6: Commit** `feat(aeo-v2): Peec visibility v2 data (brands, YTD per brand, Used as a source)`

---

### Task 5: Visibility v2 data, Profound, and the shared loader

**Decide with Paul before Step 3 (default below):** Profound cannot report per-answer retrieval (Vendor facts). Default: the Profound column is **"Citation share %"**: the share of all citations from Visibility-type prompts that point at the brand's own domains, with that definition as its tooltip; Peec keeps "Used as a source %". The alternative, one label for both providers, hides a definition difference the spec's anti-goals forbid.

**Files:**
- Create: `lib/profound/visibility-v2.ts`, `lib/aeo/v2/visibility.ts`
- Test: `lib/profound/visibility-v2.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  - `getProfoundVisibilityV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<VisibilityV2>`, `cached('profound', 'getVisibilityV2', …, { version: 'v1', healthCritical: false })`. No `profoundCategoryId` → `{ roster: [], brands: [], trend: [], usedAsSourceBasis: 'citations' }`.
  - Pure, exported: `buildProfoundBrandRows(assets: ProfoundAsset[], current: ProfoundNamedRow[], prior: ProfoundNamedRow[], cites: ProfoundNamedRow[], citesPrior: ProfoundNamedRow[], yourBrand: string): BrandRowV2[]`.
  - `getVisibilityV2 = cache((provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode) => …)` in `lib/aeo/v2/visibility.ts` (React `cache`, so the chart and the table share one call per render).
- Impl calls (all with `category_id`, the window, and `filters: [{ field: 'asset_name', operator: 'in', value: names }]` on visibility): visibility `['asset_name']` with `['visibility_score','share_of_voice']`, current and prior; citations `['hostname']` with `['citation_share','count']` and `visibilityPromptsOnly`, current and prior, via `profoundPostAll`; YTD visibility `['date','asset_name']`, `date_interval: 'day'`, via `profoundPostAll`. Read every response with `profoundRows`; percent = fraction × 100. `usedAsSource` = sum of `citation_share × 100` over hostnames matching `assetDomains(asset)` with `bareDomain`/`sameOrSubdomain` (hostnames are disjoint, so shares add), `0` when none match, `null` when the asset has no domain. `isYou` = name includes `peecYourBrand` (v1's rule); when that is empty, `asset.isOwned`. Rows for names outside the asset list are dropped. `usedAsSourceBasis: 'citations'`.

- [ ] **Step 1: Write the failing tests** for `buildProfoundBrandRows` (assets Avenue Z `avenuez.com` owned, iPullRank `ipullrank.com`, NoSite `website: null`; current visibility rows for all three plus an untracked `Siege Media` row; prior rows without NoSite; cites `www.avenuez.com` .02, `blog.ipullrank.com` .01, `ipullrank.com` .03):
  - `Siege Media` is not in the output; ranks follow visibility.
  - Avenue Z `usedAsSource` 2.0; iPullRank 4.0; NoSite `null`.
  - NoSite `visibilityPrior` `null`.
  - Values are percents (`0.1859` → `18.59`).
  - one impl test (mock `profoundPost` / `getProfoundAssets` / `getClientBySlug`): every citations body carries `visibilityPromptsOnly`; no visibility body carries an `analysis_type` filter (the API rejects it).
- [ ] **Step 2: Run** `npx vitest run lib/profound/visibility-v2.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Live check (read-only)**: `getProfoundVisibilityV2('avenue-z','last_30_days','previous_period')` → 4 brands, Avenue Z ≈ 18.6% visibility for 25 Oct–23 Nov (Vendor facts), a YTD series per brand.
- [ ] **Step 6: Commit** `feat(aeo-v2): Profound visibility v2 data and the shared loader`

---

### Task 6: Brand colors and the trend selection URL state

**Files:**
- Create: `components/report-sections/peec-ai/v2/brand-colors.ts`, `components/report-sections/peec-ai/v2/trend-selection.ts`
- Test: `components/report-sections/peec-ai/v2/brand-colors.test.ts`, `components/report-sections/peec-ai/v2/trend-selection.test.ts`

**Interfaces:**
- Produces:
  - `BRAND_PALETTE = ['#6034FF','#FFFC60','#FF8A3D','#39A0FF','#FF6B8A','#96BF48','#C084FC','#F59E0B','#2DD4BF','#F472B6','#A3A3A3','#84CC16'] as const`
  - `brandColors(roster: readonly string[], you: string | null): Record<string, string>` — `you` → `CHART_COLORS.primary`; the other names sorted `localeCompare(…, 'en', { sensitivity: 'base' })` take `BRAND_PALETTE[i % 12]`. Depends only on the roster, never on rank, so colors do not shuffle between periods. Slice 3's matrix uses the same function.
  - `brandKey(name: string): string` — NFKD, strip diacritics, lowercase, runs of non `[a-z0-9]` → `-`, trimmed.
  - `MAX_COMPETITOR_LINES = 7` (client + 7 = 8 lines).
  - `type TrendSelection = { competitors: boolean; selected: string[] }` (keys)
  - `defaultTrendSelection(competitorKeysByVisibility: readonly string[]): TrendSelection` → `{ competitors: true, selected: first 4 }`.
  - `parseTrendParam(raw: string | null | undefined, competitorKeysByVisibility: readonly string[]): TrendSelection` — missing/empty → default; `off` → `{ competitors: false, selected: [] }`; else split on `,`, keep known keys, dedupe, cap 7; none left → default.
  - `serializeTrend(sel: TrendSelection, competitorKeysByVisibility: readonly string[]): string | null` — `null` (delete the param) when equal to the default; `'off'` when competitors are off; else keys joined by `,`.
  - `TREND_PARAM = 'aeoTrend'`

- [ ] **Step 1: Write the failing tests**
  - `brandColors(['Unum','Renaissance','Aflac'], 'Renaissance')` → Renaissance `#60FDFF`, Aflac `#6034FF`, Unum `#FFFC60`; same output for the roster in another order.
  - `brandKey('Mutual of Omaha')` → `mutual-of-omaha`; `brandKey('Nestlé')` → `nestle`.
  - `parseTrendParam`: `undefined` → 4 defaults; `'off'`; `'nope,guardian,,guardian,GUARDIAN'` → `['guardian']`; 9 known keys → first 7; `'nope'` → default.
  - `serializeTrend(default)` → `null`; round-trip of a custom selection.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/brand-colors.test.ts components/report-sections/peec-ai/v2/trend-selection.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): brand colors and trend selection state`

---

### Task 7: Trend chart and `visibility-chart@2`

**Files:**
- Modify: `lib/aeo/bucket.ts` (export the existing `bucketKey` unchanged)
- Modify: `components/report-sections/peec-ai/v2/compare.ts` (`periodWindows`)
- Create: `components/report-sections/peec-ai/v2/brand-trend-chart.tsx` (`'use client'`), `components/report-sections/peec-ai/v2/visibility-v2-section.tsx` (async server component), `components/report-sections/peec-ai/parts/visibility-chart.v2.tsx`
- Modify: `lib/export/request.ts`, `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` (carry `aeoTrend` into the PDF, as slice 1 did for `deltas`)
- Test: `components/report-sections/peec-ai/v2/brand-trend-chart.test.tsx`, `components/report-sections/peec-ai/parts/visibility-chart.v2.golden.test.tsx`, `lib/export/request.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6; `fetchCompareMode`, `parseDateRange`, `deriveCompareRange`, `bucketDaily`.
- Produces:
  - `periodWindows(dateRange: string, compare: AeoCompare): { period: { start: string; end: string }; comparePeriod: { start: string; end: string } | null }` (`comparePeriod` null for `none`).
  - `shadeRange(bucketKeys: readonly string[], g: BucketGranularity, w: { start: string; end: string }): { from: number; to: number } | null` — first and last bucket index whose key equals `bucketKey` of some day in `[start, end]`; `null` when none overlap.
  - `BrandTrendChart(props: { series: { key: string; name: string; color: string; isYou: boolean; points: DailyPoint[] }[]; competitorKeysByVisibility: string[]; period: …; comparePeriod: … | null; showDeltas: boolean; note: string | null })`. Reads `aeoTrend` with `useSearchParams`; writes it with `router.replace(`${pathname}?${params}`, { scroll: false })` keeping every other param (the `DeltasSwitch` pattern). Layout: granularity buttons (Daily / Weekly / Monthly / Quarterly, default Weekly, `data-export-hide`); the chart (SVG polylines on the v1 card's axes and `bucketDaily` buckets; client line `strokeWidth 2.5`, competitors `1.5`); a **Show competitors** `button role="switch"`; a checkbox legend, one per competitor in `competitorKeysByVisibility` order, color dot, the client listed first, checked and disabled. With 7 competitors checked the unchecked boxes are disabled and the line `Up to 8 lines at once. Uncheck a brand to add another.` shows. Competitors off: only the client line, a band over `shadeRange(period)` (`bg-white/[0.08]`) and, when `showDeltas && comparePeriod`, a lighter band over the comparison window (`bg-white/[0.04]`), with a two-item key ("Selected period", "Comparison period"). In export mode the switch, checkboxes and granularity are hidden and a line names what is drawn (`Renaissance and 4 competitors · weekly`).
  - `VisibilityV2Section({ ctx }: { ctx: Pick<PeecCtx,'provider'|'clientSlug'|'dateRange'|'compare'|'showDeltas'|'modelActive'> })` (async) → `getVisibilityV2(...)`; `series` from `trend` in `brands` order; colors from `brandColors(roster, you)`; `note` = `'Model filter not applied here: all models.'` when `modelActive`; returns `null` when no brand has points.
  - `visibilityChartV2: PartImpl<PeecCtx>` (`id: 'visibility-chart'`, `version: 2`, `published: true`, `defaultLabel: 'Visibility trend'`): `<ReportErrorBoundary sectionName="the visibility trend"><Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}><VisibilityV2Section ctx={…} /></Suspense></ReportErrorBoundary>`. The card carries no title: the 02 section headline ("How has AI visibility grown this year?") is the title.
  - `ExportRequest.aeoTrend?: string` validated by `/^(off|[a-z0-9-]{1,48}(,[a-z0-9-]{1,48}){0,6})$/`; anything else → `null`. `exportPagePath` sets `aeoTrend`. Both pages add `aeoTrend?: string` to `searchParams` and put `aeoTrend` in the `serverExport` body only when `activeSection === 'peec-ai' && !subsection` and the param is present. The client chart reads it back from the export page's URL; nothing is threaded through `PeecAIReport`.

- [ ] **Step 1: Write the failing tests**
  - `brand-trend-chart.test.tsx` (mock `next/navigation` as `deltas-switch.test.tsx`; 6 series, client + Guardian, Amwins, Unum, MetLife, Aflac):
    - default: 5 polylines (client + 4); Aflac's checkbox unchecked.
    - checking Aflac calls `replace` with `aeoTrend=guardian,amwins,unum,metlife,aflac` and keeps `section` and `compareRange`.
    - `aeoTrend=off`: 1 polyline, the selected-period band present; with `showDeltas: false` no comparison band; with `comparePeriod: null` no comparison band.
    - export mode (`ExportModeProvider`): no switch, no checkboxes, the summary line present.
  - `shadeRange` (in the same file): weekly keys for Jan–Nov, window `2026-10-25..2026-11-23` → the indexes of the weeks of 20 Oct and 17 Nov; window `2025-10-25..2025-11-23` → `null`; window `2025-12-02..2026-01-01` → `{ from: 0, to: 0 }`.
  - `visibility-chart.v2.golden.test.tsx`: mock `@/lib/aeo/v2/visibility` with a fixed `VisibilityV2` (3 brands), render the section with `FIXTURE_PEEC_CTX` + `compare: 'previous_period'`, snapshot.
  - `request.test.ts`: `aeoTrend: 'off'` and `'guardian,amwins'` accepted and in the path; `'Guardian'`, eight keys, `'a;b'` → `null`; absent → no key, no param.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/brand-trend-chart.test.tsx components/report-sections/peec-ai/parts/visibility-chart.v2.golden.test.tsx lib/export/request.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `npm run check:rsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): per-brand visibility trend chart (visibility-chart@2)`

---

### Task 8: Brand table v2 and `brand-rankings@2`

**Files:**
- Modify: `components/report-sections/peec-ai/sortable-table.tsx` (optional `pinnedRow`)
- Create: `components/report-sections/peec-ai/v2/brand-table.tsx` (`'use client'`), `components/report-sections/peec-ai/parts/brand-rankings.v2.tsx`
- Test: `components/report-sections/peec-ai/v2/brand-table.test.tsx`, `components/report-sections/peec-ai/parts/brand-rankings.v2.golden.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–6, `deltaColumn`.
- Produces:
  - `SortableTableProps.pinnedRow?: (row: T) => boolean` — only when the table is paginated (`initialPageSize`, not "See all", not filtered empty) and the first matching row of the sorted, filtered rows is outside the visible page: render it after the page as one extra row with `data-pinned=""` and `border-t border-dashed border-white/20`. Printed in export mode too. Absent prop → today's output exactly (v1 tables don't pass it).
  - `BrandTableV2({ rows, colors, showDeltas, usedAsSourceBasis, note }: { rows: BrandRowV2[]; colors: Record<string, string>; showDeltas: boolean; usedAsSourceBasis: UsedAsSourceBasis; note: string | null })` — card title `Which brands appear most often in AI answers?`; columns `#` (`rank`, renders `#14`), Brand (color dot + name, client `text-[#60FDFF]`), Visibility, Δ, Share of voice, Δ, Used as a source % (or `Citation share %` for `citations`, tooltip from Task 5's definition), Δ. Δ columns via `deltaColumn({ unit: 'pts', betterWhen: 'higher', accessor: r => r.x == null || r.xPrior == null ? null : r.x - r.xPrior })`, present only when `showDeltas`. A null metric renders `–`. `defaultSortKey="rank" defaultSortDir="asc"`, `initialPageSize={10}`, `pinnedRow={r => r.isYou}`, client row `bg-white/[0.03]`. No Position column.
  - `brandRankingsV2: PartImpl<PeecCtx>` (`id: 'brand-rankings'`, `version: 2`) — same Suspense/error-boundary wrapper as Task 7, an async section calling `getVisibilityV2` (the same cached call) and rendering `BrandTableV2`.

- [ ] **Step 1: Write the failing tests** (`brand-table.test.tsx`, 14 rows, client at rank 14)
  - 11 rows rendered; the last has `data-pinned` and text `#14`; after clicking "See all" 14 rows and no `data-pinned`.
  - client at rank 3 → 10 rows, none pinned; no `isYou` row → none pinned.
  - `showDeltas: false` → no `Δ` header; a row with `visibilityPrior: null` shows `–` in its Δ cell.
  - `usedAsSourceBasis: 'citations'` → header `Citation share %`.
  - no `Position` header.
  - `brand-rankings.v2.golden.test.tsx`: mocked loader, snapshot.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/brand-table.test.tsx components/report-sections/peec-ai/parts/brand-rankings.v2.golden.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then `npx vitest run components/report-sections/peec-ai` — Expected: PASS with no existing snapshot changed (the `pinnedRow` change is invisible to v1 tables).
- [ ] **Step 5: Commit** `feat(aeo-v2): brand table with Used as a source and a pinned client row (brand-rankings@2)`

---

### Task 9: Register the parts, section map, export layout, staging recipe, full gate

**Files:**
- Modify: `components/report-sections/peec-ai/parts/registry.ts`, `components/report-sections/peec-ai/v2/sections.ts`, `components/report-sections/peec-ai/parts/export-layout.ts`, `components/report-sections/peec-ai/MAINTAINING.md`
- Test: existing `parts/export-layout.test.ts`, `guard.test.ts`, `v2/sections.test.ts`

**Interfaces:**
- Produces:
  - Registry: `'visibility-chart': { 1: visibilityChartV1, 2: visibilityChartV2 }`, `'brand-rankings': { 1: brandRankingsV1, 2: brandRankingsV2 }`.
  - `V2_PART_SECTIONS`: `'visibility-chart@2': '02'`, `'brand-rankings@2': '02'`.
  - `PEEC_EXPORT_LAYOUT`: `'visibility-chart@2': 'own'` (the chart card is one block, `data-export-block`), `'brand-rankings@2': 'own'` (a table).
  - `template.ts` unchanged (v1 stays the default until slice 7's flip).
  - MAINTAINING.md staging recipe, slice 2's entries: `versions: { "visibility-chart": 2, "brand-rankings": 2 }`, with `brand-rankings` placed directly after `visibility-chart` in `order`. **Read the current staging override first and add only these entries**: slices 4 and 6 run in parallel and edit the same JSON.
- [ ] **Step 1: Add a test** in `v2/sections.test.ts`: `isV2Layout([{ id: 'brand-rankings', version: 2, label: '' }])` is true with the real map; `[{ id: 'brand-rankings', version: 1, label: '' }]` false.
- [ ] **Step 2: Implement** the four edits.
- [ ] **Step 3: Full gate:** `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS, no existing snapshot updated.
- [ ] **Step 4: Commit** `feat(aeo-v2): register 02 Visibility vs Competitors parts`

---

## After the tasks

- Whole-branch review, then push `feat/aeo-overview-v2-visibility` and open a PR into `dev` (memory: stacked PRs are rejected), with the mockup screenshots and the Task 5 decision in the description.
- Review record `docs/qa/aeo-overview-v2-visibility-code-review.md` on its own `docs/` branch off `dev`, citing the feature diff range (CLAUDE.md Stage 1).
- After the PR reaches staging: apply the slice 2 entries to Renaissance's and Avenue Z's `peec-ai` override on the **staging** Neon branch only (MAINTAINING.md recipe), and check both in a browser: 02 renders with the section header and nav entry, the chart's legend and switch update the URL, a PDF export with `aeoTrend=off` prints the single line with shading.
- Follow-ups to file, not fix here: the cache warmer does not warm `getVisibilityV2` (first staging view is cold); the v1 Profound Overview problems in the live-check report.
