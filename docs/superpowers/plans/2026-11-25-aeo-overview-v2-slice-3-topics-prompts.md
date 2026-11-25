# AEO Overview v2 — Slice 3 (04 · Topics & Prompts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section 04 of the v2 Overview, for Peec and Profound: a visibility-by-topic heatmap with a Competitors / Platforms toggle, and directly below it a full-width Prompt Performance table (Prompt, Topic, Rank, Rank Δ, Visibility, Δ) that replaces Biggest Winners / Biggest Losers.

**Architecture:** Two new part ids, `topic-matrix@1` and `prompt-performance@1`, reached through `extraParts` (the template does not have them). As in slice 2, each `render` returns an async server child behind `Suspense` + `ReportErrorBoundary`, and both children call one React-`cache`d loader, `getTopicsPromptsV2(provider, clientSlug, dateRange, compareMode)`, which dispatches to a cached fetcher per provider. The fetchers keep per-model counts (mentions, answers, position sums), so the parts apply the page's model filter themselves by summing the selected models. The matrix also calls slice 2's `getVisibilityV2` (same render, already cached) for brand ranking and colors, so its columns match the trend chart's defaults and the brand table's colors. v1 fetchers, cache keys and parts are not changed in behavior.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, vitest + @testing-library/react (jsdom), `lib/cache.ts`.

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (on `origin/docs/aeo-overview-v2-spec`): section 6 "04 · Topics & Prompts", 5.3, 7, 10. Depends on slice 2's plan (`2026-11-25-aeo-overview-v2-slice-2-visibility.md`) being merged: it uses `lib/aeo/v2/types.ts`, `getVisibilityV2`, `brandColors`, `profoundRows`, `profoundPostAll`, `getProfoundAssets`, the `fetchAllRows` `maxRows` parameter and the Peec exports from `lib/peec/client.ts`.

