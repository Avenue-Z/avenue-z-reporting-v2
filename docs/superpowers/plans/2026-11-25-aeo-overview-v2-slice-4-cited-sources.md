# AEO Overview v2 — Slice 4 (05 · Cited Sources) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new v2 part, `cited-sources@1`, that replaces `domains-row` with a full-width, URL-level table: "Which URLs do AI engines cite most?", total citations in the header, filter chips, owned URLs highlighted, and Used as a source % and Citation rate each with its own Δ against the selected comparison window. Peec and Profound feed one shared row shape.

**Architecture:** Each provider gets one cached fetcher that pulls the current window and (unless Compare to is No comparison) the comparison window, reduces each to a provider-neutral `UrlWindow`, and joins them with one pure function into `CitedUrls` before caching, so the cached value is small and the prior values always cover every shown row. The part is a server component inside its own `Suspense` + `ReportErrorBoundary` (the `competitor-gaps` pattern); it passes plain data to a client table that owns the chips and builds the columns. The part reaches a client only through `extraParts` in the staging override; v1 is untouched.

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript strict, Tailwind v4, vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (on `origin/docs/aeo-overview-v2-spec`): section 6 "05 · Cited Sources", 5.3 (delta units), 7 (prompt scope), 9, 10. Foundation: slice 1 plan `docs/superpowers/plans/2026-11-25-aeo-overview-v2-slice-1-foundation.md` and its code (PR #532).

**Where to work:** start only after slice 1 (PR #532) is merged into `dev`. A fresh worktree outside `.claude/` on a new branch from `origin/dev` (memory: `check:rsc` skips `/.claude/` paths; a symlinked `node_modules` breaks `next build`):

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-cited-sources /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice4 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice4 && npm ci
```

Slices 2, 3, 5 and 6 run in parallel and also add lines to `parts/registry.ts`, `parts/export-layout.ts`, `v2/sections.ts` (`V2_PART_SECTIONS`) and the `MAINTAINING.md` recipe. Those are one-line additive edits; rebase on `dev` before opening the PR and keep every sibling's entries.

---

## Live check (2026-11-25, read-only)

Run against Renaissance (Peec) and Avenue Z (Profound category `8cf8471d-…`, read from the dev database's `clients.profound_category_id`), window 2026-10-26 to 2026-11-24. No writes to any vendor or database. Scripts lived in the session scratchpad. Profound's public OpenAPI is at `https://api.tryprofound.com/openapi.json`.

### Peec: `POST /reports/urls` (no `dimensions`)

```jsonc
{ "url": "https://renaissancebenefits.com/blog/how-brokers-should-choose-an-ancillary-benefits-carrier",
  "classification": "HOW_TO_GUIDE",      // page type; seen: HOW_TO_GUIDE PROFILE PRODUCT_PAGE COMPARISON ARTICLE LISTICLE
                                         //   CATEGORY_PAGE OTHER HOMEPAGE ALTERNATIVE DISCUSSION
  "title": "The New Broker Playbook …",  // null on 140 of the top 2,000 rows
  "channel_title": null,
  "usage_count": 1525, "retrievals": 1525, "retrieval_count": 1525,   // equal on all 20,625 rows
  "citation_count": 2115, "citation_avg": 1.3869, "citation_rate": 1.3869,  // = citation_count / retrieval_count
  "citation_position": 2.88, "citation_position_sum": 3346, "citation_position_count": 1161, "gap_score": 0,
  "mentioned_brands": [{ "id": "kw_…" }] }
```

- `retrieval_count` is the number of **distinct chats** that retrieved the URL: over 3 days, all 5,014 URLs matched a `dimensions: ['chat_id']` count exactly. So **Used as a source % = `retrieval_count` / chats in the window × 100.** The URL report carries no chat total and no percentage.
- Chats in the window: `total_chat_count` on every `/reports/domains` row (8,979; Renaissance's own domain `retrieved_chat_count` 3,318 / 8,979 = its `retrieved_percentage` 0.3695). The domain rows also carry the **source** classification (`OWN`, `COMPETITOR`, `CORPORATE`, `EDITORIAL`, `UGC`, `REFERENCE`, `INSTITUTIONAL`, `OTHER`), joined to a URL by host.
- A full walk is 20,625 URLs, 9.8 MB, 4.4 s (3 pages of 10,000). `/reports/domains` with `limit: 5000` returned exactly 5,000 rows, so walk it too.
- Totals agree: URL `citation_count` sum 46,843 vs domain sum 46,756 (the domain pull was capped).

### Profound: page level exists, "used as a source" does not

- **Page rows:** `POST /v1/reports/citations`, `dimensions: ['url']` (9,817 rows) or `['citation_category','hostname','url']`; or `POST /v2/reports/citations` with `entity: 'page'` (`{ page, citation_category, count, citation_share, rank, first_cited_at }`, cursor pages of at most 50). v1 returns dimensions in **alphabetical order, not request order**; read `info.query.dimensions`.
- **No title and no page type** in any report. Titles exist only in `/v2/prompts/answers` `citation_details` (1.6 MB per day; ~48 MB per 30 days). Profound's `citation_category` is a **source** type, not a page type: `owned`, `competition`, `earned_media`, `earned_institutions`, `pr_wire`, `social`, `other` (`GET /v1/org/categories/{id}/citation-categories`). Each page carried one category in a 3-day sample.
- **`count` is citation occurrences**, not answers (49 of the top 50 pages matched occurrences in one day's answers; a Reddit thread had 42 citations in 30 answers). `citation_share` has an undocumented denominator (0.0223 against a count/total of 0.0178): do not use it.
- **Exact Used as a source %** needs the answer stream: `POST /v2/prompts/answers/stream`, `include: ['citations']`, `filter: { field: 'analysis_type', op: 'is', value: 'visibility' }`. Server-sent events: one `summary` (`total_results`), then one `result` per answer (`{ citations: string[] }`, raw URLs with `utm_*`, fragments, `www.`). 30 days: 13,498 answers, 8.1 MB, 7.2 s. Its per-page occurrence totals match the report's `count`.
- **Prompt type (spec 7):** on citations and answers the filter is `analysis_type` (`prompt_type` still works but the OpenAPI marks it deprecated and both returned 76,984 citations; `sentiment` 14,488; none 104,720). The **visibility report rejects it** with 422 on v1 and v2 ("visibility is always over visibility analysis"): visibility, share of voice and rank need no filter. Answers: 19,708 in all = 13,498 visibility + 2,610 sentiment + accuracy.
- URL keys: raw answer URLs normalise to the report's `clean_url` except ~1% after stripping scheme, `www.` and `utm_*` (left over: doubled slashes, YouTube `&t=`). The stream is the row source here, so this only affects the category join.

### What this changes in the spec

1. Peec Used as a source % is not "derivable" from the URL report alone: it needs the window's chat count from `/reports/domains` (spec section 6, 05).
2. Profound has page-level **citations**, but its reports have no retrieval or "used as a source" metric, no titles and no page type. This plan computes the exact share from the answer stream, shows the URL without a title, and hides the Page type column for Profound.
3. Spec section 7: only Profound **citation** and **answer** calls need `analysis_type = visibility`. The visibility report is always Visibility-type. The current overview's citation calls (`lib/profound/client.ts:463-465`) are unfiltered, which matters to slices 2 and 6 (Used as a source % per brand and the KPI).
4. "Citation rate" is an average (citations per answer that used the page, 1.39 for Renaissance's top page), not a percentage, so its Δ is a relative change in `%` (5.3's `pts` rule is for rates that are percentages).

## Decisions taken in this plan (Paul can overturn any)

| # | Decision | Why |
|---|---|---|
| D1 | Peec: Used as a source % = `retrieval_count` / `total_chat_count` × 100; Citation rate = `citation_count` / `retrieval_count` (Peec's own `citation_rate`). | Measured above; same rules as the AEO Informed Social tab (`lib/organic-social/aeo-informed/ENGINEERS.md`). |
| D2 | Profound: Used as a source % = Visibility-type answers citing the page / all Visibility-type answers × 100; Citation rate = citations / answers citing it. Both from the answer stream. | The only exact source. Profound records citations, not retrievals, so its "used" means "cited"; each provider's tooltip says what it measures. |
| D3 | Windows longer than 92 days (`MAX_URL_WINDOW_DAYS`) show a notice instead of the table, for both providers, with no vendor call. | Year to date would be ~90 MB of Profound stream and >100k Peec URL rows. Covers every preset up to Last 90 Days and the quarters. |
| D4 | Profound shows the URL with no title; the Page type column is hidden for Profound. | No title outside `citation_details` (~48 MB/month). Follow-up if Tina wants titles. |
| D5 | Source type: Peec domain classification by host (walking up to parent domains), Profound `citation_category`. Own = `OWN` / `owned`, Competitor = `COMPETITOR` / `competition`; everything else is third party, labelled with its class. | Spec: "Own / Competitor / third-party classification". |
| D6 | Rows: ranked by Used as a source % (desc), then citations, then key; the cached result keeps the top 500 (`URL_ROW_CAP`) plus every own row below it. | Keeps the cached value under Next's 2 MB limit and the "Your URLs" chip complete. |
| D7 | The chips are client-only; the PDF prints All. | Spec 10 lists the toggles the export must keep; chips are not among them. |
| D8 | Page cell is plain text (title, then full URL), never a link. | Vendor strings; no `href` from untrusted input. |
| D9 | A failed prior-window fetch fails the part (error card), it is not cached without deltas. | `cached()` does not cache throws; a degraded result would be served for an hour. |
| D10 | Model filter is not applied; under an active filter the header says "Not filtered by AI model." | Spec 10: parts that can't honour it say so. |
| D11 | Section `05` headline becomes "Which URLs do AI engines cite most?" (spec wording); the part adds no second title. | One heading per section. |

## Global Constraints

- v1 output must not change: no `-u` on any existing golden or snapshot; `parity.golden.test.tsx` and every existing `parts/*.golden.test.tsx` stay green untouched. `lib/peec/url-citations.ts`, `lib/peec/client.ts`, `lib/profound/client.ts` and `parts/domains-row.tsx` are not modified.
- Part id `cited-sources`, version `1`, `defaultLabel: 'Cited Sources'`; `V2_PART_SECTIONS['cited-sources@1'] = '05'`; `PEEC_EXPORT_LAYOUT['cited-sources@1'] = 'own'`.
- Copy: header title `Which URLs do AI engines cite most?`; header count `{n} citations` (`toLocaleString()`); chips `All`, `Your URLs`, `Competitor URLs`, `Third-party`; columns `#`, `Page`, `Source type`, `Page type`, `Used as a source %`, `Δ`, `Citation rate`, `Δ`. The word "Retrieved" appears nowhere in this part.
- Deltas: Used as a source % Δ in `pts` (`usedPct − prior.usedPct`), Citation rate Δ in `pct` (`pctChange(rate, priorRate)`), both `betterWhen: 'higher'`, via slice 1's `deltaColumn`. A row absent from the comparison window shows `New`; a missing value shows `–`. Δ columns are absent when `showDeltas` is false.
- Values: Used as a source % prints one decimal with `%`; Citation rate prints two decimals, no unit.
- Profound citation and answer requests carry `analysis_type = visibility` (spec 7); Peec requests carry no prompt filter.
- `'use client'` only on the table file; the server part passes plain data (no functions) to it (`npm run check:rsc`). No `any`.
- New `lib/aeo/**` and `lib/peec/cited-urls.test.ts` tests must be added to the `include` list in `vitest.config.ts` (memory: unlisted lib tests are silently skipped). `lib/profound/**` is already globbed.

## Review Focus

1. **A URL in this period that wasn't cited in the comparison period.** Expect `New` in both Δ cells, sorted last when sorting by Δ in either direction. Test: Task 1 (`joinWindows marks rows missing from prior as new`), Task 4 (`New sinks`).
2. **A window with zero chats/answers, or a URL with citations and zero retrievals.** Expect `–`, never `NaN`, `Infinity` or `0.0%`. Test: Task 1 (`zero denominators give null`).
3. **One Profound answer cites the same page twice (once with `?utm_source=chatgpt.com`).** Expect used counted once, citations twice, rate 2.00. Test: Task 3 (`dedupes a page within one answer`).
4. **Year to date selected.** Expect the "92 days or less" notice, no vendor request. Test: Task 1 (`windowTooLong`), Task 5 (`too-long window skips fetchers`).
5. **A vendor title like `<img src=x onerror=…>` or a URL starting `javascript:`.** Expect it rendered as literal text, no anchor element. Test: Task 4 (`renders vendor strings as text`).

## Edge cases (edge-case gate; copy into the commit bodies of Tasks 2, 3 and 5)

| Area | Case | Call |
|---|---|---|
| External failure | Peec/Profound non-2xx, Profound 503 "query too broad", non-JSON SSE `data:` | **fix**: throw with status + path; part shows its error card (D9) |
| External failure | Peec 429 | **fix**: reuse `post` (one retry, `Retry-After`) |
| External failure | Stream ends early (`summary.total_results` ≠ results received) | **fix**: `complete: false` + `console.warn` naming client and window |
| Operator visibility | Which client/window failed | **fix**: `console.error('[cited-sources] …', { client, provider, start, end })`, never URLs or tokens |
| Bounds | Peec walk size | **fix**: `fetchAllPagesChecked` with `CITATION_PAGE_SIZE`/`CITATION_MAX_PAGES`; truncation warns |
| Bounds | Long windows | **fix**: D3 |
| Bounds | Cached value size | **fix**: D6 cap |
| Input boundaries | `title: null`, `classification: null`, unparseable URL, unknown category | **fix**: URL only; page type `null`; host `''` → Other; unknown → Other |
| State/concurrency | Two renders miss the cache at once | **decline**: two identical reads, same as every other cached fetcher |
| Security | Vendor strings in the DOM | **fix**: D8, React text only |
| Security | API keys in logs | **fix**: logs carry slug and dates only |

---

### Task 1: Shared row shape and the window join

**Files:**
- Create: `lib/aeo/cited-urls.ts`
- Test: `lib/aeo/cited-urls.test.ts`
- Modify: `vitest.config.ts` (add `'lib/aeo/cited-urls.test.ts'` to `include`)

**Interfaces:**
- Produces:
  - `type SourceType = 'own' | 'competitor' | 'third_party'`
  - `type UrlWindowRow = { key: string; url: string; title: string | null; sourceType: SourceType; sourceLabel: string; pageType: string | null; answersUsing: number; citations: number }`
  - `type UrlWindow = { rows: UrlWindowRow[]; totalAnswers: number; totalCitations: number; complete: boolean }`
  - `type CitedUrlRow = { rank: number; key: string; url: string; title: string | null; sourceType: SourceType; sourceLabel: string; pageType: string | null; usedPct: number | null; citationRate: number | null; prior: { usedPct: number | null; citationRate: number | null } | null }`
  - `type CitedUrls = { provider: 'peec' | 'profound'; rows: CitedUrlRow[]; totalRows: number; totalCitations: number; compared: boolean; hasPageType: boolean; complete: boolean; tooLong: boolean }`
  - `const URL_ROW_CAP = 500`, `const MAX_URL_WINDOW_DAYS = 92` (the one place the 92-day cutoff lives; open with Tina)
  - `providerHasPageType(provider: 'peec' | 'profound'): boolean` — Peec `true`, Profound `false`. The one switch for the Page type column (open with Tina); `joinWindows` and `emptyCitedUrls` read it, nothing else decides it.
  - `type IsoWindow = { startDate: string; endDate: string }`
  - `windowTooLong(w: IsoWindow): boolean` (inclusive day count > 92)
  - `emptyCitedUrls(provider, opts?: { tooLong?: boolean }): CitedUrls`
  - `joinWindows(provider: 'peec' | 'profound', current: UrlWindow, prior: UrlWindow | null, opts?: { cap?: number }): CitedUrls` — `hasPageType = providerHasPageType(provider)`; `usedPct = totalAnswers > 0 ? answersUsing / totalAnswers * 100 : null`; `citationRate = answersUsing > 0 ? citations / answersUsing : null`; prior matched by `key` (prior's own `usedPct`/`citationRate` from prior's totals); `prior: null` when no match or no prior window; `compared = prior !== null`; sort `usedPct` desc (null last), then `citations` desc, then `key` asc; `rank` = 1-based position in that order; keep the first `cap` rows plus every `own` row after them; `totalRows` = rows before the cap; `complete = current.complete && (prior?.complete ?? true)`.

- [ ] **Step 1: Write the failing tests** (`row(key, o)` builds a `UrlWindowRow` with `answersUsing: 10, citations: 10, sourceType: 'third_party'`)
  - `joinWindows computes used % and rate`: current `{ totalAnswers: 200, rows: [row('a', { answersUsing: 50, citations: 75 })] }` → `usedPct 25`, `citationRate 1.5`.
  - `joinWindows marks rows missing from prior as new`: prior has `a` only → `b.prior === null`, `a.prior.usedPct` from prior totals; with `prior = null` → `compared false`, every `prior` null.
  - `zero denominators give null`: `totalAnswers: 0` → `usedPct null`; `answersUsing: 0, citations: 4` → `citationRate null`; nothing is `NaN`/`Infinity`.
  - `ranks and ties are deterministic`: equal `usedPct` → more citations first, then key ascending; ranks `1..n`.
  - `cap keeps every own row`: 600 third-party rows + 3 own rows ranked 550–552, `cap 500` → 503 rows, `totalRows 603`, own ranks kept (550–552).
  - `windowTooLong`: `2026-01-01..2026-04-02` (92 days) false; `2026-01-01..2026-04-03` true.
  - `page type follows the provider`: `joinWindows('peec', …).hasPageType` true, `'profound'` false, `emptyCitedUrls('profound').hasPageType` false.
- [ ] **Step 2: Run** `npx vitest run lib/aeo/cited-urls.test.ts` — Expected: FAIL (module not found). If it reports "No test files found", the `include` entry is missing.
- [ ] **Step 3: Implement** `lib/aeo/cited-urls.ts` (pure, no imports from vendors).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): cited URL row shape and window join`

---

### Task 2: Peec URL window

**Files:**
- Create: `lib/peec/cited-urls.ts`
- Test: `lib/peec/cited-urls.test.ts`
- Modify: `vitest.config.ts` (add `'lib/peec/cited-urls.test.ts'`)

**Interfaces:**
- Consumes: Task 1; from `lib/peec/url-citations.ts` (unchanged): `post`, `fetchAllPagesChecked`, `walkReportingDuplicates`, `hostOf`, `CITATION_PAGE_SIZE`, `CITATION_MAX_PAGES`, `type ApiUrlRow`; `urlJoinKey` (`@/lib/url`); `cached` (`@/lib/cache`).
- Produces:
  - `type PeecDomainRow = { domain: string; classification: string | null; total_chat_count: number }`
  - `peecPageTypeLabel(c: string | null): string | null` — `HOW_TO_GUIDE` → `How-to guide`; otherwise lowercase, `_` → space, first letter capital (`PRODUCT_PAGE` → `Product page`, `UGC` stays `UGC`); `null` → `null`.
  - `peecSource(host: string, classByDomain: Map<string, string>): { sourceType: SourceType; sourceLabel: string }` — exact host, then each parent (`blog.x.com` → `x.com`); `OWN` → own/`Own`, `COMPETITOR` → competitor/`Competitor`, `CORPORATE|EDITORIAL|UGC|REFERENCE|INSTITUTIONAL` → third_party with `Corporate`/`Editorial`/`UGC`/`Reference`/`Institutional`, anything else → third_party/`Other`.
  - `mapPeecWindow(urls: ApiUrlRow[], domains: PeecDomainRow[], complete: boolean): UrlWindow` — `key = urlJoinKey(url)` (rows without a key dropped; a repeated key sums `retrieval_count`/`citation_count` and keeps the first title); `answersUsing = retrieval_count`; `citations = citation_count`; `totalAnswers = domains[0]?.total_chat_count ?? 0`; `totalCitations` = sum of `citation_count`.
  - `getPeecCitedUrls(clientSlug: string, current: IsoWindow, prior: IsoWindow | null): Promise<CitedUrls>` — `cached('peec', 'getPeecCitedUrls', impl, { version: 'v1', extractTags: ([slug]) => ({ client: slug }) })`. Project id from `getClientBySlug(slug).peecCustomerProjectId`; none → `emptyCitedUrls('peec')`. Per window, in parallel: walk `/reports/urls` (`{ start_date, end_date, limit, offset }`, `rowKey: r => r.url`) and walk `/reports/domains` (page size 10,000, max 5 pages, `rowKey: r => r.domain`). Then `joinWindows('peec', current, prior)`.

- [ ] **Step 1: Write the failing tests** (fixtures copy the live row shape above)
  - `used % uses the window's chats`: URL `retrieval_count 1525, citation_count 2115`, domains `total_chat_count 8979` → after `joinWindows`, `usedPct ≈ 16.98`, `citationRate ≈ 1.3869`.
  - `source type by host and parent`: `renaissancebenefits.com` `OWN` → `own/Own` for `https://www.renaissancebenefits.com/blog/x` and `https://blog.renaissancebenefits.com/y`; `reddit.com` `UGC` → `third_party/UGC`; unknown host → `third_party/Other`; `classification: null` → Other.
  - `page type labels`: `HOW_TO_GUIDE` → `How-to guide`, `PRODUCT_PAGE` → `Product page`, `null` → `null`.
  - `null title is kept null` and a URL whose `urlJoinKey` is null is dropped.
  - `fetcher sends no prompt filter and walks both reports`: mock `fetch`; for `current` + `prior` assert four request paths (`/reports/urls` ×2, `/reports/domains` ×2), bodies carry `project_id`, the window dates, no `filters`; with `prior = null`, two requests and `compared false`.
  - `no Peec project → empty, no fetch`.
- [ ] **Step 2: Run** `npx vitest run lib/peec/cited-urls.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `lib/peec/cited-urls.ts`. Errors propagate (D9); log `console.error('[cited-sources] peec fetch failed', { client, start, end })` before rethrowing.
- [ ] **Step 4: Run** the test, then `npx vitest run lib/peec/url-citations.test.ts` (unchanged file still green). Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): Peec cited URL window` (edge-case table in the body).

---

### Task 3: Profound URL window

**Files:**
- Create: `lib/profound/cited-urls.ts`
- Test: `lib/profound/cited-urls.test.ts`

**Interfaces:**
- Consumes: Task 1; `profoundPost` from `lib/profound/client.ts` (unchanged); `cached`.
- Produces:
  - `profoundPageKey(raw: string): string | null` — lowercase host without `www.`, path with repeated `/` collapsed, no fragment, query without `utm_*` params (other params kept, in order), no scheme; unparseable → `null`. Cases: `https://www.siegemedia.com//services/geo?utm_source=chatgpt.com` → `siegemedia.com/services/geo`; `https://minuttia.com/best/#:~:text=x` → `minuttia.com/best/`; `https://www.youtube.com/watch?v=abc&utm_source=x` → `youtube.com/watch?v=abc`; `https://seller-us.tiktok.com/partners/us/?seller_type=2` unchanged apart from scheme.
  - `parseAnswerStream(text: string): { totalResults: number | null; answers: { citations: string[] }[] }` — split events on blank lines (`\r?\n\r?\n`), read `event:` and joined `data:` lines; `summary` → `total_results`; `result` → answer; an `error` event throws.
  - `type ProfoundCategoryRow = { url: string; hostname: string; category: string }`
  - `parseCategoryRows(res: { info: { query?: { dimensions?: string[] } }; data: { dimensions: (string | null)[] }[] }): ProfoundCategoryRow[]` — positions from `info.query.dimensions` (alphabetical in practice, never assume request order).
  - `profoundSource(category: string | undefined): { sourceType: SourceType; sourceLabel: string }` — `owned` → own/`Own`, `competition` → competitor/`Competitor`, `earned_media` → `Earned media`, `earned_institutions` → `Institution`, `pr_wire` → `PR wire`, `social` → `Social`, else `Other` (third_party).
  - `mapProfoundWindow(stream: ReturnType<typeof parseAnswerStream>, categories: ProfoundCategoryRow[]): UrlWindow` — per answer, keys via `profoundPageKey`; `citations` += every occurrence, `answersUsing` += 1 per distinct key; `url = key`; `title: null`; `pageType: null`; category by key, else the host's most frequent category, else `other`; `totalAnswers = answers.length`; `complete = totalResults === answers.length`.
  - `getProfoundCitedUrls(clientSlug: string, current: IsoWindow, prior: IsoWindow | null): Promise<CitedUrls>` — `cached('profound', 'getProfoundCitedUrls', impl, { version: 'v1', extractTags })`. Category id from `getClientBySlug(slug).profoundCategoryId`; none → `emptyCitedUrls('profound')`. Per window, in parallel: stream `POST https://api.tryprofound.com/v2/prompts/answers/stream` body `{ category_id, start_date, end_date, include: ['citations'], filter: { field: 'analysis_type', op: 'is', value: 'visibility' } }` with `X-API-Key`, `cache: 'no-store'` (8 MB per 30 days, over the 2 MB data cache); categories only for the current window: `profoundPost('/v1/reports/citations', { category_id, start_date, end_date, metrics: ['count'], dimensions: ['citation_category', 'hostname', 'url'], filters: [{ field: 'analysis_type', operator: 'is', value: 'visibility' }], pagination: { limit: 50000 } }, { revalidate: false })`. Then `joinWindows('profound', current, prior)`.

- [ ] **Step 1: Write the failing tests**
  - `profoundPageKey` table above, plus `'not a url'` → `null`.
  - `parseAnswerStream`: a two-answer SSE text (`event: summary\ndata: {"total_results": 2, …}\n\nevent: result\ndata: {"citations": [...]}\n\n…`) → `totalResults 2`, 2 answers; an `event: error` block throws.
  - `dedupes a page within one answer`: answers `[[A, A+'?utm_source=chatgpt.com'], [A], [B]]` → `A.answersUsing 2, A.citations 3`; after `joinWindows` (`totalAnswers 3`) `A.usedPct ≈ 66.7`, `citationRate 1.5`.
  - `category join`: url match → its category; unmatched URL on a host seen as `competition` → Competitor; unknown host → Other; `owned` → own.
  - `parseCategoryRows honours info.query.dimensions order`: `dimensions: ['citation_category','hostname','url']` with rows in that order parse right; a response whose `info.query.dimensions` is `['url','hostname','citation_category']` parses by those positions.
  - `requests carry the Visibility filter`: mock `fetch`; the stream body has `filter.field 'analysis_type'`, `value 'visibility'`, `include ['citations']`; the v1 citations body has `filters[0].field 'analysis_type'`; no request goes to `/v1/reports/visibility`.
  - `short stream is incomplete`: `total_results 3`, two results → `complete false`.
- [ ] **Step 2: Run** `npx vitest run lib/profound/cited-urls.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `lib/profound/cited-urls.ts`. Non-2xx stream → `throw new Error(`Profound API error ${status}: /v2/prompts/answers/stream`)` after logging status and the first 300 characters of the body; same `[cited-sources]` error log as Task 2.
- [ ] **Step 4: Run** `npx vitest run lib/profound` — Expected: PASS (existing Profound tests unchanged).
- [ ] **Step 5: Commit** `feat(aeo-v2): Profound cited URL window from the answer stream` (edge-case table in the body).

---

### Task 4: Cited sources table (client)

**Files:**
- Create: `components/report-sections/peec-ai/v2/cited-sources-table.tsx` (`'use client'`)
- Test: `components/report-sections/peec-ai/v2/cited-sources-table.test.tsx`

**Interfaces:**
- Consumes: `CitedUrls`, `CitedUrlRow` (Task 1); `SortableTable` (`../sortable-table`); `deltaColumn`, `pctChange` (slice 1, `./delta-columns`, `./delta`); `useExportMode`.
- Produces: `CitedSourcesTable({ data, showDeltas, modelActive }: { data: CitedUrls; showDeltas: boolean; modelActive: boolean })`.
  - Header row: the total `{data.totalCitations.toLocaleString()} citations`; `Not filtered by AI model.` when `modelActive`.
  - Chips (`role="radiogroup"`, buttons `role="radio"`, `aria-checked`): `All` (default), `Your URLs` (`own`), `Competitor URLs` (`competitor`), `Third-party` (`third_party`). Hidden in export mode (export shows All).
  - Columns: `#` (`rank`), `Page` (title in `text-white`, then the URL in `text-text-muted break-all`; both wrap; title omitted when null), `Source type` (`sourceLabel`), `Page type` (only when `data.hasPageType`; `pageType ?? '–'`), `Used as a source %` (`usedPct.toFixed(1)%`, `–` when null), `Δ` (key `usedDelta`, `pts`), `Citation rate` (`toFixed(2)`, `–` when null), `Δ` (key `rateDelta`, `pct`). Both Δ columns only when `showDeltas && data.compared`; `isNew = row => data.compared && row.prior === null`.
  - Tooltips: Used as a source % — Peec `Share of AI answers that used this page as a source.`; Profound `Share of AI answers (Visibility prompts) that cited this page.` Citation rate — Peec `Average times this page is cited in an answer that used it as a source.`; Profound `Average times this page is cited in an answer that cites it.`
  - `defaultSortKey="usedPct"`, `defaultSortDir="desc"`, `initialPageSize={10}`, `rowKey={r => r.key}`, `rowClassName={r => r.sourceType === 'own' ? 'bg-[#60FDFF]/[0.06] shadow-[inset_2px_0_0_#60FDFF]' : ''}`.
  - Empty: `data.tooLong` → `Choose a date range of 92 days or less to see cited pages.`; no rows → `No cited pages for this period.`; chip with no rows → `No URLs of this type in this period.`

- [ ] **Step 1: Write the failing tests** (fixture `CitedUrls` with one own, one competitor, one third-party row; the third-party row has `prior: null`; the own row has `title: '<img src=x onerror=alert(1)>'` and `url: 'javascript:alert(1)'`)
  - `renders columns and the total`: headers in order `# Page Source type Page type Used as a source % Δ Citation rate Δ`; text `1,234 citations`.
  - `chips filter rows`: click `Your URLs` → one row; `Third-party` → the third-party row; `All` → three.
  - `own row highlighted`: the own row's `<tr>` has class `bg-[#60FDFF]/[0.06]`.
  - `New sinks` / deltas: competitor row shows `+2.0 pts` and `+10.0%`; third-party row shows `New` in both Δ cells.
  - `deltas off or no comparison hides Δ columns`: `showDeltas false` → no `Δ` header; `compared false` → no `Δ` header.
  - `Profound hides Page type`: `hasPageType false` → no `Page type` header.
  - `renders vendor strings as text`: the literal title text is present, `container.querySelector('img')` is null, no `<a>` element.
  - `too-long notice`: `tooLong true` → the notice, no table rows.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/cited-sources-table.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the component; compute `usedDelta = prior?.usedPct != null && usedPct != null ? usedPct - prior.usedPct : null` and `rateDelta = citationRate != null ? pctChange(citationRate, prior?.citationRate) : null` once per row with `useMemo`.
- [ ] **Step 4: Run** the test and `npm run check:rsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): cited sources table with chips and deltas`

---

### Task 5: The `cited-sources@1` part, registration and staging recipe

**Files:**
- Create: `components/report-sections/peec-ai/parts/cited-sources.tsx`
- Create: `components/report-sections/peec-ai/parts/cited-sources.golden.test.tsx`
- Modify: `components/report-sections/peec-ai/parts/registry.ts` (`'cited-sources': { 1: citedSourcesV1 }`)
- Modify: `components/report-sections/peec-ai/parts/export-layout.ts` (`'cited-sources@1': 'own'`)
- Modify: `components/report-sections/peec-ai/v2/sections.ts` (`V2_PART_SECTIONS` entry; `OVERVIEW_SECTIONS['05'].headline = 'Which URLs do AI engines cite most?'`)
- Modify: `components/report-sections/peec-ai/MAINTAINING.md` (recipe entry)

**Interfaces:**
- Consumes: Tasks 1–4; `PeecCtx` (`ctx.provider`, `ctx.clientSlug`, `ctx.dateRange`, `ctx.compare`, `ctx.showDeltas`, `ctx.modelActive`); `parseDateRange`, `deriveCompareRange` (`@/lib/ga4/client`); `fetchCompareMode` (`../v2/compare`); `ReportErrorBoundary`.
- Produces:
  - `citedSourcesWindows(dateRange: string | undefined, compare: AeoCompare): { current: IsoWindow; prior: IsoWindow | null; tooLong: boolean }` — range defaults to `last_30_days`; `prior = compare === 'none' ? null : deriveCompareRange(range, fetchCompareMode(compare))`.
  - `CitedSourcesSection(props: { provider: AeoProvider; clientSlug: string | undefined; dateRange: string | undefined; compare: AeoCompare; showDeltas: boolean; modelActive: boolean })` (async server component): no slug → `null`; `tooLong` → `<CitedSourcesTable data={emptyCitedUrls(provider, { tooLong: true })} …/>` without calling a fetcher; else `getPeecCitedUrls` or `getProfoundCitedUrls`.
  - `citedSourcesV1: PartImpl<PeecCtx>` — `id: 'cited-sources'`, `version: 1`, `published: true`, `defaultLabel: 'Cited Sources'`; renders `<Suspense fallback={skeleton with data-export-pending}>` → `<ReportErrorBoundary sectionName="Cited Sources">` → `CitedSourcesSection`, all inside one full-width card (`rounded-xl border border-white/[0.06] bg-bg-surface p-6`).

- [ ] **Step 1: Write the failing tests** in `cited-sources.golden.test.tsx` (mock `@/lib/peec/cited-urls` and `@/lib/profound/cited-urls` as `competitor-gaps.golden.test.tsx` mocks `url-citations`):
  - `cited-sources@1 golden (Peec)`: `await CitedSourcesSection(...)` with `FIXTURE_PEEC_CTX` values and a fixture `CitedUrls`; snapshot (new file).
  - `Profound routes to the Profound fetcher`: `provider 'profound'` → `getProfoundCitedUrls` called with `('renaissance', current, prior)`, Peec fetcher not called.
  - `compare previous_year passes the year-ago window; none passes null`.
  - `too-long window skips fetchers`: `vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))`, `dateRange 'year_to_date'` → neither fetcher called; notice text present.
  - Extend `components/report-sections/peec-ai/v2/sections.test.ts`: `isV2Layout([{ id: 'cited-sources', version: 1 }])` is `true` with the real map.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/parts/cited-sources.golden.test.tsx components/report-sections/peec-ai/v2/sections.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the part and the four registrations. Note `export-layout.test.ts` and `guard.test.ts` must stay green (every registered part has a layout; the template is untouched, so `cited-sources` is not pinned there).
- [ ] **Step 4: Update `MAINTAINING.md`**: in the staging override example, add `{ "id": "cited-sources", "version": 1 }` to `extraParts` and `"cited-sources"` to `order` (it replaces `domains-row`, already in `hidden`). Note: slice 4 adds no template change; production stays on `domains-row@1` until the flip (slice 7).
- [ ] **Step 5: Run the full gate**: `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS; `git status` shows no changed `__snapshots__` other than the new `cited-sources.golden.test.tsx.snap`. That is the v1 goldens' proof.
- [ ] **Step 6: Commit** `feat(aeo-v2): 05 Cited Sources part (cited-sources@1)` (edge-case table in the body).

---

## After the tasks

- Whole-branch review, then push `feat/aeo-overview-v2-cited-sources` and open a PR into `dev` (base must be `dev`).
- Review record `docs/qa/aeo-overview-v2-cited-sources-code-review.md` on its own `docs/` branch off `dev`, citing the feature diff range (CLAUDE.md Stage 1). §1 must answer "how is Used as a source % calculated?" for each provider from D1 and D2.
- Staging (after the slice reaches staging, on Paul's go): add `cited-sources@1` to Renaissance's and Avenue Z's staging `report_section_config['peec-ai']` per the recipe. Save the current override first.
- Live acceptance on staging: Renaissance's top own URL reads Used as a source % ≈ `retrieval_count / total_chat_count` for the picked window (2026-10-26..11-24: 1,525 / 8,979 = 17.0%); Avenue Z's `avenuez.com/services/aeo-optimization/` ≈ 1.6% over the same window (212 citations).
- Follow-ups to file, not build here: Profound page titles (D4); the visibility-type filter on the overview's existing Profound citation calls (spec change 3, slices 2 and 6).
