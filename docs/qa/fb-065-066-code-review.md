# FB-065 / FB-066 Sentiment Insights — Code Review

Reviewed: the Profound-sourced Sentiment Insights work merged into `dev` via
**PR #135** (FB-065: Sentiment Insights from Profound, Avenue Z only), **PR #136**
(FB-065 verification data contract), and the **FB-066** commit `2024b56` (rank
accordion sources by citation frequency + "N mentions" badge + plain-speak
footer). Review scope is exactly the diff `097b811^..2024b56` — no unrelated
code.

This document is the review record (comprehension gate per `CLAUDE.md` §"Code
Review & Merge Process"). It captures how the feature works, the findings, and
how each finding was verified. **No code is changed here** — the fixes are
tracked as follow-ups in §5.

---

## 1. How it works (comprehension summary)

FB-065 **replaces the old in-house Glean sentiment guess** (which inferred tone
from article headlines) with data pulled directly from Profound's API. Nothing
on the card is AI-generated on our side; every value traces to a Profound count
or tag. The full input→output contract lives in
[`fb-065-sentiment-profound-data-contract.md`](./fb-065-sentiment-profound-data-contract.md);
in brief:

- **Pill %** = `positive / (positive + negative) × 100`, from
  `POST /v1/reports/sentiment` grouped by `['model']`, summed over the selected
  models. Returns `null` (renders "no data") when nothing is classified — no
  fake 0%.
- **Positive / Negative themes** — same endpoint grouped by `['model','theme']`,
  folded case-insensitively, classified by dominant polarity (ties dropped),
  sorted by count, top 8.
- **Sources per theme** (the accordion, FB-066) — a *different* endpoint,
  `POST /v1/prompts/answers`, paged through all of the period's answers
  (`pagination.limit` 5000, `ANSWERS_MAX_PAGES` 8), attributing each answer's
  citations to every theme it expresses, then ranked by citation frequency, top
  12. The "N mentions" badge is the theme's dominant-polarity occurrence count.
- **Model reactivity** (Tina's v1 flag) is done **client-side**: group by
  `model`, aggregate only the selected ones. Profound's server-side model
  filter keys on UUIDs and silently no-ops, so it is deliberately not used.

The pure logic in `lib/profound/sentiment-normalize.ts` is well-tested (24
cases in `lib/profound/sentiment.test.ts`, all green) and back-tests against a
known Avenue Z aggregate (63.7%). The core math is sound.

---

## 2. Verification method

Every finding below was probed against the live working tree, not just read:

- **Static anchors** — each cited line/symbol confirmed present at the stated
  location in the merged code.
- **Deterministic logic findings (#4, #5, and #1's filter mechanism)** — proven
  by executing the real shipped functions in a temporary probe spec (since
  removed). All three reproduced the claimed behavior.
- **#2 mechanism** — confirmed the model filter navigates via `router.push`
  (`components/report-sections/peec-ai/model-filter.tsx:34`), a soft navigation
  that preserves client-component `useState` across the RSC re-render.
- **PLAUSIBLE findings (#1, #3)** — the *code assumption* is confirmed; the
  *trigger* is an external Profound API behavior not confirmable without a live
  call, so they are flagged as needing verification rather than asserted.

---

## 3. Findings

Severity: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven
in-tree) / PLAUSIBLE (realistic, trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | PLAUSIBLE | `lib/profound/sentiment-normalize.ts:179` | Answers-endpoint `model` value may not match the sentiment-endpoint display names → model-filtered source accordions silently empty |
| 2 | ● | CONFIRMED | `components/report-sections/peec-ai/sentiment-insights.tsx:122` | Accordion open-state keyed by array index persists across a filter change → wrong theme shows expanded |
| 3 | ● | PLAUSIBLE | `lib/profound/sentiment.ts:124` | Pagination break assumes Profound honors `pagination.limit=5000`; a smaller server cap truncates sources to page 1 |
| 4 | ● | CONFIRMED | `lib/profound/sentiment-normalize.ts:141` | Missing-`info.query.metrics` fallback is ineffective → every theme dropped as a 0/0 tie despite real data |
| 5 | ● | PLAUSIBLE | `lib/profound/sentiment-normalize.ts:187` | Duplicate theme label within one answer double-counts that answer's citations |
| 6 | ○ | CONFIRMED | `components/report-sections/peec-ai/pr-influence.tsx:516` | Hardcoded `clientSlug === 'avenue-z'` gate violates `CLAUDE.md` Rule #3 |
| 7 | ○ | CONFIRMED | `lib/profound/sentiment.ts:207` | Env-single-account + cache key has no client dimension → cross-client collision if a 2nd client is added |
| 8 | ○ | CONFIRMED | `lib/profound/sentiment.ts:76` | `modelKeyOf` duplicates the deleted Peec helper; belongs in `lib/peec/models.ts` |
| 9 | ○ | CONFIRMED | `lib/profound/client.ts:35` | `next: { revalidate: 3600 }` is inert for the ~40MB answers pages (Next Data Cache 2MB cap) |
| 10 | ○ | CONFIRMED | `components/report-sections/peec-ai/sentiment-insights-section.tsx:46` | Prior-period comparison path is dead (documented as intentional) but the module comment claims it is active |

---

## 4. Detail

### 1 · ● Answers-endpoint model vocabulary — PLAUSIBLE
`accumulateThemeSources` filters answers with `selected.has(a.model)`, where
`selected` holds Profound **display** names (`ChatGPT`, `Google AI Overviews`,
…). Nothing confirms `/v1/prompts/answers` returns those same strings — the
sibling `/v1/reports/visibility` endpoint returns raw ids (`openai`, `gpt`,
`anthropic`, `bing`), which is exactly why `normalizeModel()` exists in
`lib/profound/client.ts`. If answers uses raw ids, then under any model filter
`selected.has('openai')` is false for every row → **every theme's source
accordion is empty, only when a model filter is active** (the unfiltered view
still works because `selected` is null). The tests hand-write `model:'ChatGPT'`,
which assumes the answer rather than proving it.
**Verify:** one live `/v1/prompts/answers` row. **Suggested fix if raw ids:**
run `a.model` through `normalizeModel` and map back to the Profound display name
before the `selected.has()` check.

### 2 · ● Accordion state keyed by index — CONFIRMED
`ThemeColumn` holds `open` as `Set<number>` of positional indices. The model
filter uses `router.push` (soft nav), so the client component is reconciled in
place and its `open` set is retained across the server re-render. After the
theme list changes, retained indices point at different themes: a theme the user
never opened renders expanded, and the one they did open collapses.
**Suggested fix:** key `open` by theme title, or reset it when the `themes` prop
identity changes.

### 3 · ● Pagination break assumption — PLAUSIBLE
`if (rows.length < ANSWERS_PAGE) break` treats a short page as the last page. If
Profound caps `pagination.limit` server-side below 5000, page 0 returns fewer
than 5000 rows and the loop stops after one page of a ~10k+ answer set →
lower-volume themes silently lose sources, masked as "complete coverage" (the
exact bug the paginated fetch was written to fix).
**Suggested fix:** terminate on a zero-row page, not on `< requested`.

### 4 · ● Ineffective missing-metrics fallback — CONFIRMED
`collapseModelThemeRows` defaults `metricNames` when *building* output rows but
returns the original `resp.info` unchanged, so downstream `readMetric` still
can't resolve any metric. If a response omits `info.query.metrics`, input reads
already return 0, and because the returned `info` also lacks metrics,
`normalizeThemes` reads 0/0 for every theme and drops them all as ambiguous
ties. **Proven** by executing the real functions: a valid `[model,theme]`
response with `info: {}` yields empty positive **and** negative theme lists.
**Suggested fix:** rebuild `info` as `{ query: { metrics: metricNames } }`, or
default the ordering inside `readMetric`.

### 5 · ● Duplicate theme label double-count — PLAUSIBLE
`accumulateThemeSources` de-dupes URLs within an answer (the `cites` Set) but
not theme labels, so an answer tagged with the same theme in two casings
(`['Pricing','pricing']`) increments each cited URL's count twice for key
`pricing`. **Proven** by execution: `a.com` cited by one such answer outranks
`b.com` cited by two distinct answers. Contradicts the documented "how many
answers cite this page" semantics. Depends on Profound emitting duplicate theme
tags per answer. **Suggested fix:** de-dupe the answer's theme keys before the
attribution loop.

### 6 · ○ Hardcoded slug gate — CONFIRMED
`pr-influence.tsx:516` gates the card on `clientSlug === 'avenue-z'`. `CLAUDE.md`
Rule #3 (line 422): *"Never hardcode client names, slugs, or identifiers."* The
established pattern is right next door: `getProfoundOverviewImpl`
(`lib/profound/client.ts:398`) gates on DB config
(`if (!config?.profoundCategoryId) return emptyOverview()`). Cost: renaming the
slug silently hides the card; onboarding a second Profound client requires a
code change + redeploy. The other `'avenue-z'` literals in the repo are cosmetic
(logo styling) or test-admin defaults — none gate a data feature.
**Suggested fix:** gate on `profoundCategoryId` from the client row.

### 7 · ○ Env-single-account + client-less cache key — CONFIRMED
`resolveAsset()` reads `process.env.PROFOUND_AI_YOUR_BRAND`, `getCategoryId()`
falls back to env, `clientSlug` is not threaded into `SentimentInsightsSection`,
and the cache `extractTags` (`sentiment.ts:207`) keys only on
`(dateRange, compareRange, models)` — **no client dimension**. Single-tenant by
construction: the moment the `'avenue-z'` gate (finding #6) is relaxed for a
second client, both collide on the same cache key and one sees the other's
sentiment — the same cross-client cache-key collision class already tracked in
`CLAUDE.md`'s dashboard follow-ups. Pairs with #6; fix them together.
**Suggested fix:** thread `clientSlug`, resolve brand/category from the DB row,
add `client` to `extractTags`.

### 8 · ○ Duplicated `modelKeyOf` — CONFIRMED
`modelKeyOf` (`sentiment.ts:76`) duplicates the logic of the `modelKeyOf` from
the now-deleted `lib/peec/sentiment-insights.ts` (bodies identical; the new one
only adds `| undefined` and is non-exported). Its natural home,
`lib/peec/models.ts`, already houses the sibling helper `isAllModels`. Cost: a
third provider copies it again and the copies can silently diverge (separator /
sort), producing mismatched cache keys across providers for the same selection.
**Suggested fix:** export one shared helper from `lib/peec/models.ts`.

### 9 · ○ Inert `revalidate` on large answers pages — CONFIRMED
`profoundPost` sets `next: { revalidate: 3600 }`, but each `/v1/prompts/answers`
page (5000 rows with `response` text, part of a ~40MB/period set) exceeds
Next.js's 2MB Data Cache entry limit, so those responses are never cached. The
`revalidate` implies fetch-layer caching the payload size guarantees won't
happen; the outer `cached()` wrapper is what actually persists the small final
result. Efficiency/clarity, not a crash.
**Suggested fix:** rely solely on the outer `cached()` result; drop or comment
the misleading `revalidate` for the answers path.

### 10 · ○ Dead comparison path — CONFIRMED (intentional)
The only caller passes `compareRange = null`
(`sentiment-insights-section.tsx:46`), and the UI never renders
`positivePctDelta`, so the prior-period `fetchByModel` + delta math never run.
The data contract documents this as intentional ("the card currently passes
none… matches Tina's pill-only example"), so this is **not a runtime bug** — but
the `sentiment.ts` header comment (lines 8–11) claims the fetch is "reactive to
BOTH the date range (start/end + comparison)", which is false as wired.
**Suggested fix:** either wire the delta into the pill or remove the branch and
correct the comment (per `CLAUDE.md` §"Simplicity First").

---

## 5. Follow-ups (not fixed here)

Tracked separately so this stays a pure review record:

- **Correctness:** #2 (accordion index-state), #4 (metrics fallback), #5
  (duplicate-theme double-count), #3 (pagination zero-row guard).
- **Needs a live Profound call first:** #1 (answers `model` vocabulary).
- **Gating architecture (decide together):** #6 (hardcoded slug) + #7
  (env-single-account / client-less cache key).
- **Cleanup:** #8 (extract `modelKeyOf`), #9 (misleading `revalidate`), #10
  (dead compare path + comment).

None block the current Avenue-Z-only ship; #1 is the highest-value follow-up
because it can silently empty the source accordions under a model filter.
