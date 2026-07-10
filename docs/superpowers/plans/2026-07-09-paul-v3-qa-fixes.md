# Paul V3 QA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every issue Paul surfaced across his live-tab QA (Column H of the two feedback CSVs, 9 items) and his sentiment code review (GitHub PR #138, 10 items), on one branch, one PR to dev.

**Architecture:** Three independent workstreams. WS1 adds citation dates to the PR matchback (new isolated Peec fetch + pure aggregation + column render). WS2 fixes Content Impact / PR Influence live-QA issues (reactivity, formatting, scatter, filters, copy). WS3 fixes latent bugs in the Profound sentiment code (normalize, pagination, gating, cache, cleanup). Each task is TDD where the logic is unit-testable; wiring tasks anchor on exact file:line and are live-verified.

**Tech Stack:** Next.js 16 RSC, TypeScript strict, Vitest, Peec AI + Profound APIs, Recharts, Tailwind.

## Global Constraints

- No em dashes or en dashes anywhere (prose, code, comments, commits, docs). Use period, comma, parentheses, or colon.
- React to model + date wherever the data allows. Two fixed ceilings: the scatter's 30-day Peec bot-retention window, and comparison deltas that need per-model prior-period data.
- Avenue Z surfaces stay data-only. No AI/Glean synopsis added or changed. Honest no-data, never fabricated.
- `ds_id` / model ids resolved via existing helpers; never hardcode client slugs (P6 fixes an existing violation).
- Per task: `npx tsc --noEmit`, `npm run check:rsc`, and focused `vitest run <file>` must pass. The full suite has pre-existing flaky golden-test timeouts, so run focused tests per task.
- The `vitest.config.ts` include is a curated literal list (NOT a glob, to avoid a known-broken test). Any task that CREATES a new `*.test.ts` file MUST add that literal path to the include array in the same task, or its tests will not run.
- Peec fetch auth is unchanged: `X-API-Key = process.env.PEEC_AI_CUSTOMER_TOKEN`, project id from the client row (`peecCustomerProjectId`).
- Add each fixed item to `docs/official-feedback/feedback-log.md` in the final docs task.

## Verified API facts (read-only probes, 2026-07-09, live Avenue Z project)

- `/reports/domains` dimensioned `['model_id','date']`: per-domain per-day per-engine rows with `date`, `model.id`, `citation_count`. Model ids: `chatgpt-scraper`, `perplexity-scraper`, `gemini-scraper`, `google-ai-overview-scraper` (map via existing `normalizeEngine`).
- Sort: no `order_by` = date ascending (default); any `order_by` on `date` forces descending. So first-cited = default fetch, most-recent = `order_by:[{field:'date',order:'desc'}]`.
- Response envelope has only `data` (no total); paginate via `offset`, detect end by a short page.
- `/reports/urls` dimensioned `['prompt_id','model_id']`: per-URL rows with `prompt.id` + `model.id` (4 engines). Enables model-reactive Prompt Coverage.

---

# Workstream 1: FB-068 citation dates (Column H PR-3)

Detailed design: `docs/superpowers/specs/2026-07-09-pr-influence-citation-dates-design.md`.

### Task 1: pure `buildCitationDateIndex` + types

**Files:**
- Create: `lib/peec/citation-dates.ts`
- Test: `lib/peec/citation-dates.test.ts`
- Modify: `vitest.config.ts` (add the test path to the include array, literal path not glob)

**Interfaces:**
- Produces: `type CitationDateIndex = Record<string, Record<string, { first: string; last: string }>>` (outer key = normalized host, inner key = engine label OR the literal `'*'` for the any-engine roll-up; dates are `YYYY-MM-DD`). `type ApiDomainDateRow = { domain: string; date: string; model?: { id: string }; citation_count?: number }`. `function buildCitationDateIndex(rows: ApiDomainDateRow[]): CitationDateIndex`.

- [ ] **Step 1: Write failing tests** in `lib/peec/citation-dates.test.ts`:
  - multi-day host: rows for host `a.com` on 2026-06-10 and 2026-06-20 (engine `chatgpt-scraper`) => index['a.com']['ChatGPT'] = {first:'2026-06-10', last:'2026-06-20'} and index['a.com']['*'] same.
  - two engines: `a.com` cited by chatgpt-scraper on 06-10 and perplexity-scraper on 06-15 => ['a.com']['ChatGPT']={first:'2026-06-10',last:'2026-06-10'}, ['Perplexity']={first:'2026-06-15',last:'2026-06-15'}, ['*']={first:'2026-06-10',last:'2026-06-15'}.
  - host normalization: `www.A.com` and `a.com` fold to one key `a.com`.
  - single-day host: first === last.
  - empty rows => {}.
  - rows with unmappable model id (normalizeEngine returns null) still contribute to `'*'` but not to any engine key.
