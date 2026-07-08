# FB-065 Sentiment Insights — Profound Data Contract

Branch: `fb-065-sentiment-from-profound`. This document is the contract between
what Tina asked the Sentiment Insights card to show and what we pull from
Profound to produce it. It is the reference for QA: every output below traces
to a concrete Profound input and a pure transform.

## 1. Output requirements (what Tina asked for)

From Tina's message (Jun 17) plus her Profound example export:
- **R1** Sentiment as a KPI pill (a polarity label + a %).
- **R2** Positive Themes and Negative Themes, side by side.
- **R3** Click a theme -> accordion of the sources cited. In her example the
  positive themes ("claims") carry citation URLs; the negative themes
  ("weaknesses") carry a one-line explanation, not URLs.
- **v1 flag to fix (verbatim):** "This seems like static copy and should be
  pulling actual data. It doesn't change when a new date range or model is
  selected and is an exact copy of the example text I provided." So the card
  must be **live and reactive to both date range and model**, pure data, no
  static/manipulated copy.

## 2. Source of record

- Profound REST API: `POST https://api.tryprofound.com/v1/reports/sentiment`
- Auth: header `X-API-Key` = env `PROFOUND_AI_ACCESS_TOKEN` (in Vercel prod+preview and local gitignored `.env`).
- Category: "Marketing & PR" `8cf8471d-3133-4ce9-9610-e55a7bc340b9` (env `PROFOUND_CATEGORY_ID`, else first from `/v1/org/categories`).
- Asset (brand): env `PROFOUND_AI_YOUR_BRAND` = "Avenue Z".
- Rate limit: 600 req/hr per key.

## 3. Inputs we pull (exact)

- **Metrics:** `positive`, `negative`, `occurrences` — integer counts.
  (The public docs' `positive_sentiment` / `negative_sentiment` names are wrong
  for the v1 endpoint; verified live by 422 error.)
- **Dimensions used:** `model`, `theme`.
- **Per (period, model-selection) we issue:**
  1. `dimensions:['model']` -> per-model positive/negative (drives the pill).
  2. `dimensions:['model','theme']` -> per-(model,theme) counts (drives themes).
  3. A prior-period `dimensions:['model']` call when a comparison period is on (drives the delta).
  4. `POST /v1/prompts/answers`, paged through ALL of the period's answers
     (`pagination.limit: 5000`, `offset` stepping, up to `ANSWERS_MAX_PAGES: 8`
     => 40k-answer ceiling), each answer tagged with `themes` + `citations` +
     `model` (drives the per-theme sources accordion). The endpoint ignores
     top-level `limit`; only `pagination.limit`/`offset` bound it. We fold each
     page into the theme->sources accumulator and drop the heavy response text
     as we go, so memory stays bounded. Current periods run ~10k answers, well
     under the 40k ceiling; a period exceeding 40k would drop tail sources for
     the rarest themes only (documented bound, not currently reachable).
- Response rows carry `metrics[]` aligned to `info.query.metrics` (returned
  alphabetical). We resolve every metric **by name**, never by position.

## 4. Output mapping (input -> what renders)

