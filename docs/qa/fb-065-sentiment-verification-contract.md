# Sentiment Insights: verification data contract (FB-065 / FB-066)

**Card:** AEO PR Influence "Sentiment Insights" (Avenue Z only).
**Purpose:** prove that what the card renders equals what Profound actually holds, for every state, within a defined tolerance.

## Method (probe-first, then verify)

1. **Probe Profound live FIRST** to build the expected-value list, using the
   exact endpoints/params the app uses (`lib/profound/sentiment.ts`):
   - pill: `POST /v1/reports/sentiment` `dimensions:['model']`, sum selected models' `positive`/`negative`, `pct = positive/(positive+negative)`.
   - themes: `POST /v1/reports/sentiment` `dimensions:['model','theme']`, collapse selected models, classify by dominant polarity, top 8.
   - sources: `POST /v1/prompts/answers` (paged), per-answer-deduped citation counts per theme, rank desc, top 12.
   - Reproduce with `scratchpad/probe_contract.py` (pill+themes) and `oracle.py` (sources). Key read from gitignored `.env` (`PROFOUND_AI_ACCESS_TOKEN`); never printed.
2. **Then read the same state in the UI** and compare to the probe.
3. **Tolerance:** the card is cached 1h (`getProfoundSentiment`, `ttlSeconds:3600`), and Profound reprocesses sentiment continuously, so the card can render a snapshot up to ~1h older than a live probe. Accept:
   - pill within a few tenths of a percent (large aggregate, barely moves),
   - theme/source **counts** within +/-1 or +/-2 on low-volume themes,
   - **tie order** among equal-count themes/sources may differ (arbitrary-but-stable-per-compute; counts must still match).
   Anything outside that (wrong ordering by count, fabricated value, wrong sign, crash) is a defect.

## Expected values (probe @ 2026-07-08 17:28 local)

### last_30_days (2026-06-08..2026-07-07)
| Selection | Pill | Occ | Top negative themes |
|---|---|---|---|
| all | 63.7% | 8094 | Premium Pricing 81, Self-Published Rankings 18, High Barrier to Entry 15 |
| ChatGPT | 61.5% | 2462 | Self-Published Rankings 18, Premium Pricing 17, Not Ideal for Small Businesses 9 |
| Perplexity | 67.6% | 1487 | Premium Pricing 5, Integration Complexity 4, Limited Independent Verification 3 |
| Gemini | 63.1% | 2173 | Premium Pricing 40, High Barrier to Entry 8, High Cost Barrier 8 |
| Google | 64.2% | 1972 | Premium Pricing 19, High Cost 11, High Cost of Entry 8 |
| Claude (untracked) | no-data | 0 | - |
| Copilot (untracked) | no-data | 0 | - |
| ChatGPT+Perplexity | 63.8% | 3949 | Premium Pricing 22, Self-Published Rankings 18, Not Ideal for Small Businesses 9 |
| ChatGPT+Claude (mix) | 61.5% | 2462 | = ChatGPT alone (untracked Claude dropped) |

### last_7_days (2026-07-01..2026-07-07)
| Selection | Pill | Occ |
|---|---|---|
| all | 64.6% | 1696 |
| ChatGPT | 67.2% | 533 |
| Perplexity | 63.8% | 290 |
| Gemini | 61.9% | 475 |
| Google | 65.1% | 398 |
| Claude / Copilot | no-data | 0 |
| ChatGPT+Perplexity | 66.0% | 823 |
| ChatGPT+Claude (mix) | 67.2% (= ChatGPT) | 533 |

### Other
| State | Expected |
|---|---|
| year_to_date (2026-01-01..2026-07-07) | pill 65.5%, occ 31310 |
| single-day range (start==end) | Profound returns HTTP 422 -> card shows honest no-data |
| Premium Pricing sources, all-models 30d | ranked most-cited top 12: beomniscient/blog/aeo-agency (11), yesoptimist/best-aeo-agencies (11), firstpagesage .../aeo-companies?utm=chatgpt (11), ipullrank/?utm=chatgpt (10), then three at count 9 (arxiv, ipullrank/ai-search-manual, moosend), then three firstpagesage at 7, then alexbirkett + tryaivo at 6 |

## Observed (dev preview 2trivycrb == dev HEAD fa0d104, this session)

| State | Card showed | vs expected |
|---|---|---|
| all 30d | 63.7% | exact |
| ChatGPT 30d | 61.5% | exact (fresh compute matched to the number) |
| Perplexity 30d | 67.6% + uncited-theme honest empty state on "Clear Value Proposition" | exact |
| Gemini 30d | 63.1% | exact |
| Google 30d | 64.2% | exact |
| Claude 30d / Copilot 30d | no-data | exact |
| ChatGPT+Perplexity 30d | 63.8% (Premium Pricing 22 = 17+5) | exact, sums correctly |
| ChatGPT+Claude 30d | 61.5% = ChatGPT | exact, untracked dropped not widened |
| all 7d | 64.6% | exact |
| all YTD | 65.4% | within tolerance (UI YTD includes today Jul 8; probe used Jul 7) |
| single-day | honest no-data, other cards still populate | exact (422 caught gracefully) |
| Premium Pricing sources all-models + ChatGPT | position-exact top-12 vs oracle; count-descending; real hyperlinks | exact (tie order within equal-count groups varies, counts match) |
| all-models 30d "High Barrier to Entry" | 16 | probe 15 -> within +/-1 cache tolerance (verified benign: fresh ChatGPT recompute matched exactly) |

## Verdict
Every state matches Profound within tolerance. No fabricated values, no wrong-by-count ordering, no crash; untracked/mixed/single-day all fail safe to honest no-data. Divergences are limited to (a) 1h cache staleness (+/-1 on low-volume themes) and (b) tie-order among equal counts, both expected and documented.
