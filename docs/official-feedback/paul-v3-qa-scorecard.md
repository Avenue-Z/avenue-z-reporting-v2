# Paul V3 QA Scorecard

Every issue Paul surfaced across his two QA rounds, on one branch: 9 from his
live-tab QA (the two feedback CSVs, "column H") and 10 from his sentiment code
review (PR #138), plus the FB-068 citation-date feature (Paul's PR-3 question).
19 items total.

- **Branch:** `feature/paul-v3-qa-fixes`
- **PR:** #144 into `dev`
- **Gates:** `tsc` clean, `npm run check:rsc` clean, `vitest` 217 passing (29 files), passes with `DATABASE_URL` unset (CI-safe).
- **Review:** each item passed an independent spec + quality review; the whole-branch review returned "ready to merge, 0 Critical" (1 Important + 3 Minor, all fixed).
- **Design + plan:** `docs/superpowers/specs/2026-07-09-paul-v3-qa-fixes-combined-design.md`, `docs/superpowers/plans/2026-07-09-paul-v3-qa-fixes.md`. Full per-item feedback entries in `docs/official-feedback/feedback-log.md`.

## Column H (Paul live-tab QA)

| # | Initial problem (what he saw) | What the issue was (root cause) | How it was fixed | Commit |
|---|---|---|---|---|
| CI-1 | Prompt Coverage KPI stuck at 58%, never moved | Value fetched with no date args (locked to last 30 days) and no model dimension, so only the delta pill moved | Coverage fetch dimensioned by `prompt_id` + `model_id`, called with the selected range; value via a model-aware helper, so it reacts to date and model. Delta stays apples-to-apples (prior is model-aware too) | `8451e91` |
| CI-2 | Speed Stats "fastest" read "0 days", looked broken | Whole-day value floored at 0; the GA4 source is day-bucketed, so sub-day collapses to 0 | Formatter renders 0 as "Same day" ("1 day" vs "n days") | `c1b2cfa` |
| CI-3a | Scatter top-left quadrant label unreadable | Low-contrast 10px muted text overlapping the Y-axis title and dense points | Higher-contrast label with a background chip, top-left offset to clear the axis title | `faeaa83` |
| CI-3b | Scatter hover URL not clickable | URL was plain text in a non-interactive tooltip, and the chart had no host to build a link | Clicking a point opens `https://<ownedDomain><path>` in a new tab (no-op if the client has no owned domain) | `7d67846` |
| CI-3c | Scatter ignored the date picker | Both axes hard-locked to the last 30 days | Human axis follows the picker when the selected range is within the last 30 days, else keeps the 30-day window (Peec bot-data retention) | `9ff6936` |
| CI-4 | Competitor Citation Share showed 29.8% while a note claimed a 18.2% cap | The note was wrong, not the code. The share-of-period math has no cap | Corrected the note. 29.8% is legitimate. No code change | `82adfbf` |
| PR-1 | Sentiment pill percentage did not visibly match the themes listed | The pill is over all classified sentiment; the theme columns are a top-8 dominant-polarity subset, so they cannot be summed to the pill | Added a tooltip: the pill reflects all classified sentiment for the selected models and period, not only the shown subset. No math change | `c704ec4` |
| PR-2 | Top Editorial Opportunities showed rows with a non-positive citation-share change | The positive-delta filter had been intentionally removed, but the "on the rise" subtitle still implied only-rising | Re-added a positive-delta filter so only rising rows show, matching the subtitle and Tina's original ask | `c704ec4` |
| PR-3 | Matchback showed only publish date. "Should it have both the publish date and the citation date?" | `MatchbackRow` carried no citation date; citations were used only as a yes/no membership check | FB-068: a bounded Peec date fetch plus pure aggregation add First cited and Most recent columns, bounded to the selected timeframe and matching the model filter. Publish Date stays | `5932996..a0bd059` |

## PR #138 (Paul sentiment code review)

All 10 findings were re-verified as still present in the code, then fixed.

| # | Initial problem | What the issue was (root cause) | How it was fixed | Commit |
|---|---|---|---|---|
| P1 | Model-filtered theme source list could go empty | Raw answer model ids (for example `openai`) were compared against display names (`ChatGPT`) and never matched | Normalize the answer model id to the display name before the filter check | `63f0509` |
| P2 | Wrong theme showed expanded after a filter change | Accordion open-state was keyed by positional index | Key it by theme title | `9655657` |
| P3 | Sources could be truncated | Pagination stopped on a short page instead of an empty one | Stop on a zero-row page, keep the max-page cap | `69bec2a`, `8197f41` |
| P4 | Themes could all vanish | The missing-metrics fallback returned the original info, so every theme dropped as a 0/0 tie | Rebuild `info.query.metrics` on both the read and return paths | `77628ff` |
| P5 | A source could be double-counted | Duplicate-casing theme labels in one answer counted twice | Dedupe per-answer theme keys before attribution | `e20d198` |
| P6 | Sentiment card hardwired to one client | Gated on `clientSlug === 'avenue-z'` (hardcoded slug) | Gate on DB `profoundCategoryId` | `56b520e` |
| P7 | A second Profound client could see the wrong client's sentiment | The cache key had no client dimension; brand and category came from env only | Thread `clientSlug` into the cache key; resolve brand and category DB-first | `56b520e` |
| P8 | Duplicated helper risking drift | `modelKeyOf` was defined locally in `sentiment.ts` | Moved to `lib/peec/models.ts`, shared (byte-identical) | `4dc6ecd` |
| P9 | Misleading cache config | `revalidate: 3600` on the roughly 40MB answers fetch never caches (2MB limit) | Disable revalidate only on the answers path, keep it on the small calls | `4dc6ecd` |
| P10 | Dead code plus a misleading comment | The prior-period delta path was never wired, but the comment claimed reactivity | Removed the dead branch, corrected the comment | `4dc6ecd` |

## Reconciliation

- Column H: 9 of 9 accounted for (every blank-column-H row was a Paul-accepted V2 item with nothing to action).
- PR #138: 10 of 10 accounted for.
- Data-only. No AI/Glean added. No DB migration, no new secret. FB-068 uses the same Peec key and endpoint already in production.