**Where to work:** after slice 2 is merged into `dev`:

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-topics-prompts /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice3 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice3 && npm ci && cp ../reporting-dashboard-renaissance/.env.local .
```

Mockup screenshots: written without Glean access; Paul attaches the "Topics & Prompts" mockup screenshots to the feature PR.

## Vendor facts (live, read-only, 2026-11-25; see slice 2's plan for the shared ones)

- **Peec prompt × model × brand rows** (`/reports/brands`, `dimensions: ['prompt_id','model_channel_id','model_id']`): 8,700 rows for Renaissance (100 prompts × 3 models × 29 brands). The v1 overview asks for one page of 5,000, so **v1 sees only 223 of Renaissance's 300 prompt × model cells** (Winners/Losers works on a partial set today). v2 pages through all of them. Each row carries every brand, so per-brand topic visibility is derivable. Models: `chatgpt-scraper`, `gemini-scraper`, `google-ai-overview-scraper`.
- **Peec topics:** v1's `TrackedPrompt.group` is the first subject **tag** (Renaissance: Credibility w/Brokers, Member / Employer Experience, Ease of Doing Business, Differentiators), with keyword inference when a prompt has none. Peec prompts also carry a native **`topic`** (`GET /prompts` row keys: `id, messages, tags, topic, user_location, volume, is_archived, created_at`): 75 of Renaissance's 100 prompts have one of 2 topics (`GET /topics`: Ancillary Benefits, Supplemental Health), 25 have none. This plan follows the spec (`group`); see the decision note in Task 1.
- **Profound** (Avenue Z): `['topic','model','asset_name']` filtered to the 4 assets returns 31 rows with `executions, mentions_count, share_of_voice, visibility_score` (alphabetical). `visibility_score = mentions_count / executions` exactly (iPullRank, Gemini, AI Search: 1,811 / 2,368 = 0.7648). Summing mentions and executions over models reproduces Profound's own `['topic','asset_name']` figure to within 0.31 pts (Profound's topic-level aggregate is not an exact sum); the matrix uses the summed form everywhere so the model filter works and the cells agree with each other.
- **Profound prompts:** `['prompt_id','prompt','topic','model']` filtered `asset_name is <you>` returns 195 rows (of 75 × 3); a prompt × model where the brand is never mentioned has **no row**. So "answers" per prompt × model come from an unfiltered `['prompt_id','prompt','topic','model']` call with `['executions']` (unfiltered executions per prompt are per-prompt runs, 174 = 3 × 58, not multiplied by brands). The prior window works the same (187 rows). Both reports cover Visibility-type prompts only by construction (spec 7; no filter is accepted or needed).

## Global Constraints

- v1 output must not change: no `-u` on existing goldens; `winners-losers@1`, `getPeecOverview`, `getProfoundOverview` keep behavior and cache `version`. The Peec topic helper is hoisted out of `getPeecOverviewImpl` without changing it.
- Peec uses all prompts. Profound uses Visibility-type prompts for every number here (the visibility report covers only those); sentiment is not shown in this slice and would use Sentiment-type prompts.
- Units: Visibility Δ in `pts` (`betterWhen: 'higher'`); Rank Δ in `places`, computed `priorRank − rank` (positive = moved up, `betterWhen: 'higher'`). Rank is the brand's average position in answers that mention it (lower is better), printed with one decimal (`2.3`).
- No prior value → `–` with "No comparison data". A prompt with no answers in the comparison window → `New` in Rank Δ, sorted last in both directions (`deltaColumn`'s `isNew`).
- One comparison window for every prior figure: `fetchCompareMode(ctx.compare)`. Show deltas off → no Δ columns, no filter chips, no Δ in matrix hovers, and Prompt Performance sorts by Rank ascending.
- Model filter (`ctx.models`): both parts apply it by summing only the selected models; neither shows a "not applied" note.
- Brand colors from `brandColors(roster, you)` only (slice 2). `'use client'` only where needed; no function props across the boundary; no `any`.
- New fetchers: `cached(…, { version: 'v1', healthCritical: false })`.

## Review Focus

1. **A prompt the brand never appears in** (Peec: rows with `position_count` 0; Profound: no filtered row). Expect Rank `–`, Rank Δ `–`, Visibility `0.0%`, the row still listed. Test: Task 3 (`promptPerformanceRows`).
2. **A prompt added this period** (no answers in the comparison window). Expect Rank Δ `New`, sorted last under both sort directions, listed only under All. Test: Task 3 and Task 5.
3. **Model filter to a model the brand has no answers on for a topic.** Expect that cell `–` (no answers), not `0.0%`; a topic with no answers on any selected model drops out of the rows. Test: Task 3 (`topicMatrix` with `models`).
4. **A tracked brand absent from a topic's rows** (a competitor never mentioned in "Differentiators"). Expect `0.0%` when the topic has answers, since the answers exist and the brand had no mentions. Test: Task 3.
5. **`aeoMatrix` hand-edited** (`aeoMatrix=PLATFORMS`, `aeoMatrix=x`). Expect the default (Competitors, top 8 columns); the export request rejects anything but `platforms` / `all`. Test: Task 4 and Task 6.

---

### Task 1: Data shape and the Peec fetcher

**Decide with Paul / Tina (default below, no build impact beyond one function):** the matrix rows are "the client's topics". Default: v1's `group` (first subject tag, keyword fallback), as the spec says, so the matrix agrees with every other place that groups prompts. Alternative: Peec's native prompt `topic` (2 topics for Renaissance, 25 prompts untopiced → an "Other" row). Swapping later changes only `peecPromptTopic`.

**Files:**
- Modify: `lib/peec/client.ts` — hoist `FACET_TAGS`, `categorizePrompt` and the subject-tag lookup out of `getPeecOverviewImpl` into an exported `peecPromptTopic(tags: { id: string }[] | undefined, text: string, tagNameById: ReadonlyMap<string, string>): { group: string; topicSource: TopicSource }`, used by the v1 impl unchanged; `fetchAllRows` gains `pageSize = 500` after `maxRows`.
- Modify: `lib/aeo/v2/types.ts`
- Create: `lib/peec/topics-prompts-v2.ts`
- Test: `lib/peec/topics-prompts-v2.test.ts` (add it to the `vitest.config.ts` `include` list, which names `lib/peec` tests one by one)

**Interfaces:**
- Produces (`types.ts`):
  - `type VisCount = { mentions: number; answers: number }`
  - `type TopicCell = VisCount & { topic: string; brand: string; model: AEOModel }`
  - `type PromptModelStat = VisCount & { posSum: number; posCount: number }` (the client brand only)
  - `type PromptV2 = { id: string; text: string; topic: string; current: Partial<Record<AEOModel, PromptModelStat>>; prior: Partial<Record<AEOModel, PromptModelStat>> | null }` — `prior` is `null` when the prompt had no answers in the comparison window.
  - `type TopicsPromptsV2 = { you: string | null; cells: TopicCell[]; cellsPrior: TopicCell[]; prompts: PromptV2[] }`
- Produces (`topics-prompts-v2.ts`):
  - `getPeecTopicsPromptsV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<TopicsPromptsV2>`, `cached('peec', 'getTopicsPromptsV2', …)`.
  - Pure, exported: `buildPeecTopicsPrompts(input: { prompts: { id: string; messages?: { content?: string }[]; tags?: { id: string }[] }[]; tags: { id: string; name: string }[]; rows: ApiBrandRow[]; rowsPrior: ApiBrandRow[]; yourBrand: string }): TopicsPromptsV2`.
- Impl: windows and `yourBrand` as `getPeecOverviewImpl`. Calls: `peecGet('/prompts', { limit: '1000' })`, `peecGet('/tags', { limit: '500' })`, and `fetchAllRows({ ...window, dimensions: ['prompt_id','model_channel_id','model_id'] }, pid, 50_000, 5_000)` for current and prior. Model = `normalizeSource(row.model?.id ?? row.model_channel?.id ?? '')`; rows whose model is null are dropped. `cells`: per (topic, brand, model) sum `visibility_count` → mentions and `visibility_total` → answers. `prompts`: per prompt (text = joined message contents, as v1), the client brand's rows per model → `{ mentions, answers, posSum: position_sum, posCount: position_count }`; a prompt with no current rows is dropped; `prior` = the same from prior rows, or `null` when the prompt has no prior rows at all. `you` = the first brand name matching v1's `includes(yourBrand)` rule, or `null`.

- [ ] **Step 1: Write the failing tests** for `buildPeecTopicsPrompts` (two prompts: P1 tagged subject "Credibility w/Brokers" + facet "branded", P2 untagged text "best dental plan for brokers"; rows for Renaissance and Guardian on ChatGPT and Gemini; P2 has no prior rows):
  - P1 topic `Credibility w/Brokers` (facet ignored); P2 topic from keyword inference (`categorizePrompt`, equal to what v1 assigns).
  - `cells` has one entry per (topic, brand, model) with summed counts; Guardian present.
  - P1 `current.ChatGPT` = Renaissance's counts and position sums; P2 `prior` is `null`.
  - a row with model id `unknown-scraper` is ignored.
  - `peecPromptTopic` on its own: facet-only tags → inference; an unknown tag id → inference.
- [ ] **Step 2: Run** `npx vitest run lib/peec/topics-prompts-v2.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `npx vitest run components/report-sections/peec-ai` — Expected: PASS, no snapshot change.
- [ ] **Step 5: Live check (read-only, scratchpad):** `getPeecTopicsPromptsV2('renaissance','last_30_days','previous_period')` → 100 prompts at most, Renaissance's ChatGPT + Gemini + Google cells sum to 300 prompt × model cells' answers, `cells` covers 29 brands.
- [ ] **Step 6: Commit** `feat(aeo-v2): Peec topic and prompt data (all prompt x model rows)`