- [ ] **Step 2: Run** `npx vitest run lib/peec/citation-dates.test.ts` => FAIL (module missing).
- [ ] **Step 3: Implement** `buildCitationDateIndex`: reuse the shared helpers rather than duplicating (duplication is exactly what P8 fixes). Add `export` to `normalizeEngine` in `lib/peec/url-citations.ts` (a helper-only export; it does NOT change `getUrlCitations`) and import it here, and import `normHost` from `lib/pr-proof/matchback.ts`. For each row: `h = normHost(row.domain)`; skip if empty or no date; update `'*'` min/max; if `normalizeEngine(row.model?.id ?? '')` returns an engine label, update that engine's min/max. Min/max via string compare (ISO dates sort lexically).
- [ ] **Step 4: Run tests** => PASS.
- [ ] **Step 5: Commit** `feat(FB-068): pure buildCitationDateIndex + tests`.

### Task 2: `getPlacementCitationDates` bounded paginated fetch

**Files:**
- Modify: `lib/peec/citation-dates.ts`
- Test: `lib/peec/citation-dates.test.ts` (add fetch-mocked cases)

**Interfaces:**
- Consumes: `buildCitationDateIndex`, `CitationDateIndex` (Task 1).
- Produces: `async function getPlacementCitationDates(clientSlug?: string, opts?: { startDate?: string; endDate?: string; targetHosts?: string[] }): Promise<CitationDateIndex>` wrapped in `cached('peec','getPlacementCitationDates', impl, { version:'v1', extractTags:([slug])=>({client: slug ?? 'default'}) })`.

- [ ] **Step 1: Write failing tests** for a pure exported helper `mergeAscDescIndexes(asc: CitationDateIndex, desc: CitationDateIndex): CitationDateIndex` that takes the first-seen (min) from the ascending pass and the first-seen (max) from the descending pass and yields per-host per-engine {first,last}. Test: asc gives firsts, desc gives lasts, merge yields both; a host present in only one pass still resolves.
- [ ] **Step 2: Run** => FAIL.
- [ ] **Step 3: Implement** the fetch: POST `/reports/domains` with `{ project_id, start_date, end_date, dimensions:['model_id','date'], limit: 5000, offset }`; ascending pass omits `order_by`, descending pass adds `order_by:[{field:'date',order:'desc'}]`. Walk offsets: stop when every `targetHosts` entry (normalized) has been seen, or a page returns `< limit` rows, or a page cap of 8 is hit. Record first-seen date per (host,engine) in each pass, feed both to `buildCitationDateIndex`-style folding, then `mergeAscDescIndexes`. Resolve `project_id` from `getClientBySlug(clientSlug)?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID`; return `{}` if none. Auth header `X-API-Key: process.env.PEEC_AI_CUSTOMER_TOKEN`. Reuse the module-local POST pattern from `lib/peec/url-citations.ts` (copy the small `post` helper shape, `cache:'no-store'`).
- [ ] **Step 4: Run tests** => PASS. Then `npx tsc --noEmit` and `npm run check:rsc`.
- [ ] **Step 5: Commit** `feat(FB-068): getPlacementCitationDates bounded asc/desc fetch`.

### Task 3: extend MatchbackRow + computePlacementMatchback

**Files:**
- Modify: `lib/pr-proof/matchback.ts`
- Modify: `lib/pr-proof/matchback.test.ts`

**Interfaces:**
- Consumes: `CitationDateIndex` (Task 1).
- Produces: `MatchbackRow` gains `firstCitedDate: string` and `lastCitedDate: string`. `computePlacementMatchback(placements, urlCitations, models, citationDates: CitationDateIndex)` (new 4th param).

