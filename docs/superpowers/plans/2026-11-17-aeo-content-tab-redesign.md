# AEO Content Impact Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AEO Content Impact tab per the Renaissance training feedback (merged content table, honest time-to-first metrics, clearer chart labels, an internal prompt-gap diagnostic with a per-client visibility switch) and move the competitor section to the AEO Overview as parts in its default template.

**Architecture:** Content Impact is reworked in place (spec Approach 1): new pure builders in `lib/peec/*` compute rows, new focused components render them, and `content-impact.tsx` shrinks as blocks move out. Overview gains two versioned Peec parts that fetch their own data behind `<Suspense>`, placed in the default template just above the footer (F-1). Three data fixes land first because the new blocks are wrong without them.

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript strict, Vitest + Testing Library, Recharts, Neon/Drizzle (`clients.report_section_config` JSON), Peec AI REST API, GA4 Data API.

**Spec:** `docs/superpowers/specs/2026-11-17-aeo-content-tab-redesign-design.md` (decisions D-1…D-19, review tags R-1…R-21, stakeholder feedback F-1…F-6). Read it before any task; this plan cites it by id and does not restate its reasoning.

## Global Constraints

- Branch off `dev` (`feat/aeo-content-tab-redesign`); PR targets `dev` only. Never push to `main` or `staging`.
- Every task ends green on: `npx vitest run <task tests>`, then before each commit `npm run typecheck`. Before the PR: `npm test`, `npm run lint`, `npm run check:rsc` (it scans `.test.tsx` files too: a test passing function props to a client component needs `'use client'`).
- Standalone `tsx` scripts that touch `cached()` fetchers run with `CACHE_DISABLE=1 npx tsx --env-file=.env.local …`. Scripts are read-only unless the task says otherwise.
- No hardcoded client slugs, domains, or ids in components. Owned hosts come from Peec `Own` domains (`filteredOwnDomains`); the FB-050 subdomain rule applies everywhere "owned" is decided.
- Missing or failed source data renders `--` (null), never `0` or `0%` (D-17).
- Copy fixed by the spec is used verbatim (chip labels, descriptions, axis titles, empty state). Search for the quoted strings in the spec.
- Cache versions: bump the `version` of any `cached()` fetcher whose response shape or fetch logic changes, with a one-line reason comment, matching the existing comments.
- Peec `/reports/urls` returns **no `totalCount`** and only sorts by `citation_count` (see `countDuplicateUrlKeys` comment, `lib/peec/url-citations.ts:259`). Completeness = a short final page within `maxPages` **and** zero duplicate row keys.
- A cached payload must stay under Next's 2 MB data-cache limit (FB-069). Cache only filtered or aggregated results, never a full uncapped walk.

## Review Focus

1. **A client loads the portal or a PDF while `prompt-gaps` is not in `clientVisible`:** the block and every prompt string are absent, including Overview's gap table prompt text. Pinned by Task 11 (matrix test), Task 16 (D-15 test).
2. **Peec coverage walk is incomplete** (maxPages hit, or a mid-walk reorder shows duplicates): prompt gaps render an error card, not "Not cited" rows. Pinned by Task 2 and Task 10.
3. **A commentary opt-in (or any other `saveReportSectionConfig` save) after the switch was turned on:** `clientVisible` survives; a `CLIENT_ADMIN` posting `clientVisible` is refused. Pinned by Task 11.
4. **A calendar URL appears on two tabs** (once New, once Optimized) **or as a bare `/path`:** one merged row, badge "New · Optimized", link to the live domain; counted once in time-to-first. Pinned by Task 5.
5. **Model filter active on Overview:** competitor deltas all hidden (FB-063), H1 rows filtered by model. Pinned by Task 16.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `lib/peec/url-citations.ts` | modify | `fetchAllPagesChecked`; complete `getDomainCoverage`; new `getOwnedUrlCitations` |
| `lib/peec/owned-hosts.ts` | create | FB-050 owned-host rule, shared |
| `lib/peec/client.ts` | modify | `TrackedPrompt.id`; cache v12 |
| `lib/content-calendar/date.ts`, `client.ts` | modify | V2 fixes (Publish Date formats / Content Type mapping) only if Task 1 finds them |
| `lib/content-calendar/pages.ts` | create | bare-path resolution + dedupe into `CalendarPage` |
| `lib/peec/content-performance-rows.ts` | create | one row builder for both table scopes |
| `components/report-sections/peec-ai/content-performance-table.tsx` | create | merged table + scope switch (client) |
| `lib/ga4/content-derive.ts` | modify | `daysToFirstSearch` replaces `daysToFirstTraffic` |
| `components/report-sections/peec-ai/slope-chart.tsx`, `bot-vs-human-scatter.tsx` | modify | labels |
| `lib/peec/prompt-gaps.ts` | create | Not cited / Lost / Declining |
| `components/report-sections/peec-ai/prompt-gaps.tsx`, `client-visible-switch.tsx` | create | block + switch |
| `lib/report-sections/{types,mutations}.ts` | modify | `clientVisible`, guards |
| `app/actions/report-sections.ts` | modify | `setClientVisible`; guards in `saveReportSectionConfig` |
| `lib/peec/competitor-tables.ts` | create | H1/H2 row builders extracted from `content-impact.tsx` |
| `components/report-sections/peec-ai/parts/competitor-{visibility,gaps}.tsx` | create | Overview parts |
| `components/report-sections/peec-ai/{ctx.ts,index.tsx,template.ts}` | modify | `models`, `audience`; Competitors parts in the default template (F-1) |
| `components/report-sections/peec-ai/content-impact.tsx` | modify | wiring; §B, §F, §H removed |
| `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`, `components/export/report-element.tsx` | modify | pass `audience` (4 callers) |
| `scripts/list-peec-clients.ts`, `scripts/content-impact-before-after.ts`, `scripts/v2-calendar-audit.ts`, `scripts/measure-coverage-walk.ts` | create | rollout checks + evidence (read-only) |

