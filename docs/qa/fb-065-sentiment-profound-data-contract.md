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
- Response rows carry `metrics[]` aligned to `info.query.metrics` (returned
  alphabetical). We resolve every metric **by name**, never by position.

## 4. Output mapping (input -> what renders)

| Card element (Tina) | Profound input | Transform |
|---|---|---|
| **Pill %** (R1) | `['model']` counts | `positive / (positive + negative) * 100`, summed over the **selected** models |
| **Pill label** (R1) | pill % + negative-theme count | existing `pctLabel`: Positive >=75, Negative <45 with negative themes, else Mixed |
| **Positive Themes** (R2) | `['model','theme']` | folded per theme over selected models; keep themes where `positive > negative`; sort by positive count desc; case-fold duplicate labels; top 8 |
| **Negative Themes** (R2) | `['model','theme']` | same fold; keep themes where `negative > positive`; sort by negative count desc; top 8 |
| **Delta** | prior `['model']` counts | `current pill - prior pill` (percentage points); only when a comparison period is on |
| **Sources per theme** (R3) | — | **NOT returned by this endpoint** (see Open Items) |

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

## 8. Open items

- **Per-theme source URLs (R3 accordion).** `/v1/reports/sentiment` does not
  return citations per theme (`claim` is not a valid dimension; `include_cited_websites`
  does not attach to theme rows). Citations live in `/v1/prompts/answers`, keyed
  by `topic`, not `theme`, so there is no clean theme->URL join. Decision pending:
  (a) ship themes without per-theme sources, or (b) reconstruct via a
  theme->topic->citations join. Does not block the pill + themes.

## 9. Containment (blast radius)

- New files: `lib/profound/sentiment.ts`, `lib/profound/sentiment-normalize.ts`,
  `lib/profound/sentiment.test.ts`. Imported by nothing yet (inert).
- Only existing-code changes: two `export` keywords in `lib/profound/client.ts`
  (behavior-neutral) and one `include` line in `vitest.config.ts`.
- Not wired into any render. Blast radius is zero until the card is wired
  (next step), and even then scoped to the PR Influence Sentiment card only.