- [ ] **Step 1: Add failing tests** in `matchback.test.ts`:
  - no model filter: row for host `a.com` gets firstCitedDate/lastCitedDate from `index['a.com']['*']`.
  - model filter [ChatGPT]: dates come from `index['a.com']['ChatGPT']` only.
  - model filter [ChatGPT,Perplexity]: firstCitedDate = min of the two engines' firsts, lastCitedDate = max of the two engines' lasts.
  - host absent from index: firstCitedDate === '' and lastCitedDate === '' (renders "N/A").
  - existing 20 tests still pass (add the new `{}` arg where needed).
  - invariant: for every produced row, firstCitedDate <= lastCitedDate when both non-empty.
- [ ] **Step 2: Run** `npx vitest run lib/pr-proof/matchback.test.ts` => FAIL.
- [ ] **Step 3: Implement**: add the two fields to `MatchbackRow`; add the `citationDates` param; in the row build, compute first/last: if `modelSet` is null use `citationDates[h]?.['*']`; else across the selected engines present in `citationDates[h]`, first = min of their firsts, last = max of their lasts; default to `''` when absent. Row inclusion and `citedByAI` stay exactly as-is (driven by urlCitations).
- [ ] **Step 4: Run tests** => PASS.
- [ ] **Step 5: Commit** `feat(FB-068): matchback rows carry first/most-recent cited dates`.

### Task 4: wire fetch + render columns

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx` (matchback wiring, ~L300-360)
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx` (matchback table, cols ~L398-473; `PRPlacementMatchbackRow` type ~L377-384)

**Interfaces:**
- Consumes: `getPlacementCitationDates` (Task 2), `computePlacementMatchback` 4th param (Task 3).

