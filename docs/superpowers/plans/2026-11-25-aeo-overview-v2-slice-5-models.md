# AEO Overview v2 — Slice 5 (03 · Performance by AI Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Section 03 of the v2 Overview, for Peec and Profound: one speedometer per AI model the client tracks, on a true 0–100% scale, with a tick for the competitor average, the value, a change line and "Competitor avg x%", and a Visibility / Share of voice / Used as a source switch. It replaces the model table.

**Architecture:** A new version of an existing part, `llm-breakdown@2`, pinned through `versions`. As in slices 2 and 3, `render` returns an async server child behind `Suspense` + `ReportErrorBoundary`; the child calls a React-`cache`d loader, `getModelsV2(provider, clientSlug, dateRange, compareMode)`, which dispatches to a cached fetcher per provider. The fetchers return, per model and per metric, the client's value, its prior value and the competitor average; the part keeps only the models in the page's model filter. v1's `llm-breakdown@1`, `getPeecOverview` and `getProfoundOverview` are not changed in behavior or cache key.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, inline SVG, vitest + @testing-library/react (jsdom), `lib/cache.ts`.

**Spec:** `docs/superpowers/specs/2026-11-24-aeo-overview-v2-design.md` (on `origin/docs/aeo-overview-v2-spec`): section 6 "03 · Performance by AI Model", 5.2, 5.3, 7, 9 (Q3: true 0–100% for every metric, share of voice included), 10. Depends on slices 2 and 3 being merged: `lib/aeo/v2/types.ts`, `usedAsSourceByBrand` / `brandDomainRows` / `multiRowBrands` / `distinctAnswersByBrand`, `getPeecRoster`, `profoundRows`, `profoundPostAll`, `getProfoundAssets`, `assetDomains`, `visibilityPromptsOnly`, `profoundModel`, the Peec exports from `lib/peec/client.ts`.

**Where to work:** after slice 3 is merged into `dev`:

```bash
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance fetch origin
git -C /Users/paulramirez/Documents/Projects/reporting-dashboard-renaissance worktree add -b feat/aeo-overview-v2-models /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice5 origin/dev
cd /Users/paulramirez/Documents/Projects/.wt-aeo-v2-slice5 && npm ci && cp ../reporting-dashboard-renaissance/.env.local .
```

Mockup screenshots: written without Glean access; Paul attaches the "Performance by AI Model" mockup screenshots to the feature PR.

## Vendor facts (live, read-only, 2026-11-25; slice 2's plan has the shared ones)

- **Peec model × brand** (`/reports/brands`, `dimensions: ['model_channel_id','model_id']`): 87 rows for Renaissance (29 brands × 3 models: `chatgpt-scraper`, `gemini-scraper`, `google-ai-overview-scraper`), one row per (brand, model), with `visibility_count`, `visibility_total`, `share_of_voice`. v1 fetches it for the current window only and keeps every brand's visibility (`brandVisibilityByModel`) but throws away competitor SoV. The prior window needs one more call.
- **Peec model × domain** (`/reports/domains`, same dimensions): 7,010 rows, `limit: 10_000` today; each row has `model.id`, `retrieved_chat_count` and `total_chat_count`, where `total_chat_count` is that model's answers in the window. A brand's Used as a source % on a model = its matched row's `retrieved_chat_count / total_chat_count` (the same rule as the brand table, slice 2). v1's own-domain figure instead averages `retrieved_percentage` over every row Peec classifies OWN; v2 uses the brand's `/brands` domains so the gauges and the brand table agree on what "the brand's site" is.
- **Profound model × asset** (`/v1/reports/visibility`, `['model','asset_name']`) filtered `asset_name in [assets]` works; dimensions and metrics come back alphabetical (`['asset_name','model']`, `['average_position','share_of_voice','visibility_score']`). Avenue Z's models: `ChatGPT`, `Google AI Overviews`, `Google Gemini`. **v1's `normalizeModel` maps "Google AI Overviews" to Gemini**, so v1 merges two of Avenue Z's three models; v2 uses slice 3's `profoundModel` (AI Overviews → `Google`, shown as "Google AI Overview").
- **Profound citations by model** (`/v1/reports/citations`, `['model','hostname']`, `visibilityPromptsOnly`): 3,555 rows; `citation_share` is the share **within that model** (youtube.com: 3.7% overall, 10.8% on Google AI Overviews). There is no per-answer retrieval metric (slice 2), so the third gauge for Profound is citation share, labelled as such (slice 2, Task 5 decision).
- **Prompt scope (spec 7):** the visibility report covers Visibility-type prompts only by construction (a prompt-type filter is rejected); the citations calls add `analysis_type is visibility`. Peec uses all prompts.

