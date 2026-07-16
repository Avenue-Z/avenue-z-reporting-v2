# Paul V3 QA Fixes (Combined): Design

**Status:** design, pending Thomas review.
**Branch:** `feature/paul-v3-qa-fixes` (off `dev`).
**Scope:** every issue Paul surfaced in the two rounds of QA, on one branch, one PR to dev.
Two sources: **Column H** of the two feedback CSVs (his live-tab QA) and **GitHub PR #138**
(his Profound sentiment code-review doc). 19 line items total.

Sub-specs referenced:
- FB-068 citation dates: [`2026-07-09-pr-influence-citation-dates-design.md`](./2026-07-09-pr-influence-citation-dates-design.md) (already API-proven).

---

## Global constraints

- **React to model + date wherever the data allows.** The established pattern (sentiment,
  matchback, Top Editorial Opportunities, Winners/Losers) is that values recompute on the
  date range and model filter. Fixes here extend that. Two known data ceilings stay: the
  scatter's 30-day Peec bot-retention window, and comparison deltas that need per-model
  prior-period data to be honest.
- **Avenue Z surfaces stay data-only.** No AI/Glean synopsis added or changed. Honest
  no-data, never fabricated.
- **No em dashes / en dashes** anywhere (prose, code, comments, commits, docs).
- **No new secret, no DB migration** unless a line item explicitly calls for a DB column
  (P6/P7 read an existing `profoundCategoryId`).
- Every code change lands with tests where the logic is unit-testable; live-verify on the
  preview after.

---

## Workstream 1: FB-068 citation dates (Column H, PR-3)

Full detail in the referenced sub-spec. Summary: add **First cited** and **Most recent**
columns to the matchback, bounded to the selected window, matching the model filter, via a
new isolated `getPlacementCitationDates` (Peec `/reports/domains` dimensioned by
`model_id`+`date`, default-ascending for first, `order_by` desc for most-recent, bounded
pagination). Pure `buildCitationDateIndex` + extend `computePlacementMatchback` +
`MatchbackRow`. Publish Date stays. Path proven live (12/12 vs ground truth).

---

## Workstream 2: Column-H live-QA fixes

### CI-1 Prompt Coverage static at 58% (Content Impact)
- **Wrong:** base value calls `getDomainCoverage(clientSlug)` with no date args
  (`content-impact.tsx:261`), so it is hard-locked to last-30 (`url-citations.ts:332-333`);
  the coverage path has no model dimension and reads unfiltered `ownDomains`. Only the delta
  pill uses a period-aware source (`content-impact.tsx:303-304`).
- **Fix:** (a) thread the selected date range (`effectiveRange`) into the `getDomainCoverage`
  call feeding §A so the value moves with the period; (b) make it model-reactive by adding
  `model_id` to the coverage fetch dimensions (`['prompt_id','model_id']` / `['tag_id','model_id']`)
  and aggregating to the selected models client-side, so the numerator counts only prompts
  citing owned domains under the active engines. A quick read-only Peec probe confirms
  `['prompt_id','model_id']` returns per-prompt per-model rows before wiring.
- **Test:** unit-test the model-aware coverage aggregation (owned prompts under a model subset
  vs all models) + live-verify the value changes on date and model.

### CI-2 Speed Stats "0 days" (Content Impact)
- **Wrong:** `daysToFirstAi` is whole days floored at 0 (`content-derive.ts:133-144`), rendered
  `${Math.round(val)} days` (`content-impact.tsx:1211`); sub-day shows "0 days". GA4 source is
  day-bucketed (`dimensions:['pagePath','date','sessionSource']`), so hour data does not exist.
- **Fix (default, no new data):** render a same-day result as **"Same day"** instead of
  "0 days"; keep "N days" for >= 1. Honest and cheap.
- **Optional (not in default scope):** true hours would require adding a `dateHour` GA4 query
  for sub-day items; flagged, not built unless asked.
- **Test:** unit-test the formatter (0 -> "Same day", 1 -> "1 day", n -> "n days").

### CI-3a Scatter top-left quadrant label unreadable (Content Impact)
- **Wrong:** all four labels use `text-text-muted` 10px (`bot-vs-human-scatter.tsx:57`); the
  top-left cell overlaps the rotated Y-axis title and the dense high-human points
  (`bot-vs-human-scatter.tsx:62-84`).