- [ ] **Step 1:** In `pr-influence.tsx`, read the matched placement domains, fetch `getPlacementCitationDates(clientSlug, { startDate, endDate, targetHosts })` alongside the existing `getUrlCitations`, and pass the returned index as the new 4th arg to `computePlacementMatchback`. (Read the current matchback block first.)
- [ ] **Step 2:** In `pr-influence-tables.tsx`, add `firstCitedDate` and `lastCitedDate` to `PRPlacementMatchbackRow`, and add two columns "First cited" and "Most recent" after "Publish Date", formatted the same way as the Publish Date cell, rendering "N/A" when empty.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run check:rsc` => clean.
- [ ] **Step 4: Commit** `feat(FB-068): fetch citation dates + render First cited / Most recent columns`.

---

# Workstream 3: PR #138 sentiment code fixes

Read the anchored region of each file before editing; line numbers may drift.

### Task 5: P1 normalize answer model before filter

**Files:** Modify `lib/profound/sentiment-normalize.ts` (`accumulateThemeSources`, ~L177-179). Test `lib/profound/sentiment.test.ts`.
Current: `const model = (a.model ?? '').trim(); if (selected && !selected.has(model)) continue`.
- [ ] **Step 1:** Add a failing test: an answer with `model:'openai'` (raw id) under `selected` = {'ChatGPT'} is INCLUDED (its sources counted). Today it is dropped.
- [ ] **Step 2:** Run focused test => FAIL.
- [ ] **Step 3:** Import `normalizeModel` from `lib/profound/client.ts` (exported) and map before the check: `const model = normalizeModel((a.model ?? '').trim()) ?? (a.model ?? '').trim(); if (selected && !selected.has(model)) continue`. Confirm `normalizeModel` returns the Profound display name; if it returns something else, map raw id -> display via the same table `selectedProfoundModels` uses.
- [ ] **Step 4:** Run => PASS.
- [ ] **Step 5:** Commit `fix(#138-P1): normalize answer model id before source filter`.

### Task 6: P3 pagination terminates on empty page

**Files:** Modify `lib/profound/sentiment.ts` (`~L124`, `if (rows.length < ANSWERS_PAGE) break`). Test `lib/profound/sentiment.test.ts`.
- [ ] **Step 1:** Add a failing test around the pagination helper (extract the loop's termination into a testable predicate if it is inline): a short-but-nonempty page must NOT stop the loop; a zero-row page must. If the loop is not easily unit-testable, add a small exported `shouldStopPaging(rows: unknown[]): boolean => rows.length === 0` and test it.
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Replace the break condition with `if (rows.length === 0) break` and keep the existing max-page safety cap.
- [ ] **Step 4:** Run => PASS.
- [ ] **Step 5:** Commit `fix(#138-P3): stop answer paging on empty page, not short page`.

### Task 7: P4 metrics fallback rebuilds info

**Files:** Modify `lib/profound/sentiment-normalize.ts` (`collapseModelThemeRows`, ~L134-141). Test `lib/profound/sentiment.test.ts`.
Current returns `{ info: resp.info, data }` while defaulting `metricNames` only for `data`.
- [ ] **Step 1:** Add a failing test: a `[model,theme]` response with `info: {}` but real positive/negative values yields non-empty positive/negative theme lists (today all drop as 0/0).
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Return `{ info: { query: { metrics: metricNames } }, data }` so downstream `readMetric` resolves.
- [ ] **Step 4:** Run => PASS.
- [ ] **Step 5:** Commit `fix(#138-P4): rebuild info.query.metrics so themes are not dropped as ties`.

### Task 8: P5 dedupe theme keys per answer

**Files:** Modify `lib/profound/sentiment-normalize.ts` (`accumulateThemeSources`, ~L187-196). Test `lib/profound/sentiment.test.ts`.
- [ ] **Step 1:** Add a failing test: one answer tagged themes `['Pricing','pricing']` citing url `x.com` increments `x.com` under key `pricing` exactly once (today twice).
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Build a `Set` of case-folded theme keys for the answer before the attribution loop and iterate the deduped set.
- [ ] **Step 4:** Run => PASS.
- [ ] **Step 5:** Commit `fix(#138-P5): dedupe per-answer theme labels before source attribution`.

### Task 9: P8 extract modelKeyOf + P9 revalidate + P10 dead path/comment

**Files:** Create nothing; Modify `lib/peec/models.ts` (add + export `modelKeyOf`), `lib/profound/sentiment.ts` (import it, remove local; remove dead compare branch + fix header comment), `lib/profound/client.ts` (drop inert `revalidate`). Test `lib/peec/models.test.ts` (or existing).
- [ ] **Step 1:** Add a failing test for `modelKeyOf` in `lib/peec/models.ts`: stable key for a model list irrespective of order, matching the current behavior in `sentiment.ts:76`.
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Move `modelKeyOf` to `lib/peec/models.ts` (export), import it in `sentiment.ts`, delete the local copy. In `sentiment.ts` remove the dead prior-period `fetchByModel`/delta branch (caller passes `compareRange=null`) and correct the header comment (lines ~8-11) to state the card is pill-only, not comparison-reactive. In `client.ts:35` remove `next:{revalidate:3600}` from the answers POST path and add a one-line comment: outer cached() persists the small result; the raw answers payload exceeds the 2MB data-cache limit.
- [ ] **Step 4:** Run `npx vitest run lib/peec/models.test.ts lib/profound/sentiment.test.ts` + `npx tsc --noEmit` => PASS/clean.
- [ ] **Step 5:** Commit `refactor(#138-P8/P9/P10): share modelKeyOf, drop inert revalidate, remove dead compare path`.

### Task 10: P2 accordion open-state keyed by title

**Files:** Modify `components/report-sections/peec-ai/sentiment-insights.tsx` (`~L122` `useState<Set<number>>`, toggle + `expanded={open.has(i)}` ~L142).
- [ ] **Step 1:** Change open-state to `Set<string>` keyed by `theme.title`; `toggle(theme.title)`, `expanded={open.has(theme.title)}`. (No unit test; component-level. Verify types + reasoning.)
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run check:rsc` => clean.
- [ ] **Step 3:** Commit `fix(#138-P2): key sentiment accordion open-state by theme title`.

### Task 11: P6 gate on DB config + P7 thread clientSlug into cache key

**Files:** Modify `components/report-sections/peec-ai/pr-influence.tsx` (`~L434` `clientSlug === 'avenue-z'` gate), `components/report-sections/peec-ai/sentiment-insights-section.tsx` (`~L37-46`, thread `clientSlug`), `lib/profound/sentiment.ts` (`getProfoundSentiment` signature + `extractTags` ~L207-211). Test `lib/profound/sentiment.test.ts`.
- [ ] **Step 1:** Add a failing test: the sentiment cache `extractTags` output includes a `client` dimension (today it does not).
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Thread `clientSlug` from `pr-influence.tsx` into `SentimentInsightsSection` into `getProfoundSentiment(clientSlug, dateRange, models)`; add `client: clientSlug ?? 'default'` to `extractTags`. Replace the `clientSlug === 'avenue-z'` gate with a DB-config check: fetch the client row and render only when `profoundCategoryId` is set (mirror `client.ts:398`). Keep brand/category resolution reading the client row first, env fallback.
- [ ] **Step 4:** Run tests + `npx tsc --noEmit` + `npm run check:rsc` => PASS/clean.
- [ ] **Step 5:** Commit `fix(#138-P6/P7): gate sentiment on profoundCategoryId, add client to cache key`.

---

# Workstream 2: Column-H live-QA fixes

### Task 12: CI-2 Speed Stats "Same day"

**Files:** Modify `components/report-sections/peec-ai/content-impact.tsx` (`~L1211` `${Math.round(val)} days`). Extract a pure formatter to test. Test: new `lib/ga4/format-speed.test.ts` + `lib/ga4/format-speed.ts` (or colocate).
- [ ] **Step 1:** Failing test for `formatDaysToFirst(val: number|null): string`: `null` -> "None", `0` -> "Same day", `1` -> "1 day", `5` -> "5 days".
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Implement the formatter; use it in the two Speed Stats tiles.
- [ ] **Step 4:** Run + tsc => PASS/clean.
- [ ] **Step 5:** Commit `fix(CI-2): render sub-day speed stat as "Same day"`.

### Task 13: CI-3a scatter quadrant label legibility

**Files:** Modify `components/report-sections/peec-ai/bot-vs-human-scatter.tsx` (`cornerLabel` ~L57, top-left cell ~L62-68).
- [ ] **Step 1:** Raise contrast (drop `text-text-muted`, use a readable foreground plus a subtle `bg-black/30 rounded px-1`), and add inner padding/offset so the top-left label clears the Y-axis title. No logic change.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run check:rsc` => clean. Live-verify legibility.
- [ ] **Step 3:** Commit `fix(CI-3a): make scatter quadrant labels legible`.

### Task 14: CI-3b scatter click-to-open URL

**Files:** Modify `components/report-sections/peec-ai/bot-vs-human-scatter.tsx` (Scatter points / tooltip ~L86-99).
- [ ] **Step 1:** Add an `onClick` on the scatter points that opens `p.path` (full URL) in a new tab (`window.open(url, '_blank', 'noopener')`); keep the tooltip showing the full URL. Guard against missing path.
- [ ] **Step 2:** tsc + check:rsc => clean. Live-verify a click opens the right URL.
- [ ] **Step 3:** Commit `feat(CI-3b): click a scatter point to open its URL`.

### Task 15: CI-3c scatter honors date range within 30 days

**Files:** Create `lib/peec/scatter-window.ts` + `lib/peec/scatter-window.test.ts`; Modify `components/report-sections/peec-ai/content-impact.tsx` (human window ~L349-360, bot window note ~L1241).
**Interfaces:** Produces `resolveScatterWindow(effectiveRange: string, today: string): { start_date: string; end_date: string; locked: boolean }`.
- [ ] **Step 1:** Failing tests: a selected range fully inside the last 30 days passes through (`locked:false`); a range starting before today-30 clamps start to today-30 (`locked:true`); a range wholly older than 30 days returns the last-30 window (`locked:true`).
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Implement the resolver; wire it into the human-axis window (replace the inline last-30 computation). Bot axis stays capped at 30 days (Peec retention); the subtitle note stays but says the chart follows the picker when the range is within 30 days.
- [ ] **Step 4:** Run + tsc + check:rsc => PASS/clean.
- [ ] **Step 5:** Commit `feat(CI-3c): scatter follows the date picker within the last 30 days`.

### Task 16: CI-1 Prompt Coverage reacts to date + model

**Files:** Modify `lib/peec/url-citations.ts` (`getDomainCoverageImpl` + `ownedPromptCoveragePct`, add model-aware coverage), `components/report-sections/peec-ai/content-impact.tsx` (`~L261` coverage fetch call, `~L794-797` compute). Test `lib/peec/url-citations.test.ts` (or new).
**Interfaces:** Produces a model-aware coverage: extend `getDomainCoverage(clientSlug, { startDate, endDate, models })` to dimension `/reports/urls` by `['prompt_id','model_id']` and expose `promptIdsByDomainByModel`, plus a pure `ownedPromptCoveragePctForModels(cov, ownedDomains, totalTrackedPrompts, models, available)`.
- [ ] **Step 1:** Failing tests for the pure coverage-with-models aggregation: given per-(domain,prompt,model) rows, coverage under models=[ChatGPT] counts only prompts whose owned-domain citation came from ChatGPT; models=null counts all engines; result is `round(distinctPromptIds / totalTrackedPrompts * 100)`.
- [ ] **Step 2:** Run => FAIL.
- [ ] **Step 3:** Implement: add `model_id` to the coverage prompt fetch dimensions and aggregate `promptIdsByDomainByModel`; add the model-aware pct helper. In `content-impact.tsx`, call `getDomainCoverage(clientSlug, { startDate: effectiveRange.start, endDate: effectiveRange.end, models })` (pass the selected range and models, not the bare slug), and compute the value via the model-aware helper so the number moves with date and model. Keep the delta pill wiring intact.
- [ ] **Step 4:** Run + tsc + check:rsc => PASS/clean. Note: watch the 2000-row coverage limit under the extra model dimension; if owned-domain prompts risk truncation, bump the coverage fetch limit.
- [ ] **Step 5:** Commit `fix(CI-1): Prompt Coverage value reacts to date range and model filter`.

### Task 17: PR-1 pill tooltip + PR-2 re-add positive-delta filter

**Files:** Modify `components/report-sections/peec-ai/sentiment-insights.tsx` (pill ~L166-176, add tooltip), `components/report-sections/peec-ai/pr-influence.tsx` (Top Editorial Opportunities inclusion ~L333, delta ~L322-323), `components/report-sections/peec-ai/pr-influence-tables.tsx` (subtitle ~L250 stays "on the rise"). Test `lib/...` for the filter if the inclusion is extractable; else reason + live-verify.
- [ ] **Step 1 (PR-1):** Add a tooltip/`title` on the pill: "Reflects all classified sentiment for the selected models and period, not only the themes listed below." Copy only, no math change.
- [ ] **Step 2 (PR-2):** In the Top Editorial Opportunities inclusion, add `deltaOf(c) > 0` to the predicate so only positive-delta brand-absent editorial URLs show, matching the "on the rise" subtitle. If a pure `opportunityFilter` helper can be extracted, unit-test it (positive included; zero and negative excluded); otherwise live-verify.
- [ ] **Step 3:** tsc + check:rsc (+ focused test if added) => clean.
- [ ] **Step 4: Commit** `fix(PR-1/PR-2): pill scope tooltip + restore positive-delta filter on opportunities`.

### Task 18: CI-4 note correction + feedback-log + changelog

**Files:** Modify `docs/official-feedback/feedback-log.md` (correct the inaccurate "caps at 18.2%" note for §H.1; add V3 entries for every fixed item), `CHANGELOG`/`docs/changelog.md` if present.
- [ ] **Step 1:** Correct the §H.1 note: Competitor Citation Share is share-of-period with no cap; values above 18.2% (e.g. 29.8%) are legitimate; the earlier "caps at 18.2%" wording conflated FB-052's row-count bump with a value ceiling.
- [ ] **Step 2:** Add a feedback-log entry per item (CI-1, CI-2, CI-3a/b/c, CI-4, PR-1, PR-2, PR-3, P1-P10) with Tab / ask / what shipped.
- [ ] **Step 3: Commit** `docs(v3-qa): correct §H.1 note + feedback-log entries for all V3 fixes`.

---

## Self-Review

**Spec coverage:** all 19 items mapped: FB-068 (T1-T4), P1(T5) P3(T6) P4(T7) P5(T8) P8/P9/P10(T9) P2(T10) P6/P7(T11), CI-2(T12) CI-3a(T13) CI-3b(T14) CI-3c(T15) CI-1(T16) PR-1/PR-2(T17) CI-4(T18). No gaps.

**Placeholder scan:** none; each task has files, fix, tests, commit.

**Type consistency:** `CitationDateIndex`, `buildCitationDateIndex`, `getPlacementCitationDates`, `computePlacementMatchback` 4th arg, `resolveScatterWindow`, `formatDaysToFirst`, `modelKeyOf` (moved to `lib/peec/models.ts`), `ownedPromptCoveragePctForModels` are named consistently across tasks.

**Ordering:** WS1 (new isolated code) first, then WS3 (sentiment, mostly separate files), then WS2 (content-impact + pr-influence wiring). Tasks touching the same big file (pr-influence.tsx: T4, T11, T17; content-impact.tsx: T12, T15, T16) run sequentially under SDD, so no parallel conflicts.