---

### Task 1: Verifications V1/V2 and the coverage measurement (read-only)

**Files:**
- Create: `scripts/v2-calendar-audit.ts`, `scripts/measure-coverage-walk.ts`
- Create: `docs/qa/aeo-content-impact-verifications.md` (findings for Tina)
- Modify (only if findings require): `lib/content-calendar/client.ts` (`parseContentAction`), `lib/content-calendar/date.ts` (`parseCalendarDate`)
- Test: `lib/content-calendar/date.test.ts` (only if the parser changes)

**Interfaces:**
- Produces: the measured coverage row count and aggregated payload bytes for Renaissance (consumed by Task 2's `pageSize`/`maxPages` and the cache decision), and the V1/V2 findings doc.

- [ ] **Step 1: Write `scripts/v2-calendar-audit.ts <slug>`.** Read-only via `getContentCalendarData`'s sheet access (reuse `fetchAllTabValues`; export it if needed). Print per tab: header row; the header matched for `publishDate`; every distinct raw Publish Date format seen (with a sample and its `parseCalendarDate` output) and the count that parse to null; every distinct Content Type with the `parseContentAction` result; count of rows whose Status is exactly "Published" vs anything else; duplicate URLs across tabs; and, after `toCalendarPages` lands (re-run in Task 5), how many published pages have a Published date and a Last optimized date (D-19, F-2).
- [ ] **Step 2: Run it.** `CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/v2-calendar-audit.ts renaissance`. Expected: output prints for every tab, no write calls.
- [ ] **Step 3: Write `scripts/measure-coverage-walk.ts <slug>`.** Walk `/reports/urls` with `dimensions: ['prompt_id','model_id']`, `limit: 10000`, offsets until a short page, over the last 30 days. Print: total rows, pages, duplicate `(url,prompt,model)` keys, and `JSON.stringify(aggregateDomainCoverage(rows, [], {})).length`. Also walk the base `/reports/urls` (no dimensions) and print owned-host row count (FB-050 rule against the project's Own domains) and its JSON size.
- [ ] **Step 4: Run it** the same way. Expected: numbers print; record them.
- [ ] **Step 5: If V2 found Publish Date formats that parse to null, add a failing case per format to `lib/content-calendar/date.test.ts`, then extend `parseCalendarDate` to pass. If a Content Type maps to `other` or the wrong badge (Danielle confirmed column C is correct, F-3; "Existing Blog Optimization" must map to `optimized`), add a failing case and fix `parseContentAction`.** Run `npx vitest run lib/content-calendar`. Expected: PASS. If neither applies, change no code. (No update-date alias work: the sheet has no such column, D-19.)
- [ ] **Step 6: Write `docs/qa/aeo-content-impact-verifications.md`:** V1 rule (exact "Published", no date rule), V2 date-format findings and fixes, the Content Type → badge table (R-20, F-3), and the coverage numbers. If the aggregated coverage JSON exceeds 1.5 MB, write that here and **stop: escalate before Task 2** (the cache plan in Task 2 assumes it fits).
- [ ] **Step 7: Commit.** `git add scripts/v2-calendar-audit.ts scripts/measure-coverage-walk.ts docs/qa/aeo-content-impact-verifications.md lib/content-calendar` → `git commit -m "chore(aeo): V1/V2 calendar audit and coverage-walk measurement"`

---

### Task 2: Complete prompt coverage (R-1)

**Files:**
- Modify: `lib/peec/url-citations.ts` (`fetchAllPages`, `DomainCoverage`, `getDomainCoverageImpl`, `getDomainCoverage` version)
- Test: `lib/peec/url-citations.test.ts`

**Interfaces:**
- Produces:
  - `fetchAllPagesChecked<T>(fetchPage, opts: { pageSize: number; maxPages: number; label?: string; rowKey?: (row: T) => string }): Promise<{ rows: T[]; complete: boolean }>`. `complete` is false when maxPages is hit with every page full, when a reported `totalCount` disagrees, or when `rowKey` finds a duplicate. `fetchAllPages` becomes `(…) => fetchAllPagesChecked(…).then(r => r.rows)`; its warnings are unchanged.
  - `DomainCoverage.complete?: boolean` (optional so existing literal placeholders compile; consumers treat `undefined` as `true` only for the empty shape).
  - `getDomainCoverage` cache `version: 'v6'`.

- [ ] **Step 1: Write failing tests** in `url-citations.test.ts`:
  - `fetchAllPagesChecked: short final page → complete true` (pages of 3, 3, 1 with pageSize 3).
  - `fetchAllPagesChecked: maxPages hit with full pages → complete false`.
  - `fetchAllPagesChecked: duplicate rowKey across pages → complete false`.
  - `getDomainCoverageImpl walks prompt rows past 10,000` : mock `post` so the prompt-dimensioned call returns 10,000 rows then 5 rows; assert the aggregate includes a prompt id that only appears in the second page and `complete === true`.
- [ ] **Step 2: Run** `npx vitest run lib/peec/url-citations.test.ts`. Expected: the four new tests FAIL.
- [ ] **Step 3: Implement.** In `getDomainCoverageImpl`, replace the single prompt-dimensioned `post` with `fetchAllPagesChecked` (`pageSize: CITATION_PAGE_SIZE`, `maxPages: CITATION_MAX_PAGES`, `rowKey: r => \`${r.url}|${r.prompt?.id}|${r.model?.id}\``, label `'coverage (prompt×model)'`); keep the tag fetch as is. Set `complete` on the returned aggregate. Bump the cache to `'v6'` with comment `// v6: prompt×model rows walked to completion (was one 10,000-row page, R-1); adds complete flag`.
- [ ] **Step 4: Run** the same command. Expected: PASS, and existing tests in the file still PASS.
- [ ] **Step 5: Commit.** `git commit -am "fix(peec): walk prompt coverage to completion and report completeness"`

---

### Task 3: Owned cited pages without the 2,000 cap (R-6)

**Files:**
- Create: `lib/peec/owned-hosts.ts`, `lib/peec/owned-hosts.test.ts`
- Modify: `lib/peec/url-citations.ts`
- Test: `lib/peec/url-citations.test.ts`

**Interfaces:**
- Produces:
  - `ownedHostKeys(ownDomains: { domain: string }[]): Set<string>` and `isOwnedHost(hostKey: string | null, owned: Set<string>): boolean` (exact match or `endsWith('.' + key)`, the FB-050 rule now inline at `content-impact.tsx` ~1305–1313).
  - `getOwnedUrlCitations(clientSlug: string | undefined, ownedHosts: string[], opts?: { startDate?: string; endDate?: string }): Promise<OwnedUrlCitations>` where `type OwnedUrlCitations = { rows: UrlCitation[]; totalCitationCount: number; complete: boolean }`. `rows` = merged citations on owned hosts only; `totalCitationCount` = sum of `citation_count` over **every** walked base row (the all-sites denominator). Cached (`'peec', 'getOwnedUrlCitations'`, `version: 'v1'`). Window defaults to `last30()` (D-10).

- [ ] **Step 1: Failing tests.** `owned-hosts.test.ts`: `blog.x.com` owned when `x.com` is Own; `notx.com` not owned; `null` not owned. `url-citations.test.ts`: `getOwnedUrlCitations keeps only owned rows and sums all rows` (mock two pages: 10,000 rows mixed hosts + 3 rows; assert `rows` are owned-only, `totalCitationCount` equals the sum over all 10,003, `complete` true).
- [ ] **Step 2: Run** `npx vitest run lib/peec/owned-hosts.test.ts lib/peec/url-citations.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** both files. `getOwnedUrlCitationsImpl` mirrors `getPlacementCitationsImpl` (base + engine walks, brands, `mergeUrlCitations`), then filters merged rows with `isOwnedHost(urlJoinKey(c.domain), …)` and computes the total from base rows before filtering. `complete` = both walks complete.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(peec): uncapped owned cited pages with all-sites citation total"` (add the new files).

---

### Task 4: Prompt ids on tracked prompts (R-10)

**Files:**
- Modify: `lib/peec/client.ts` (`TrackedPrompt`, `trackedPrompts` map ~672, `getPeecOverview` version)
- Modify: `components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts` (add ids to fixture prompts)
- Test: existing goldens

**Interfaces:**
- Produces: `TrackedPrompt.id: string` (Peec prompt uuid). `getPeecOverview` cache `version: 'v12'`.

- [ ] **Step 1: Add `id` to the type and set `id: uuid` in the map; bump to `'v12'` with comment `// v12: TrackedPrompt carries its Peec id (R-10, prompt gaps join coverage on it)`.**
- [ ] **Step 2: Run** `npm run typecheck`. Expected: errors only where fixtures build `TrackedPrompt` literals; add ids there.
- [ ] **Step 3: Run** `npx vitest run components/report-sections/peec-ai`. Expected: PASS with no snapshot changes (ids aren't rendered).
- [ ] **Step 4: Commit.** `git commit -am "feat(peec): keep prompt id on TrackedPrompt"`

---

### Task 5: Calendar pages: bare paths, dedupe, dates (D-18, D-19)

**Files:**
- Create: `lib/content-calendar/pages.ts`, `lib/content-calendar/pages.test.ts`

**Interfaces:**
- Consumes: `ContentCalendarRow` (`lib/content-calendar/types.ts`), `urlJoinKey` (`@/lib/url`).
- Produces:
  - `type AzBadge = 'new' | 'optimized' | 'new-optimized' | 'other'`
  - `type CalendarPage = { urlKey: string; url: string; topic: string; contentType: string; published: boolean; badge: AzBadge; publishDate: string | null; lastOptimizedDate: string | null }`
  - `resolveCalendarUrl(raw: string | null, primaryOwnedDomain: string | null): string | null` (bare `/path` → `https://<domain>/path`; absolute unchanged; null stays null).
  - `toCalendarPages(rows: ContentCalendarRow[], primaryOwnedDomain: string | null): CalendarPage[]` — drops rows with no resolvable URL; groups by `urlJoinKey`; `published` = any row's Status is exactly "Published" (trim, case-insensitive; V1 rule); `badge` from the set of `contentAction`s; `publishDate` = earliest Publish Date among the group's non-`optimized` rows (D-19); `lastOptimizedDate` = latest Publish Date among its `optimized` rows (D-19; the calendar's `updateDate` is not used); `topic`/`contentType` from the latest row.

- [ ] **Step 1: Failing tests** (`pages.test.ts`):
  - `resolves bare path against owned domain`: `resolveCalendarUrl('/blog/x', 'renaissance.example')` → `'https://renaissance.example/blog/x'`.
  - `merges New and Optimized rows for one URL`: two rows same URL (one `new` published 2026-03-04, one `optimized` updated 2026-06-12) → one page, `badge: 'new-optimized'`, `publishDate: '2026-03-04'`, `lastOptimizedDate: '2026-06-12'`.
  - `two Optimized rows keep the latest as lastOptimizedDate; an optimized-only page has publishDate null`.
  - `trailing slash and www variants merge` → one page.
  - `status "Live" is not published; " published " is`.
- [ ] **Step 2: Run** `npx vitest run lib/content-calendar/pages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `pages.ts`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(content-calendar): resolve bare slugs and merge duplicate calendar rows"`

---

### Task 6: Content performance row builder (D-5, D-17)

**Files:**
- Create: `lib/peec/content-performance-rows.ts`, `lib/peec/content-performance-rows.test.ts`

**Interfaces:**
- Consumes: `CalendarPage` (Task 5), `OwnedUrlCitations` (Task 3), `DomainCoverage` + `urlPromptIds` (Task 2), `isOwnedHost` (Task 3).
- Produces:
  - `type PathMetrics = { aiReferred: number | null; organic: number | null; engagementRate: number | null }`
  - `engagementRateByPath(rows: { pagePath: unknown; sessions: unknown; engagementRate: unknown }[]): Map<string, number>` — keyed by `normPath`, session-weighted mean across rows that normalise to the same path (D-17).
  - `type ContentPerformanceRow = { key: string; title: string; url: string; slug: string; badge: AzBadge | null; publishDate: string | null; lastOptimizedDate: string | null; promptCoverage: number | null; promptCoverageDelta: number | null; citationShare: number | null; citationShareDelta: number | null; aiReferred: number | null; aiReferredDelta: number | null; organic: number | null; organicDelta: number | null; engagementRate: number | null; engagementRateDelta: number | null; scopes: ('az' | 'all')[] }`
  - `buildContentPerformanceRows(input: { pages: CalendarPage[]; owned: OwnedUrlCitations; ownedPrior: OwnedUrlCitations | null; coverage: DomainCoverage; coveragePrior: DomainCoverage | null; totalTrackedPrompts: number; current: (path: string) => PathMetrics; prior: ((path: string) => PathMetrics) | null }): ContentPerformanceRow[]`
- Rules (from spec + today's code): `az` rows = `pages.filter(p => p.published)`; `all` = az ∪ owned rows with `citationCount > 0`, joined on `urlKey`. Prompt coverage = `urlPromptIds(cov, key).length / totalTrackedPrompts * 100`, **null** when `coverage.complete === false` or `totalTrackedPrompts === 0`. Citation share = `citationCount / owned.totalCitationCount * 100`, **null** when `owned.complete === false`; an owned-but-uncited AZ page = `0` only when `owned.complete`. Count deltas (AI-referred, organic) = % change, null when prior is null or 0. Share/coverage/ER deltas = current − prior (×100 for ER fractions). Title: calendar topic, else Peec title, else `labelFromPath(url)`. `slug` = URL path.

- [ ] **Step 1: Failing tests:**
  - `AZ page with no citations still appears with citationShare 0 when owned is complete`.
  - `citationShare is null when owned.complete is false` (anti-goal: truncated fetch must not read as uncited).
  - `promptCoverage is null, not 0, when coverage.complete is false`.
  - `a cited owned page in the calendar appears once with its badge in both scopes`.
  - `engagementRateByPath weights /p and /p/ by sessions`: rows `/p` (100 sessions, 0.5) and `/p/` (300, 0.7) → `0.65`.
  - `organicDelta null when prior organic is 0`.
  - `blankCountsByColumn` (exported helper, `(rows: ContentPerformanceRow[]) => Record<string, number>`) counts null cells per column (F-5; used by Task 17).
- [ ] **Step 2: Run** `npx vitest run lib/peec/content-performance-rows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(aeo): single row builder for the merged content table"`

---

### Task 7: Merged content table, wired in (Goals 1–2)

**Files:**
- Create: `components/report-sections/peec-ai/content-performance-table.tsx`, `content-performance-table.test.tsx`
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (fetch `getOwnedUrlCitations` current + prior; build `CalendarPage[]`; replace §B and §F blocks), `content-impact-tables.tsx` (delete `PlannedContentPerformanceTable`, `FullsiteContentPerformanceTable` and their row types once unused)

**Interfaces:**
- Consumes: `ContentPerformanceRow` (Task 6), `SortableTable` (existing).
- Produces: `ContentPerformanceTable({ rows, ga4Connected, calendarConnected }: { rows: ContentPerformanceRow[]; ga4Connected: boolean; calendarConnected: boolean })` — `'use client'`; scope switch "Avenue Z content" (default) / "All cited pages".

- [ ] **Step 1: Failing tests** (`content-performance-table.test.tsx`, add `'use client'` at top per check:rsc): default scope shows only rows whose `scopes` include `'az'`; clicking "All cited pages" shows the rest; Page cell renders the title and a visible slug link with `href` = `row.url` and `target="_blank"`; badge text "New · Optimized" for `new-optimized`; column headers "Published" and "Last optimized" (no "Last updated", D-19); null cells render `--`; empty AZ scope with calendar connected shows exactly *"No published content yet. A calendar row appears here once its Status is set to Published."*; the Published column header tooltip states the V1 rule.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/content-performance-table.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component (columns per spec §2 table; "AI-referred sessions" header). Persisting scope in `localStorage` key `aeo-content-scope:<slug>` is optional; if added, wrap reads/writes in try/catch.
- [ ] **Step 4: Wire into `content-impact.tsx`:** primary owned domain = `ownedDomainNames[0]`; `pages = toCalendarPages(calendarData?.rows ?? [], primary)`; `current`/`prior` path lookups built from the existing `aiReferredForPath*`, `organicForPath*`, and `engagementRateByPath` (replacing `erByPath`/`getGA4Metrics` ER use; if the prior per-path GA4 query lacks the `sessions` metric, add it so the prior rate can be weighted too). Remove the §B and §F render blocks.
- [ ] **Step 5: Run** `npx vitest run components/report-sections/peec-ai && npm run typecheck && npm run check:rsc`. Expected: PASS (update parity/golden snapshots only after reviewing that the diff is the §B/§F → merged table swap).
- [ ] **Step 6: Commit.** `git commit -m "feat(aeo): merged content table with Avenue Z / all-cited scope"`

---

### Task 8: Time-to-first cards (D-1, D-9, Goal 3)

**Files:**
- Modify: `lib/ga4/content-derive.ts` (`UrlTimingInput`, `UrlTiming`, `computeUrlTiming`), `lib/ga4/content-derive.test.ts`
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (§C query, universe, `TimeToFirstCards` labels/description)

**Interfaces:**
- Produces: `UrlTimingInput.days: { date: string; aiSessions: number; searchSessions: number }[]`; `UrlTiming = { daysToFirstSearch: number | null; daysToFirstAi: number | null }` (`daysToFirstTraffic` removed).

- [ ] **Step 1: Failing asserts** in `content-derive.test.ts`: a page with sessions on publish day but its first `searchSessions > 0` three days later → `daysToFirstSearch === 3`; a page with only AI sessions → `daysToFirstSearch === null`, `daysToFirstAi` set.
- [ ] **Step 2: Run** `npx vitest run lib/ga4/content-derive.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `content-derive.ts`. In `content-impact.tsx`: add `sessionDefaultChannelGroup` to the §C `ga4Query` dimensions; accumulate `searchSessions` where it equals `'Organic Search'`; universe = `pages.filter(p => p.published && (p.badge === 'new' || p.badge === 'new-optimized') && p.publishDate)` measured from `publishDate`. Card labels: "Median days to first search visit", "Median days to first AI-referred visit", "Fastest to first AI-referred visit", "Slowest to first AI-referred visit"; section title "How quickly does new content get found?"; description = the spec §3 sentence verbatim.
- [ ] **Step 4: Run** `npx vitest run lib/ga4 components/report-sections/peec-ai && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(aeo): time-to-first uses first search visit, new content only"`

---

### Task 9: Movers and bot chart labels (D-13, R-16, Goal 4)

**Files:**
- Modify: `components/report-sections/peec-ai/slope-chart.tsx`, `bot-vs-human-scatter.tsx`, `content-impact.tsx` (§D/§E `SectionCard` titles/descriptions)
- Test: `components/report-sections/peec-ai/slope-chart.test.tsx` (create), existing scatter tests/goldens

**Interfaces:**
- Produces: `SLOPE_SCOPE: Record<SlopeMetric, { chip: string; description: string }>` exported from `slope-chart.tsx`, rendered above the toggles for the active metric (and in export mode for the printed metric).

- [ ] **Step 1: Failing test** (`slope-chart.test.tsx`, `'use client'`): default metric shows chip "All site pages" and the spec's site-pages description; after clicking "Citation Share" it shows "All cited pages across the web" and that description.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/slope-chart.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Slope `SectionCard` keeps title "Which pages are gaining or losing momentum?" and drops its description (the chart now carries it). Scatter: `SectionCard` title "AI crawler visits vs. human visits, by page"; X label "AI crawler visits (last 30 days)"; Y label "Human sessions (GA4, excluding AI-referred)"; add one reading-guide line under the chart naming the four quadrants in plain words (draft wording; Tina confirms at staging QA). Keep the 30-day note.
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai`. Expected: PASS after reviewing and updating affected snapshots.
- [ ] **Step 5: Commit.** `git commit -am "feat(aeo): scope chips on Movers, plain-language bot chart labels"`

---

### Task 10: Prompt gap computation (D-16, R-4, R-11)

**Files:**
- Create: `lib/peec/prompt-gaps.ts`, `lib/peec/prompt-gaps.test.ts`

**Interfaces:**
- Consumes: `TrackedPrompt` with `id` (Task 4), `DomainCoverage` with `complete` (Task 2), `isOwnedHost` (Task 3), `UrlCitation` (for which other-site URLs name a competitor).
- Produces:
  - `type PromptGapStatus = 'not-cited' | 'lost' | 'declining'`
  - `type PromptGapRow = { promptId: string; text: string; topic: string; status: PromptGapStatus; otherSites: { url: string; namesCompetitor: boolean }[]; otherSitesMore: number }`
  - `type PromptGapsResult = { ok: true; rows: PromptGapRow[] } | { ok: false; reason: 'incomplete' | 'unavailable' }`
  - `computePromptGaps(input: { prompts: TrackedPrompt[]; coverage: DomainCoverage; coveragePrevious: DomainCoverage; ownedHosts: Set<string>; models: AEOModel[] | null; declineThreshold: number; competitorUrlKeys: Set<string> }): PromptGapsResult`
  - `DEFAULT_DECLINE_THRESHOLD = 1` (average position worsening ≥ 1 rank; proposal for Tina, Q-2), read at the call site from `report_section_config['peec-ai:content-impact'].thresholds['prompt-gaps.decline']` when set.
- Rules: owned prompt ids = union of `promptIdsByUrlKey[k]` for every url key whose host `isOwnedHost` (R-11: subdomain rule, not `domainPromptIds`); with `models` set, use the model-filtered ids (`promptIdsByDomainByModel`) for both periods. **not-cited** = not owned now and not owned before. **lost** = owned before, not now. **declining** = owned now, and mean of `positionByModel` over selected (or all) models minus mean of `priorPositionByModel` ≥ threshold, both defined and non-zero. Other sites = url keys citing the prompt whose host is not owned, competitor-named first, then by `citationCount`; top 3 + count of the rest. Either coverage `complete === false` → `{ ok: false, reason: 'incomplete' }`.

- [ ] **Step 1: Failing tests:** one per status; `blog.owned.com citation counts as owned`; `incomplete coverage → ok:false incomplete`; `position 0 / missing prior is not declining`; `model filter restricts both periods`; `otherSites top 3 with competitor-named first and otherSitesMore`.
- [ ] **Step 2: Run** `npx vitest run lib/peec/prompt-gaps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(aeo): prompt gap computation (not cited, lost, declining)"`

---

### Task 11: Client-visibility config and guards (D-4, R-2)

**Files:**
- Modify: `lib/report-sections/types.ts` (`SectionOverride.clientVisible?: string[]`), `lib/report-sections/mutations.ts`, `app/actions/report-sections.ts`
- Test: `lib/report-sections/mutations.test.ts` (create), `app/actions/report-sections.test.ts`

**Interfaces:**
- Produces:
  - `INTERNAL_ONLY_BLOCKS = ['prompt-gaps'] as const` in `lib/report-sections/mutations.ts`.
  - `mergePreservingSharedParts(prev, next)` also carries `prev.clientVisible` (the incoming body can never set it; see guard).
  - `applyClientVisible(cfg: ReportSectionConfig, viewKey: string, blockId: string, visible: boolean): ReportSectionConfig` (adds/removes the id, dedupes, leaves every other field).
  - `isClientVisible(cfg: ReportSectionConfig | null | undefined, viewKey: string, blockId: string): boolean`.
  - Server action `setClientVisible(slug: string, viewKey: string, blockId: string, visible: boolean): Promise<Result>` — `auth()`; `session.user.role === 'INTERNAL_ADMIN'` else `{ ok:false, error:'forbidden' }`; `blockId` must be in `INTERNAL_ONLY_BLOCKS`; persist via the existing `persist`.
  - `saveReportSectionConfig` returns `{ ok:false, error:'clientVisible is set with setClientVisible' }` when `raw` has `clientVisible`. (The competitor-pin guard was dropped with F-1: the parts are in the template, not opted in.)

- [ ] **Step 1: Failing tests:** `mutations.test.ts`: `merge keeps clientVisible from prev`; `applyClientVisible adds then removes, other fields untouched`; `isClientVisible false when absent`. `report-sections.test.ts` (mock `auth`, db as existing tests do): `saveReportSectionConfig rejects clientVisible in body`; `a commentary-only save keeps an existing clientVisible`; `setClientVisible forbidden for INTERNAL_ANALYST and CLIENT_ADMIN`; `setClientVisible rejects unknown blockId`.
- [ ] **Step 2: Run** `npx vitest run lib/report-sections app/actions/report-sections.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(report-sections): per-client clientVisible with admin-only writer and save guards"`

---

### Task 12: `audience` on both AEO entry points (R-14)

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx` (`ContentImpactReport` props), `index.tsx` (`PeecAIReport` props), and the four callers: `app/dashboard/[clientSlug]/reports/page.tsx:89,91`, `app/portal/[clientSlug]/reports/page.tsx:137,139`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:90`, `components/export/report-element.tsx:42,44`
- Test: `components/export/report-views.button.test.tsx` or a new `components/export/report-element.audience.test.tsx`

**Interfaces:**
- Produces: `type ReportAudience = 'internal' | 'client'` exported from `components/report-sections/peec-ai/ctx.ts`; **required** prop `audience: ReportAudience` on `ContentImpactReport` and `PeecAIReport`. Dashboard → `'internal'`; both portal routes and the export → `'client'`.

- [ ] **Step 1: Failing test:** render `ReportElement` for `peec-ai` / `content-impact` with the report components mocked, assert they received `audience: 'client'`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** (typecheck will list every caller).
- [ ] **Step 4: Run** `npm run typecheck && npx vitest run components/export`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(aeo): required audience prop on AEO reports; export renders as client"`

---

### Task 13: Prompt gaps block and switch (Goal 5)

**Files:**
- Create: `components/report-sections/peec-ai/prompt-gaps.tsx` (server), `client-visible-switch.tsx` (`'use client'`), `prompt-gaps.test.tsx`
- Modify: `content-impact.tsx` (fetch previous-period coverage when `compareRange !== 'previous_period'`; render block 6)

**Interfaces:**
- Consumes: `computePromptGaps` (Task 10), `isClientVisible`, `setClientVisible` (Task 11), `ReportAudience` (Task 12).
- Produces: `PromptGapsBlock({ result, audience, clientVisible, canToggle, clientSlug }: { result: PromptGapsResult; audience: ReportAudience; clientVisible: boolean; canToggle: boolean; clientSlug: string })` returning `null` when `audience === 'client' && !clientVisible`.

- [ ] **Step 1: Failing tests** (matrix): client + not visible → renders nothing (no prompt text in DOM); client + visible → table, no chip, no switch; internal + not visible → table + "Internal" chip; internal with `canToggle` → switch labelled "Visible to client" reflecting state; `result.ok === false` → error card text, no rows; statuses render "Not cited", "Lost", "Declining"; column header "Other sites cited"; competitor-named URLs marked.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/prompt-gaps.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `content-impact.tsx`: `canToggle = session.user.role === 'INTERNAL_ADMIN' && audience === 'internal'` (via `auth()`); previous-period coverage = existing `coveragePrior` when `compareRange === 'previous_period'`, else a `getDomainCoverage` call on `deriveCompareRange(mainRangeStr, 'previous_period')`.
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai && npm run check:rsc`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(aeo): internal prompt-gaps block with admin client-visibility switch"`

---

### Task 14: Extract competitor builders; remove §H from Content Impact (D-2)

**Files:**
- Create: `lib/peec/competitor-tables.ts`, `lib/peec/competitor-tables.test.ts`
- Modify: `content-impact.tsx` (delete §H render; synopsis context reads the extracted builders), `content-impact-tables.tsx` (move `CompetitorDomainsCitedTable`/`CompetitorUrlsBrandAbsentTable` to `components/report-sections/peec-ai/competitor-tables.tsx`)

**Interfaces:**
- Produces:
  - `buildCompetitorDomainRows(input: { competitorDomains: TopDomain[]; coverage: DomainCoverage; coveragePrior: DomainCoverage | null; totalTrackedPrompts: number; models: AEOModel[] | null; showDeltas: boolean }): CompetitorDomainsCitedRow[]` — the FB-051/FB-058 math at `content-impact.tsx` ~1405–1440, with `filterDomainRowsByModel` applied when `models` is set; all deltas null when `!showDeltas` or a model filter is active (FB-063).
  - `buildBrandAbsentRows(input: { citations: UrlCitation[]; citationsPrior: UrlCitation[] | null; coverage: DomainCoverage; showDelta: boolean }): BrandAbsentRow[]` with `type BrandAbsentRow = CompetitorUrlsBrandAbsentRow & { pageType: string; promptIds: string[] }` — row rule unchanged (`!mentionsYourBrand && competitorBrandNames.length > 0`).
- [ ] **Step 1: Characterisation tests first:** feed both builders a fixture and assert the exact numbers today's inline code produces (copy expected values by running the old code path once on the fixture before deleting it); plus `model filter nulls every delta`.
- [ ] **Step 2: Run** `npx vitest run lib/peec/competitor-tables.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** by moving the code, then delete §H from `content-impact.tsx`.
- [ ] **Step 4: Run** `npx vitest run lib/peec components/report-sections/peec-ai && npm run typecheck`. Expected: PASS; parity snapshot diff shows only §H removed.
- [ ] **Step 5: Commit.** `git commit -m "refactor(aeo): extract competitor table builders; competitor section leaves Content Impact"`

---

### Task 15: Removed (F-1)

The `extraParts` `before` anchor existed only to place opted-in Competitors parts above the footer. With the parts in the
default template (D-11), template order places them. Numbering is kept so cross-references stay stable.

---

### Task 16: Overview Competitors parts (D-7, D-8, D-15)

**Files:**
- Create: `components/report-sections/peec-ai/parts/competitor-visibility.tsx`, `competitor-gaps.tsx`, `competitor-visibility.golden.test.tsx`, `competitor-gaps.golden.test.tsx`
- Modify: `ctx.ts` (`PeecCtx.models: AEOModel[] | null`, `PeecCtx.audience: ReportAudience`; `buildPeecCtx` args), `index.tsx` (pass both), `parts/registry.ts`, `template.ts`, `parts/__fixtures__/peec-ctx.ts`; existing parity/template tests as needed

**Interfaces:**
- Consumes: Task 14 builders, Task 3 `getOwnedUrlCitations` is **not** used here (H2 keeps `getUrlCitations`, D-10), `getDomainCoverage` (Task 2), `ReportAudience` (Task 12).
- Produces: `competitorVisibilityV1: PartImpl<PeecCtx>` (id `competitor-visibility`, label "Competitor visibility") and `competitorGapsV1` (id `competitor-gaps`, label "Where competitors are cited and you aren't"), both `published: true`, registered at version 1, and appended to `PEEC_TEMPLATE.order` immediately before `{ id: 'footer', version: 1 }` (D-11, F-1).
- Rules: `render` returns `null` when `!ctx.isPeec`; otherwise `<Suspense>` around an async child that fetches (`getPeecOverview` domains already in `ctx.data`; coverage current + previous period; `getUrlCitations` current + previous period). Deltas: always previous period; all null under a model filter; H2 citation-share Δ only when `ctx.dateRange` is `last_30_days` (D-8). Gap table columns: Page (title + linked slug), Page type (humanised `classification`), Domain, Citation share, Δ, Prompts citing it (count; for `audience === 'internal'` the count expands to the prompt texts via `trackedPrompts` by id), Competitors mentioned.

- [ ] **Step 1: Failing goldens + assertions:** each part renders `null` for a Profound ctx; `competitor-gaps` with `audience: 'client'` renders counts and **no prompt text** (assert a fixture prompt string is absent); with `'internal'` the prompt text is present after expanding; with `models` set, no Δ cells have values; H2 Δ absent when `dateRange` is `last_90_days`; `resolveSection(PEEC_TEMPLATE, undefined)` lists `competitor-visibility`, `competitor-gaps`, `footer` as its last three ids; a frozen override's resolution is unchanged (no Competitors). Mock the async fetchers with `vi.mock`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/parts`. Expected: FAIL.
- [ ] **Step 3: Implement**, register, extend `buildPeecCtx`.
- [ ] **Step 4: Run** `npx vitest run components/report-sections/peec-ai lib/report-sections && npm run check:rsc`. Expected: PASS. `guard.test.ts` passes (template pins exist and are published); review the parity snapshot diff: only the two new parts appear, above the footer.
- [ ] **Step 5: Commit.** `git commit -m "feat(aeo): Competitors parts in the default AEO Overview template"`

---

### Task 17: Release checks and before/after evidence (D-12, D-14, F-1, F-5)

**Files:**
- Create: `scripts/list-peec-clients.ts`, `scripts/content-impact-before-after.ts`

**Interfaces:**
- Produces (both read-only; neither writes to any database):
  - `scripts/list-peec-clients.ts` prints every client with `peec_customer_project_id` set and `'peec-ai'` in `enabled_reports`: slug, whether `'content-impact'` is in `hidden_reports`, and whether `report_section_config['peec-ai'].frozen` is set. Exit code 1 (with a message) if any client other than `renaissance` is listed, so the F-1 claim ("only Renaissance") can't pass silently; exit 0 otherwise.
  - `scripts/content-impact-before-after.ts <slug>` prints: Prompt Coverage KPI and per-URL coverage on the old single-page fetch vs the walked fetch; citation share (old 2,000-row denominator vs `totalCitationCount`); engagement rates that differ between first/last-variant and session-weighted (D-17); and `blankCountsByColumn` for both table scopes, as counts and as a share of rows (F-5, for Danielle).

- [ ] **Step 1: Write both scripts.** No unit tests: they are thin read-only reporters over functions already tested in Tasks 2, 3, 6.
- [ ] **Step 2: Run** `CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/list-peec-clients.ts` and `… scripts/content-impact-before-after.ts renaissance`. Expected: output prints; nothing written. (`.env.local` is the dev database; the production run happens at release, Task 18.)
- [ ] **Step 3: Commit.** `git commit -m "chore(aeo): read-only release checks and before/after evidence"` (add the new files).

---

### Task 18: Full verification and PR

- [ ] **Step 1:** `npm test && npm run typecheck && npm run lint && npm run check:rsc`. Expected: all pass.
- [ ] **Step 2:** Run the app locally (memory: local browser login via service cookie) and check `/dashboard/renaissance/reports?section=peec-ai&subsection=content-impact` as INTERNAL_ADMIN: six blocks in spec order; scope switch; switch flips and the portal view of the same client shows/hides prompt gaps; Overview shows the Competitors block just above the footer (code template; if the dev `section_templates` row exists, append the two pins there first, read the row before writing).
- [ ] **Step 3:** Push `feat/aeo-content-tab-redesign`, open the PR into `dev`. Body: link the spec and this plan; paste the before/after numbers (Prompt Coverage moves, R-1, no client note needed, F-4; citation-share denominator; D-17 ER changes) and the blank counts per column (F-5, for Danielle at staging QA); list the release steps: run `list-peec-clients.ts` against production and get Tina's OK on any non-Renaissance client and on any frozen override (D-12, D-14), then append both pins before `footer` in the staging and production `peec-ai` `section_templates` rows. End with the attribution line.
- [ ] **Step 4:** Check CI and report. The code-review record (`docs/qa/aeo-content-tab-redesign-code-review.md`, own PR off `dev`) is written against this branch before it merges.