| Card element (Tina) | Profound input | Transform |
|---|---|---|
| **Pill %** (R1) | `['model']` counts | `positive / (positive + negative) * 100`, summed over the **selected** models |
| **Pill label** (R1) | pill % + negative-theme count | existing `pctLabel`: Positive >=75, Negative <45 with negative themes, else Mixed |
| **Positive Themes** (R2) | `['model','theme']` | folded per theme over selected models; keep themes where `positive > negative`; sort by positive count desc; case-fold duplicate labels; top 8 |
| **Negative Themes** (R2) | `['model','theme']` | same fold; keep themes where `negative > positive`; sort by negative count desc; top 8 |
| **Delta** | prior `['model']` counts | `current pill - prior pill` (pp); computed only when a comparison period is passed. The card currently passes none, so no delta line renders (matches Tina's pill-only example). |
| **Sources per theme** (R3) | `/v1/prompts/answers` `themes`+`citations`+`model` | for each theme, the de-duplicated citations of the answers tagged with that theme, filtered to the selected models, capped at 12. **Answer-level attribution** (see note). |
| **Theme badge count** | `['model','theme']` counts | the number is the theme's **occurrence count in its dominant polarity**, NOT the number of cited sources. A theme can read 18 with 12 sources (source cap), or 18 with 0 sources (uncited answers, §8a). Count and source-list length are independent by design. |

## 5. Reactivity guarantees (the v1 fix)

- **Date range:** `start_date` / `end_date` (from `parseDateRange`) drive every
  query; the comparison period (`deriveCompareRange`) drives the delta.
- **Model:** aggregation is client-side over the selected models
  (`selectedProfoundModels` maps AEOModel -> Profound name). ChatGPT-only != all
  models. Untracked models (Claude, Copilot: no Profound data for this account)
  produce an honest **empty** result, never a silent widen-to-all.
- **Cache key** = (`dateRange`, `compareRange`, model selection). A different
  date or model selection is a different cached result, so the card cannot
  serve stale copy across selections.

## 6. Purity (nothing manipulated, no AI)

- **Zero AI/LLM calls.** No Glean, no model inference. Only Profound counts and
  arithmetic: sum, share, sort, top-N, case-fold.
- **No fabricated values.** An empty period/model selection yields a `null`
  pill (the card shows "no data"), never a fake `0%`.
- Metrics read by name from `info.query.metrics`, so a change in Profound's
  field ordering cannot silently mislabel a number.

## 7. Back-test / validation

- **Internal consistency (passes):** all-models last-30 pill = **63.7%**
  (positive 5157 / negative 2937). The per-model pills (ChatGPT 61.5, Gemini
  63.1, Google AI Overviews 64.2, Perplexity 67.6) sum back to exactly this
  aggregate. Our `sumModelRows` reproduces it.
- **Right account/topics (passes):** the `topic` dimension returns AI Search,
  PR, TikTok Shop — Avenue Z's real tracked topics.
- **CAVEAT — the June PDF is NOT a numeric oracle.** Tina's example
  ("Positive 89.4%") came from Profound's **pre-rebuild** sentiment product with
  a ChatGPT + AI Search filter. The current API for that same window+filter
  returns 55.3%, and the theme vocabulary is entirely different (PDF: "Strong AI
  Visibility Gains"; API: "Thought Leadership", "Premium Pricing"). Profound
  publicly rebuilt Sentiment since then. **Source of truth going forward is the
  live Profound API; QA the numbers against Profound's current UI, not the PDF.**

## 8. Attribution note (per-theme sources)

The accordion sources are **answer-level, not claim-level.** Each Profound
answer is tagged with the themes it expresses and the citations it drew from,
but not which citation backs which theme *within* that answer. So a theme's
sources = every citation from answers that expressed that theme. Those URLs
genuinely appeared in AI answers discussing the theme (true and defensible),
but it is not the surgical "this exact URL -> this exact claim" mapping
Profound's own UI may show. Profound does not expose claim-level citation
attribution via the API. The fetch pages through ALL of the period's answers
(`pagination.limit`=5000, up to `ANSWERS_MAX_PAGES`=8 => 40k answer ceiling,
current periods run ~10k so we have headroom). The fetch is best-effort: any
failure leaves the themes rendering with counts and no sources, never a
broken card.

### 8a. Themes with counts but zero sources (data reality, not a bug)

Profound's sentiment analysis and its answer feed are two different endpoints
and don't always align: **a theme can have a real positive/negative count from
`/v1/reports/sentiment` while every answer that carries it in
`/v1/prompts/answers` has no citations.** This is common with Perplexity, which
sometimes returns AI answers without citation URLs. Local sweep confirmed the
condition on last-30d 2026-06-08..2026-07-07, Perplexity-only view: themes
"Clear Value Proposition" (pos 5), "Resource Intensity" (neg 3), "Traffic
Congestion" (neg 2) each had 0 URLs because their 5/3/2 backing Perplexity
answers all had empty `citations`. The card handles this with an honest empty
state (see `SourceList` in `sentiment-insights.tsx`): "Profound tagged this
theme in AI answers that did not include citation URLs." Not a code bug. Do
not hide these themes; suppressing them would misrepresent Profound's counts.

### 8b. Cache versioning discipline

`getProfoundSentiment` is `cached(..., { version })`. The cache key is
(vendor, fn, `version`, today, ...args). **Bump `version` any time anything
downstream of the cache changes** (fetch params, filter logic, response
mapping). Missing a bump serves the prior deploy's serialized result under
the same key -- 1h TTL means an incorrect result survives across builds until
the key changes. The v1 -> v2 bump landed with the paginated answers fetch;
future fetch-shape changes need the same discipline.

## 9. Containment (blast radius)

- **Avenue Z only.** The card renders solely when `clientSlug === 'avenue-z'`
  (`pr-influence.tsx`). Profound is a single-account, env-fixed feed
  (`PROFOUND_AI_YOUR_BRAND` = Avenue Z), so any other client would otherwise see
  Avenue Z's data. Renaissance shares the base template, has no Profound account,
  and has this section hidden -- it never calls Profound.
- New modules: `lib/profound/sentiment.ts`, `sentiment-normalize.ts`,
  `sentiment.test.ts`. Existing-code changes: two `export` keywords in
  `lib/profound/client.ts`, one `include` line in `vitest.config.ts`, and the
  Sentiment card files.
- The in-house Glean sentiment path (`lib/peec/sentiment-insights.ts`) is
  **deleted**; no remaining importers.
- CI gates green: RSC-boundary check, `tsc`, and the vitest suite (incl. the
  new `lib/profound` unit tests).

## 10. Degradation / error edge cases (every failure lands soft)

The card never crashes the PR Influence page and never shows a fabricated
number. Enumerated:

| Condition | Behavior |
|---|---|
| **Single-day range** (`start_date == end_date`) | Profound returns 422. `SentimentInsightsSection` try/catches the whole fetch -> `data = null` -> no-data card ("No classified sentiment... Try a wider date range or the all-models view."). Standard presets (7/30/90d, YTD) never produce a single-day range. |
| **Any sentiment fetch fails** (network, 5xx, timeout) | Same try/catch -> `data = null` -> no-data card. Logged to server console, never surfaced as an error UI. |
| **Answers (sources) fetch fails** | Isolated try/catch inside `buildSourcesMap`; the pill + theme lists still render, themes just show the honest "no citation URLs" empty state. A sources failure never takes down the counts. |
| **Empty model selection** (only untracked Claude/Copilot) | `selectedProfoundModels` returns an empty Set -> `sumModelRows` returns `{0,0}` -> `positiveShare` returns `null` -> `occurrences === 0` -> no-data card. Never widens to all models. |
| **Theme polarity tie** (`positive === negative`) | Theme dropped as ambiguous (neither list). |
| **Case-variant duplicate theme labels** | Folded case-insensitively; display keeps the highest-occurrence casing; counts summed. |
| **Profound reorders response metrics** | Metrics resolved by name from `info.query.metrics`, so column reordering cannot mislabel a value. |
| **Pill positive share** | `null` (not `0%`) when nothing is classified, so the card shows no-data rather than a misleading 0%. |

`noData` in `sentiment-insights.tsx` is the single gate:
`!data || data.occurrences === 0 || data.positivePct === null`. Every path
above resolves to one of those three.