## Global Constraints

- v1 output must not change: no `-u` on existing goldens; `llm-breakdown@1` and both overview fetchers keep behavior and cache `version`.
- Peec uses all prompts; Profound uses Visibility-type prompts for all three gauge metrics (citations filtered with `visibilityPromptsOnly`). Sentiment is not shown here; it would use Sentiment-type prompts.
- Every gauge is a true 0–100% scale (Tina, Q3), share of voice included. Values outside 0–100 are clamped for drawing only; the printed number is the real value.
- Change line: `formatDelta(you − youPrior, 'pts')` + `' '` + `compareSuffix(ctx.compare)`, colored by `deltaTone(…, 'higher', 'pts')` with the `deltaColumn` hexes; `youPrior` null → `No comparison data` (muted); hidden when `!ctx.showDeltas`.
- One comparison window: `fetchCompareMode(ctx.compare)`.
- Competitor average = the plain mean over competitor brands that have a value on that model (the mean v1's competitor averages use), never weighted by answers.
- Model filter: only the selected models get a gauge; no "not applied" note.
- `'use client'` only on the gauge grid (it holds the metric switch); `ModelGauge` itself has no hooks; no function props across the boundary; no `any`.
- New fetchers: `cached(…, { version: 'v1', healthCritical: false })`.

## Review Focus

1. **Profound tracks both Google AI Overviews and Google Gemini.** Expect two gauges, "Google AI Overview" and "Gemini", not one merged Gemini (v1's mapping). Test: Task 2 (`buildProfoundModels`).
2. **A model where no competitor has a value** (a client tracking no competitors, or a model only the client appears on). Expect no tick and `Competitor avg –`. Test: Task 1 and Task 3.
3. **No prior value** (a model added this period). Expect `No comparison data`, no arrow, no color. Test: Task 3.
4. **Value 0%, 100% and a Used as a source value of `null`** (the client has no domains configured). Expect the arc empty, full, and `–` with an empty arc. Test: Task 3 (`gaugeArc`).
5. **A model filter that excludes every model with data.** Expect `No data for the selected models.`, not an empty grid. Test: Task 4.

---

### Task 1: Data shape and the Peec fetcher

**Files:**
- Modify: `lib/aeo/v2/types.ts`, `lib/aeo/v2/used-as-source.ts`
- Create: `lib/peec/models-v2.ts`
- Test: `lib/peec/models-v2.test.ts` (add it to the `vitest.config.ts` `include` list), `lib/aeo/v2/used-as-source.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type ModelMetricV2 = { you: number | null; youPrior: number | null; competitorAvg: number | null }` (percents)
  - `type ModelStatV2 = { model: AEOModel; visibility: ModelMetricV2; sov: ModelMetricV2; usedAsSource: ModelMetricV2 }`
  - `type ModelsV2 = { models: ModelStatV2[]; usedAsSourceBasis: UsedAsSourceBasis }` — `models` in `AEO_MODELS` order, only models with client answers in the current window.
- Produces (`used-as-source.ts`): `distinctAnswersByBrandModel(multi: { name: string; domains: string[] }[], chatRows: readonly { domain: string; chat?: { id: string }; model?: { id: string }; model_channel?: { id: string } }[]): Map<string, Map<AEOModel, number>>` — as `distinctAnswersByBrand`, keyed by `normalizeSource(model ?? model_channel)` too.
- Produces (`models-v2.ts`):
  - `getPeecModelsV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<ModelsV2>`, `cached('peec', 'getModelsV2', …)`.
  - Pure, exported: `buildPeecModels(input: { roster: PeecRosterBrand[]; brandRows: ApiBrandRow[]; brandRowsPrior: ApiBrandRow[]; domainRows: ApiDomainRow[]; domainRowsPrior: ApiDomainRow[]; distinct?: Map<string, Map<AEOModel, number>>; distinctPrior?: Map<string, Map<AEOModel, number>>; yourBrand: string }): ModelsV2`.
- Impl: windows and `yourBrand` as `getPeecOverviewImpl`. Calls: `getPeecRoster(pid)`; `/reports/brands` with `dimensions: ['model_channel_id','model_id']`, `limit: 2_000`, current and prior; `/reports/domains` with the same dimensions, `limit: 10_000` paged by `offset`, current and prior; per window, only when some brand has more than one matched row on a model, one `/reports/domains` `dimensions: ['chat_id','model_channel_id','model_id']` call filtered to those domains. Per (brand, model): visibility = summed `visibility_count / visibility_total * 100`; SoV = mean of row `share_of_voice * 100` (v1's `aggToMetrics` rule); Used as a source = `usedAsSourceByBrand` applied to that model's domain rows (`answers = retrieved_chat_count`, `totalAnswers = total_chat_count`) with that model's distinct counts. `you` per metric = the client's value; `youPrior` = the prior window's (null when the client has no prior row on the model); `competitorAvg` = mean over non-client brands with a non-null value, null when there are none. `usedAsSourceBasis: 'answers'`.

- [ ] **Step 1: Write the failing tests**
  - `buildPeecModels` (roster Renaissance `renaissancebenefits.com`, Guardian `guardianlife.com`, Unum with no domains; brand rows on `chatgpt-scraper` and `gemini-scraper`; prior rows on ChatGPT only; domain rows per model with `total_chat_count` 1000 on ChatGPT):
    - models `['ChatGPT','Gemini']` in that order.
    - ChatGPT visibility `you` = 20 for 200/1000; `competitorAvg` = mean of Guardian and Unum.
    - Gemini `youPrior` `null`.
    - ChatGPT Used as a source: Renaissance 30 for 300/1000; `competitorAvg` = Guardian's value only (Unum is null, excluded).
    - SoV uses the row mean × 100.
  - `distinctAnswersByBrandModel`: one chat on two MetLife domains on ChatGPT counts once; a Gemini chat counts under Gemini.
  - impl test (mocks): no `chat_id` call when every brand has at most one matched row per model.
- [ ] **Step 2: Run** `npx vitest run lib/peec/models-v2.test.ts lib/aeo/v2/used-as-source.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Live check (read-only, scratchpad):** `getPeecModelsV2('renaissance','last_30_days','previous_period')` → three models (ChatGPT, Gemini, Google); Renaissance's ChatGPT visibility equals the ChatGPT row of `getPeecOverview('renaissance','last_30_days').llmBreakdown`.
- [ ] **Step 6: Commit** `feat(aeo-v2): Peec per-model data with competitor averages and prior`

---

### Task 2: The Profound fetcher and the shared loader

**Files:**
- Create: `lib/profound/models-v2.ts`, `lib/aeo/v2/models.ts`
- Test: `lib/profound/models-v2.test.ts`

**Interfaces:**
- Produces:
  - `getProfoundModelsV2(clientSlug: string, dateRange: string, compareMode: CompareMode): Promise<ModelsV2>`, `cached('profound', 'getModelsV2', …)`; no category → `{ models: [], usedAsSourceBasis: 'citations' }`.
  - Pure, exported: `buildProfoundModels(input: { assets: ProfoundAsset[]; yourBrand: string; vis: ProfoundNamedRow[]; visPrior: ProfoundNamedRow[]; cites: ProfoundNamedRow[]; citesPrior: ProfoundNamedRow[] }): ModelsV2`.
  - `getModelsV2 = cache((provider: AeoV2Provider, clientSlug: string, dateRange: string, compareMode: CompareMode) => …)`.
- Impl calls per window via `profoundPostAll`: visibility `['model','asset_name']`, `['visibility_score','share_of_voice']`, `filters: [{ field: 'asset_name', operator: 'in', value: assetNames }]`; citations `['model','hostname']`, `['citation_share']`, `filters: visibilityPromptsOnly`. Model = `profoundModel(dims.model)`, rows mapping to `null` dropped. Visibility / SoV = fraction × 100. Used as a source on a model = Σ `citation_share × 100` over hostnames matching `assetDomains(asset)` (`bareDomain` / `sameOrSubdomain`); `0` when none match; `null` when the asset has no domain. `you` = the asset whose name includes `peecYourBrand`, else the `isOwned` asset. Competitor average and prior as Task 1. `usedAsSourceBasis: 'citations'`.

- [ ] **Step 1: Write the failing tests** for `buildProfoundModels` (assets Avenue Z owned `avenuez.com`, iPullRank `ipullrank.com`; vis rows on `ChatGPT`, `Google AI Overviews`, `Google Gemini`, plus an untracked asset; cites on ChatGPT `www.avenuez.com` .05, `ipullrank.com` .02, `youtube.com` .10):
  - three models: `ChatGPT`, `Gemini`, `Google`, in `AEO_MODELS` order.
  - the untracked asset never enters a competitor average.
  - ChatGPT Used as a source `you` = 5.0, `competitorAvg` = 2.0.
  - `0.1859` visibility → `18.59`.
  - impl test (mocks): every citations body carries `visibilityPromptsOnly`; no visibility body carries a prompt-type filter.
- [ ] **Step 2: Run** `npx vitest run lib/profound/models-v2.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Live check (read-only):** `getProfoundModelsV2('avenue-z','last_30_days','previous_period')` → three gauges' worth of data; competitor averages over First Page Sage, iPullRank and OMNISCIENT only.
- [ ] **Step 6: Commit** `feat(aeo-v2): Profound per-model data and the shared loader`

---

### Task 3: The speedometer

**Files:**
- Create: `components/report-sections/peec-ai/v2/gauge.tsx` (no `'use client'`: pure SVG + text)
- Test: `components/report-sections/peec-ai/v2/gauge.test.tsx`

**Interfaces:**
- Consumes: `formatDelta`, `deltaTone`, `compareSuffix`, `MODEL_DISPLAY_LABELS`, `MODEL_COLORS`.
- Produces:
  - `gaugeArc(value: number | null): { angle: number; filled: boolean }` — the needle angle in degrees from −90 (0%) to +90 (100%), value clamped to [0, 100]; `null` → `{ angle: -90, filled: false }`.
  - `ModelGauge(props: { model: AEOModel; metric: ModelMetricV2; metricLabel: string; showDeltas: boolean; compareSuffix: string })` — a semicircle (`viewBox="0 0 120 70"`), a muted full track, an arc filled to the value in `MODEL_COLORS[model]`, a short white tick across the track at `competitorAvg` (none when null), the model name (`MODEL_DISPLAY_LABELS`), the value (`x.x%` or `–`), the change line when `showDeltas`, and `Competitor avg x.x%` (or `Competitor avg –`). `aria-label` = `` `${label}: ${metricLabel} ${value}` ``. Each gauge is one `data-export-block`.

- [ ] **Step 1: Write the failing tests**
  - `gaugeArc`: `0` → `-90`; `50` → `0`; `100` → `90`; `130` → `90` (prints `130.0%`); `-5` → `-90`; `null` → not filled.
  - `ModelGauge`: `you 42.3, youPrior 45.4` → text `-3.1 pts vs previous period` with class `text-[#FF4444]`; `youPrior: null` → `No comparison data` and no tone class; `showDeltas: false` → neither; `competitorAvg: null` → no tick element (`[data-tick]`) and `Competitor avg –`; `competitorAvg: 46.2` → `Competitor avg 46.2%` and one tick; `you: null` → `–`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/gauge.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): model speedometer`

---

### Task 4: Metric switch, the section and `llm-breakdown@2`

**Files:**
- Create: `components/report-sections/peec-ai/v2/gauge-metric.ts`, `components/report-sections/peec-ai/v2/model-gauge-grid.tsx` (`'use client'`), `components/report-sections/peec-ai/v2/models-section.tsx` (async server component), `components/report-sections/peec-ai/parts/llm-breakdown.v2.tsx`
- Modify: `lib/export/request.ts`, `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` (carry `aeoGauge` into the PDF, as slice 2 did for `aeoTrend`)
- Test: `components/report-sections/peec-ai/v2/model-gauge-grid.test.tsx`, `components/report-sections/peec-ai/parts/llm-breakdown.v2.golden.test.tsx`, `lib/export/request.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `GAUGE_PARAM = 'aeoGauge'`; `type GaugeMetric = 'visibility' | 'sov' | 'source'`; `parseGaugeMetric(raw): GaugeMetric` (`sov` / `source` recognised, else `visibility`); `gaugeMetricLabel(m: GaugeMetric, basis: UsedAsSourceBasis): string` → `Visibility` / `Share of voice` / `Used as a source` (`Citation share` when basis is `citations`).
  - `ModelGaugeGrid({ models, basis, showDeltas, compareSuffix }: { models: ModelStatV2[]; basis: UsedAsSourceBasis; showDeltas: boolean; compareSuffix: string })` — receives all three metrics (plain data), reads `aeoGauge` with `useSearchParams`, and writes it with `router.replace(…, { scroll: false })` (`visibility` deletes the param; every other param kept), so switching needs no server round trip and the PDF, whose URL carries `aeoGauge`, prints the same metric. Three buttons (hidden in export mode, where a line names the metric shown); a `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` of `ModelGauge`. `models` empty → `No data for the selected models.`
  - `ModelsSection({ ctx })` (async): `getModelsV2(…)`, keep models in `ctx.models` (all when null), render `ModelGaugeGrid`. Nothing is added to `PeecCtx` or `PeecAIReport`.
  - `llmBreakdownV2: PartImpl<PeecCtx>` (`id: 'llm-breakdown'`, `version: 2`, `defaultLabel: 'Performance by AI model'`), the slice 2 Suspense/error-boundary wrapper.
  - `ExportRequest.aeoGauge?: 'sov' | 'source'` (else `null`); `exportPagePath` sets it; both pages add it to `searchParams` and to the `serverExport` body under the same condition as `aeoTrend`.

- [ ] **Step 1: Write the failing tests**
  - `model-gauge-grid.test.tsx` (mock `next/navigation`): three gauges, Visibility by default; with `aeoGauge=source` and basis `citations` the labels read `Citation share`; `aeoGauge=bogus` → Visibility; clicking Share of voice → `replace` with `aeoGauge=sov` and the other params kept; `models: []` → `No data for the selected models.`; export mode → no buttons, the metric line present.
  - `models-section` filter (same file, mocked `@/lib/aeo/v2/models`): `ctx.models = ['Gemini']` → one gauge; `['Claude']` with no Claude data → the empty line.
  - golden snapshot with the mocked loader.
  - `request.test.ts`: `aeoGauge: 'sov'` / `'source'` accepted and in the path; `'visibility'`, `'x'` → `null`.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/peec-ai/v2/model-gauge-grid.test.tsx components/report-sections/peec-ai/parts/llm-breakdown.v2.golden.test.tsx lib/export/request.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, then `npm run check:rsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(aeo-v2): one gauge per AI model with a metric switch (llm-breakdown@2)`

---

### Task 5: Register the part, section map, export layout, staging recipe, full gate

**Files:**
- Modify: `components/report-sections/peec-ai/parts/registry.ts`, `components/report-sections/peec-ai/v2/sections.ts`, `components/report-sections/peec-ai/parts/export-layout.ts`, `components/report-sections/peec-ai/MAINTAINING.md`
- Test: `parts/export-layout.test.ts`, `guard.test.ts`, `v2/sections.test.ts`

**Interfaces:**
- Produces:
  - Registry: `'llm-breakdown': { 1: llmBreakdownV1, 2: llmBreakdownV2 }`.
  - `V2_PART_SECTIONS`: `'llm-breakdown@2': '03'`.
  - `PEEC_EXPORT_LAYOUT`: `'llm-breakdown@2': 'own'` (each gauge is its own block).
  - `template.ts` unchanged.
  - MAINTAINING.md staging entries for slice 5: `versions: { "llm-breakdown": 2 }`, with `llm-breakdown` in `order` after `brand-rankings` (02) and before `topic-matrix` (04). Read the current staging override first and add only this entry.
- [ ] **Step 1: Add a test** in `v2/sections.test.ts`: the real map groups `[visibility-chart@2, brand-rankings@2, llm-breakdown@2, topic-matrix@1, prompt-performance@1]` as `['02','03','04']`, and `sectionsPresent` lists them in that order.
- [ ] **Step 2: Implement** the four edits.
- [ ] **Step 3: Full gate:** `npm run typecheck && npm run lint && npm test && npm run check:rsc` — Expected: all PASS, no existing snapshot updated.
- [ ] **Step 4: Commit** `feat(aeo-v2): register 03 Performance by AI Model part`

---

## After the tasks

- Whole-branch review; push `feat/aeo-overview-v2-models`; PR into `dev` with the mockup screenshots.
- Review record `docs/qa/aeo-overview-v2-models-code-review.md` on its own `docs/` branch off `dev`.
- After staging: apply the slice 5 entry for Renaissance and Avenue Z on the **staging** Neon branch only, and check in a browser: section 03 sits between 02 and 04, Avenue Z shows three gauges (Google AI Overview separate from Gemini), the switch updates the URL and the gauges, Show deltas off removes every change line, a PDF with `aeoGauge=sov` prints the SoV gauges.
- Follow-up to file, not fix here: v1's Profound `normalizeModel` merges Google AI Overviews into Gemini.