---

### Task 2: The Profound fetcher and the shared loader

**Files:**
- Create: `lib/profound/topics-prompts-v2.ts`, `lib/profound/models.ts`, `lib/aeo/v2/topics-prompts.ts`
- Test: `lib/profound/topics-prompts-v2.test.ts`

**Interfaces:**
- Produces:
  - `profoundModel(name: string): AEOModel | null` (`lib/profound/models.ts`): `ChatGPT`→`ChatGPT`, `Google AI Overviews`→`Google`, `Google Gemini`/`Gemini`→`Gemini`, names containing `perplexity`/`claude`/`copilot` → those models, else `null`. (v1's `normalizeModel` sends "Google AI Overviews" to Gemini; this one keeps them apart. Slice 5 uses it too.)
  - `getProfoundTopicsPromptsV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<TopicsPromptsV2>`, `cached('profound', 'getTopicsPromptsV2', …)`; no category → `{ you: null, cells: [], cellsPrior: [], prompts: [] }`.
  - Pure, exported: `buildProfoundTopicsPrompts(input: { assets: ProfoundAsset[]; yourBrand: string; cells: ProfoundNamedRow[]; cellsPrior: ProfoundNamedRow[]; runs: ProfoundNamedRow[]; runsPrior: ProfoundNamedRow[]; you: ProfoundNamedRow[]; youPrior: ProfoundNamedRow[] }): TopicsPromptsV2`.
  - `getTopicsPromptsV2 = cache((provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode) => …)`.
- Impl calls per window, all `/v1/reports/visibility` via `profoundPostAll`, no prompt-type filter (spec 7: the report already covers only Visibility prompts):
  - cells: `['topic','model','asset_name']`, `['mentions_count','executions']`, `filters: [{ field: 'asset_name', operator: 'in', value: assetNames }]`;
  - runs: `['prompt_id','prompt','topic','model']`, `['executions']`, no filter;
  - you: `['prompt_id','model']`, `['mentions_count','average_position']`, `filters: [{ field: 'asset_name', operator: 'is', value: <you> }]`.
  - Prompt stat per (prompt, model): `answers` = runs' executions; `mentions` = you's `mentions_count` (0 when no row); `posSum = average_position × mentions_count`, `posCount = mentions_count`. `prior` null when the prompt has no prior runs row. `you` = the asset whose name includes `peecYourBrand`, else the `isOwned` asset.

- [ ] **Step 1: Write the failing tests**
  - `profoundModel`: `Google AI Overviews` → `Google`; `Google Gemini` → `Gemini`; `ChatGPT`; `Bard` → `null`.
  - `buildProfoundTopicsPrompts`: a prompt with runs but no `you` row → `current.ChatGPT = { mentions: 0, answers: 58, posSum: 0, posCount: 0 }`; a prompt with no prior runs → `prior: null`; a cell row for an asset outside `assets` is dropped; `posSum` = 4.5 × 10 for `average_position 4.5, mentions_count 10`.
  - impl test (mocks): no body carries an `analysis_type` or `prompt_type` filter.
- [ ] **Step 2: Run** `npx vitest run lib/profound/topics-prompts-v2.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Live check (read-only):** `getProfoundTopicsPromptsV2('avenue-z','last_30_days','previous_period')` → 75 prompts at most; for one prompt the `you` row's `executions` (request it once in the scratch script) equals the runs row's `executions` (confirms the unfiltered `executions` is per-prompt runs).
- [ ] **Step 6: Commit** `feat(aeo-v2): Profound topic and prompt data and the shared loader`

---

### Task 3: Model-filtered aggregation (pure)

**Files:**
- Modify: `components/report-sections/peec-ai/v2/delta.ts` (export `roundForUnit`)
- Create: `components/report-sections/peec-ai/v2/topics.ts`
- Test: `components/report-sections/peec-ai/v2/topics.test.ts`

**Interfaces:**
- Produces:
  - `visPct(c: VisCount | undefined): number | null` — `answers > 0 ? mentions / answers * 100 : null`.
  - `type MatrixCell = { value: number | null; delta: number | null }`
  - `topicMatrix(data: TopicsPromptsV2, models: AEOModel[] | null): { topics: string[]; byBrand: Record<string, Record<string, MatrixCell>>; byModel: Record<string, Partial<Record<AEOModel, MatrixCell>>>; modelsPresent: AEOModel[] }` — sums the selected models (all when `null`); `value` per (topic, brand) = `visPct`, `0` when the topic has answers but the brand has no cell, `null` when the topic has no answers; `delta` = value − prior value when both are non-null; `byModel` is the client's cells per model; `topics` are topics where the client has answers, sorted by the client's value desc then name; `modelsPresent` in `AEO_MODELS` order.
  - `type PromptPerfRow = { id: string; text: string; topic: string; rank: number | null; priorRank: number | null; rankDelta: number | null; isNew: boolean; visibility: number; visibilityPrior: number | null; visibilityDelta: number | null }`
  - `promptPerformanceRows(prompts: PromptV2[], models: AEOModel[] | null): PromptPerfRow[]` — over the selected models: rank = `posSum / posCount` (`null` when `posCount` 0); visibility = `mentions / answers * 100`; a prompt with no answers on the selected models is dropped; `isNew = prior === null`; `rankDelta = priorRank − rank` when both exist.
  - `promptChange(r: PromptPerfRow): 'gained' | 'lost' | 'same' | null` — `null` when `rankDelta` is null (New, not ranked now or before); else the sign of `roundForUnit(rankDelta, 'places')`. Filter chips use it; `null` rows show under All only.

- [ ] **Step 1: Write the failing tests** (fixture `TopicsPromptsV2` with topics A and B, brands Renaissance and Guardian, models ChatGPT and Gemini)
  - `topicMatrix(data, null)`: A's Renaissance value = summed mentions ÷ summed answers; Guardian with no cell in B where B has answers → `0`; a topic with zero answers is absent from `topics`; deltas as `value − prior`, `null` when the prior topic has no answers.
  - `topicMatrix(data, ['Gemini'])`: values recomputed from Gemini only; `modelsPresent` `['Gemini']`.
  - `promptPerformanceRows`: rank `posSum/posCount` across models (not the mean of per-model ranks: ChatGPT 2×(pos 1) + Gemini 6×(pos 3) → `2.5`); a prompt never mentioning the brand → `rank: null`, `visibility: 0`; `prior: null` → `isNew: true`, `rankDelta: null`; prior rank 3.0 → current 2.5 → `rankDelta: 0.5`.
  - `promptChange`: `0.5` → `gained`; `-0.5` → `lost`; `0.4` → `same`; `null` → `null`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/topics.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): topic matrix and prompt performance aggregation`

---

### Task 4: Topic matrix and `topic-matrix@1`

**Files:**
- Create: `components/report-sections/peec-ai/v2/matrix-mode.ts`, `components/report-sections/peec-ai/v2/topic-matrix.tsx` (`'use client'`), `components/report-sections/peec-ai/v2/topics-section.tsx` (async server components for both parts), `components/report-sections/peec-ai/parts/topic-matrix.tsx`
- Modify: `lib/export/request.ts`, `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` (carry `aeoMatrix` into the PDF, as slice 2 did for `aeoTrend`)
- Test: `components/report-sections/peec-ai/v2/topic-matrix.test.tsx`, `components/report-sections/peec-ai/parts/topic-matrix.golden.test.tsx`, `lib/export/request.test.ts`

**Interfaces:**
- Consumes: Task 3; `getVisibilityV2`, `brandColors` (slice 2).
- Produces:
  - `MATRIX_PARAM = 'aeoMatrix'`; `type MatrixMode = 'competitors' | 'all' | 'platforms'`; `parseMatrixMode(raw): MatrixMode` (only `all` / `platforms` recognised, else `competitors`); `serializeMatrixMode(m): string | null` (`competitors` → `null`).
  - `MATRIX_DEFAULT_COMPETITORS = 7` (client + 7 columns).
  - `TopicMatrix(props: { topics: string[]; brandCols: { name: string; color: string; isYou: boolean }[]; byBrand: …; modelCols: { model: AEOModel; label: string }[]; byModel: …; showDeltas: boolean })` — `brandCols` = client first, then competitors in the brand table's visibility order (`getVisibilityV2().brands`). Reads/writes `aeoMatrix` with `router.replace(…, { scroll: false })` (keeps every other param). Controls (hidden in export): a two-button toggle **Competitors / Platforms** and, in Competitors, **Show all brands** (switches `competitors` ↔ `all`). Columns: `competitors` → client + first 7 competitors; `all` → every brand, the grid in `overflow-x-auto`; `platforms` → `modelCols` (`MODEL_DISPLAY_LABELS`). Header cells carry the brand's color dot; the client column has `outline outline-1 outline-[#60FDFF]`. Cell: `value.toFixed(1)%` on `rgba(96,253,255, 0.08 + 0.72 × value/100)` with white text above 50%; `null` → `–` with no fill. When `showDeltas`, the cell's `title` is `formatDelta(delta, 'pts')` + ` vs previous period` (`compareSuffix`). In export mode a line under the grid names the mode (`Competitors · top 8 brands`, `All brands`, `Platforms`).
  - `TopicMatrixSection({ ctx })` (async): `Promise.all([getTopicsPromptsV2(…), getVisibilityV2(…)])`, `topicMatrix(data, ctx.models)`; renders nothing when `topics` is empty. Card title `Where does the brand show up by topic?`.
  - `topicMatrixV1: PartImpl<PeecCtx>` (`id: 'topic-matrix'`, `version: 1`, `defaultLabel: 'Visibility by topic'`), the slice 2 Suspense/error-boundary wrapper.
  - `ExportRequest.aeoMatrix?: 'platforms' | 'all'` (else `null`), `exportPagePath` sets it; both pages add it to `searchParams` and to the `serverExport` body under the same condition as `aeoTrend`.

- [ ] **Step 1: Write the failing tests**
  - `topic-matrix.test.tsx` (mock `next/navigation`; 10 brands, 3 topics, 2 models): default → 8 brand columns, the client's header outlined; clicking Show all brands → `replace` with `aeoMatrix=all` and the other params kept; `aeoMatrix=platforms` → 2 model columns; `aeoMatrix=PLATFORMS` → the default; `showDeltas: false` → no cell has a `title`; a `null` cell renders `–`; export mode → no buttons, the mode line present.
  - `parseMatrixMode` cases (in the same file).
  - golden: mocked loaders, `FIXTURE_PEEC_CTX` + `compare`, snapshot.
  - `request.test.ts`: `aeoMatrix: 'all'` / `'platforms'` accepted and in the path; `'competitors'`, `'x'` → `null`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/topic-matrix.test.tsx components/report-sections/peec-ai/parts/topic-matrix.golden.test.tsx lib/export/request.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `npm run check:rsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): visibility by topic matrix (topic-matrix@1)`

---

### Task 5: Prompt Performance and `prompt-performance@1`

**Files:**
- Create: `components/report-sections/peec-ai/v2/prompt-performance-table.tsx` (`'use client'`), `components/report-sections/peec-ai/parts/prompt-performance.tsx`
- Modify: `components/report-sections/peec-ai/v2/topics-section.tsx` (add `PromptPerformanceSection`)
- Test: `components/report-sections/peec-ai/v2/prompt-performance-table.test.tsx`, `components/report-sections/peec-ai/parts/prompt-performance.golden.test.tsx`

**Interfaces:**
- Consumes: Task 3, `deltaColumn`, `SortableTable`.
- Produces:
  - `PromptPerformanceTable({ rows, showDeltas }: { rows: PromptPerfRow[]; showDeltas: boolean })` — card title `How is the brand ranking on each tracked prompt?`, full width. Columns: Prompt (`cellClassName: 'whitespace-normal break-words'`, never truncated), Topic, Rank (`rank?.toFixed(1) ?? '–'`, sort ascending = best first, nulls last), Rank Δ (`deltaColumn({ key: 'rankDelta', unit: 'places', betterWhen: 'higher', isNew: r => r.isNew })`), Visibility (`x.x%`), Δ (`deltaColumn({ key: 'visibilityDelta', unit: 'pts', betterWhen: 'higher' })`). Δ columns only when `showDeltas`. `defaultSortKey` = `showDeltas ? 'rankDelta' : 'rank'`, `defaultSortDir` = `showDeltas ? 'desc' : 'asc'`. `initialPageSize={25}` ("See all"). Filter chips All / Gained / Lost / No change above the table (`promptChange`), each with its count, local state only, hidden when `!showDeltas` and in export mode (the PDF prints All). An empty chip shows `No prompts in this group.`
  - `PromptPerformanceSection({ ctx })` (async): `promptPerformanceRows((await getTopicsPromptsV2(…)).prompts, ctx.models)`.
  - `promptPerformanceV1: PartImpl<PeecCtx>` (`id: 'prompt-performance'`, `version: 1`, `defaultLabel: 'Prompt Performance'`).

- [ ] **Step 1: Write the failing tests** (`prompt-performance-table.test.tsx`, 5 rows: gained +2, lost −1, same 0.2, New, not ranked)
  - default order: gained, same, lost, then the not-ranked and New rows last; New shows `New`.
  - click Rank Δ header (asc): New still last.
  - chips: Gained → 1 row; Lost → 1; No change → 1; All → 5; counts shown on the chips.
  - `showDeltas: false` → no chips, no `Δ` headers, order by Rank ascending with the not-ranked row last.
  - a 300-character prompt renders in full (no ellipsis, text equal to the input).
  - golden snapshot with mocked loader.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/prompt-performance-table.test.tsx components/report-sections/peec-ai/parts/prompt-performance.golden.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): Prompt Performance table (prompt-performance@1)`

---

### Task 6: Register the parts, section map, export layout, staging recipe, full gate

**Files:**
- Modify: `components/report-sections/peec-ai/parts/registry.ts`, `components/report-sections/peec-ai/v2/sections.ts`, `components/report-sections/peec-ai/parts/export-layout.ts`, `components/report-sections/peec-ai/MAINTAINING.md`
- Test: `parts/export-layout.test.ts`, `guard.test.ts`, `v2/sections.test.ts`

**Interfaces:**
- Produces:
  - Registry: `'topic-matrix': { 1: topicMatrixV1 }`, `'prompt-performance': { 1: promptPerformanceV1 }`.
  - `V2_PART_SECTIONS`: `'topic-matrix@1': '04'`, `'prompt-performance@1': '04'`.
  - `PEEC_EXPORT_LAYOUT`: `'topic-matrix@1': 'block'`, `'prompt-performance@1': 'own'`.
  - `template.ts` unchanged.
  - MAINTAINING.md staging entries for slice 3: `extraParts: [{ "id": "topic-matrix", "version": 1 }, { "id": "prompt-performance", "version": 1 }]`, add `"winners-losers"` to `hidden`, and in `order` put `topic-matrix` then `prompt-performance` where `winners-losers` stood (after `llm-breakdown`). Read the current staging override first and add only these entries (slices 4 and 6 edit the same JSON).
- [ ] **Step 1: Add a test** in `v2/sections.test.ts`: `groupParts` of `[visibility-chart@2, brand-rankings@2, topic-matrix@1, prompt-performance@1]` → sections `['02','04']`, one header each.
- [ ] **Step 2: Implement** the four edits.
- [ ] **Step 3: Full gate:** `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS, no existing snapshot updated.
- [ ] **Step 4: Commit** `feat(aeo-v2): register 04 Topics & Prompts parts`

---

## After the tasks

- Whole-branch review; push `feat/aeo-overview-v2-topics-prompts`; PR into `dev` with the mockup screenshots and the Task 1 topic decision in the description.
- Review record `docs/qa/aeo-overview-v2-topics-prompts-code-review.md` on its own `docs/` branch off `dev`.
- After staging: apply the slice 3 entries for Renaissance and Avenue Z on the **staging** Neon branch only, and check in a browser: the matrix sits directly above Prompt Performance in section 04, the toggle and Show all brands update the URL, a model filter changes both, a PDF with `aeoMatrix=platforms` prints the Platforms grid.
- Follow-up to file, not fix here: v1 Winners/Losers reads only the first 5,000 prompt × model rows (223 of Renaissance's 300 cells); it goes away at the flip, but until then its lists are built from a partial set.