- **Fix:** raise label contrast and add a subtle background/padding; nudge the top-left label
  inward so it clears the Y-axis title and does not sit on the point cloud.
- **Test:** visual (live preview); no unit logic.

### CI-3b Scatter hover URL not clickable (Content Impact)
- **Wrong:** the path renders as plain text in a default Recharts tooltip
  (`bot-vs-human-scatter.tsx:86-99`), non-interactive and cursor-following.
- **Fix (default):** make the point actionable: clicking a point opens its URL in a new tab
  (robust, avoids the vanishing-tooltip problem entirely), and the tooltip shows the full URL.
  A hover-persistent tooltip with an anchor is the alternative but is fiddlier; click-to-open
  is the reliable default.
- **Test:** live-verify click opens the correct URL.

### CI-3c Scatter honor the date picker within 30 days (Content Impact)
- **Wrong:** both axes hard-locked to last-30 (`content-impact.tsx:349-360, 650-665`); a
  selected range inside 30 days is ignored.
- **Fix:** when the selected range is fully within the last 30 days, use it for the human axis
  and the bot axis (both clamped to >= today-30); otherwise fall back to the 30-day window with
  the existing note. Bot data can never exceed 30 days (Peec retention), so ranges older/wider
  than 30 days keep the lock.
- **Test:** unit-test the window-resolution helper (in-window range passes through; out-of-window
  clamps to 30d) + live-verify.

### CI-4 Competitor Citation Share "18.2% cap" note (Content Impact)
- **Wrong:** code is correct (share-of-period, no cap, `content-impact.tsx:1392-1404`); only the
  shipped feedback-log note claiming a "18.2% cap" was inaccurate (it conflated FB-052's
  row-count bump with a value ceiling). 29.8% is a legitimate value.
- **Fix:** NO code change. Correct the note wording in `docs/official-feedback/feedback-log.md`.

### PR-1 Sentiment pill % does not match shown themes (PR Influence)
- **Wrong (not a bug):** pill = `positive/(positive+negative)` over ALL classified sentiment
  (`sentiment.ts:165-166`); the theme columns are a top-8, dominant-polarity, ties-dropped
  subset from a different call (`sentiment-normalize.ts:245-292`). The two cannot be reconciled
  by eye.
- **Fix:** add a one-line tooltip/footnote on the pill: the score reflects all classified
  sentiment for the selected models and period, not only the themes listed below. No math change.
- **Test:** copy only; live-verify tooltip renders.

### PR-2 Non-positive-delta rows in Top Editorial Opportunities (PR Influence)
- **Wrong:** the positive-delta filter was intentionally removed in FB-028
  (`pr-influence.tsx:293-298`); the table now lists all brand-absent editorial URLs, but the
  subtitle still says "citations on the rise" (`pr-influence-tables.tsx:250`), which implies
  positive-delta-only. Tina's original ask was "only positive delta."
- **Fix (default, honors Tina's original written spec):** re-introduce a CORRECT positive-delta
  gate: after computing `deltaOf(c) = shareOf(c) - priorShareByUrlKey`, include only rows with
  `deltaOf(c) > 0`, keeping the URL-level brand-absent + editorial + model-match predicates. The
  "on the rise" subtitle then matches the content.
- **Test:** unit-test the filter (non-positive and zero deltas excluded; positive included) +
  live-verify.

---

## Workstream 3: PR #138 sentiment code-review fixes

All verified STILL-PRESENT. P1/P3/P5 are defensively correct regardless of live trigger, so
they are implemented without needing a live Profound call (the fix is safe either way).

### P1 Model-filtered source accordions may go empty
- **Wrong:** `accumulateThemeSources` compares raw `a.model` against display names
  (`sentiment-normalize.ts:177-179`); raw ids would never match.
- **Fix:** run `a.model` through the existing `normalizeModel` (`client.ts:155`) to the display
  name before the `selected.has()` check.
- **Test:** unit-test with raw-id answer rows under a model filter.

### P2 Wrong theme expands after filter change
- **Wrong:** accordion open-state is `Set<number>` of positional indices
  (`sentiment-insights.tsx:122,142`); indices point at different themes after the list changes.
- **Fix:** key open-state by theme title (string), or reset the set when the `themes` prop
  identity changes.
- **Test:** component-level reasoning; live-verify open theme survives a filter change correctly.

### P3 Sources can truncate to page 1
- **Wrong:** pagination breaks on a short page (`sentiment.ts:124`), not an empty one.
- **Fix:** terminate the loop when a page returns zero rows, not on `< requested`.
- **Test:** unit-test the pagination terminator with a short-but-nonempty page followed by more.

### P4 Themes drop as 0/0 ties
- **Wrong:** `collapseModelThemeRows` returns `resp.info` unchanged
  (`sentiment-normalize.ts:134-141`), so `readMetric` cannot resolve metrics when
  `info.query.metrics` is absent, dropping every theme as a tie.
- **Fix:** return `{ info: { query: { metrics: metricNames } }, data }`.
- **Test:** unit-test a `[model,theme]` response with `info: {}` yields non-empty themes.

### P5 Duplicate-theme double-count
- **Wrong:** theme labels not deduped per answer (`sentiment-normalize.ts:187-196`); two casings
  double-count a URL's citations.
- **Fix:** dedupe the answer's theme keys (case-folded) before the attribution loop.
- **Test:** unit-test an answer tagged `['Pricing','pricing']` counts each cited URL once.

### P6 Hardcoded `'avenue-z'` gate
- **Wrong:** sentiment card gated on `clientSlug === 'avenue-z'` (`pr-influence.tsx:434`),
  violates the no-hardcoded-slug rule.
- **Fix:** gate on DB config: render the card when the client row has a `profoundCategoryId`
  (mirrors `client.ts:398`). Thread `clientSlug` down to make the check.
- **Test:** unit/reasoning; live-verify Avenue Z still shows, a non-configured client does not.

### P7 Cross-client cache collision
- **Wrong:** `clientSlug` not threaded; brand/category from env; sentiment cache key has no
  client dimension (`sentiment.ts:207-211`, `sentiment-insights-section.tsx:37-46`).
- **Fix:** thread `clientSlug` into `SentimentInsightsSection` and `getProfoundSentiment`,
  resolve brand/category from the client row, and add `client` to the cache `extractTags`.
  Pairs with P6 (same plumbing).
- **Test:** unit-test the cache key includes the client dimension.

### P8 Duplicated `modelKeyOf`
- **Wrong:** `modelKeyOf` defined locally in `sentiment.ts:76`.
- **Fix:** extract one shared helper in `lib/peec/models.ts` and import it in both places.
- **Test:** existing sentiment tests stay green; add a small helper test.

### P9 Inert `revalidate`
- **Wrong:** `next: { revalidate: 3600 }` on the large answers fetch never caches
  (`client.ts:35`); payload exceeds the 2MB data-cache limit.
- **Fix:** drop the `revalidate` (or scope it away from the answers path) and rely on the outer
  `cached()`; leave a one-line comment on why.
- **Test:** no behavior change; reasoning only.

### P10 Dead comparison path + false comment
- **Wrong:** caller passes `compareRange=null`, UI never renders the delta
  (`sentiment-insights-section.tsx:46`), but the `sentiment.ts:8-11` header comment claims
  comparison-reactivity.
- **Fix (default):** remove the dead prior-period branch and correct the comment (simplest,
  matches the current pill-only card). If Thomas later wants a period-over-period pill, wire the
  delta instead.
- **Test:** existing sentiment tests stay green.

---

## Testing

- Pure logic (buildCitationDateIndex, coverage model-aggregation, speed-stat formatter, scatter
  window resolver, PR-2 delta filter, P1/P3/P4/P5 sentiment-normalize changes, cache-key) gets
  unit tests. Same style as the existing `matchback.test.ts` / `sentiment.test.ts`.
- Full gates per task: `tsc`, `npm run check:rsc`, focused `vitest`.
- Live QA on the preview after merge-readiness: each fixed surface exercised on real Avenue Z
  data (date change, model change, containment on a non-Avenue-Z client).

## Out of scope

- No AI/Glean, no synopsis changes. No new client onboarding. CI-2 true-hours (optional add-on).
- CI-4 is documentation-only.

## Process

superpowers plan -> subagent-driven-development (implementer + reviewer per task, tests along
the way) -> the Stage-1 review-record doc PR off dev -> Thomas + Paul review -> merge. Per
`CLAUDE.md` "Branch Flow & Promotion Pipeline".
