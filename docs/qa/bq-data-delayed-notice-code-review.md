# Google Ads "Data Delayed" Notice (C3): Code Review Record

**Scope.** PR #461, branch `feat/bq-data-delayed-notice`. Feature diff `193198b9..088d9177`
(`git diff origin/dev...088d9177`): one commit, 25 files, +563 / -28, under `lib/bq/`,
`lib/paid-search/base.ts`, `lib/paid-media/{overview,trend}.ts`, the Paid Search and Paid Media
Overview sections, a new `DataDelayedNotice`, their tests, `scripts/bq-shadow-compare.ts`,
`.env.example`, and five screenshots under `docs/qa/bq-data-delayed-notice/`. No unrelated code.

**This document changes no code.** The fixes an independent review pass found were made on the
feature branch before its commit. What is left is in §5.

Context: tracker item C3. The Supermetrics licence ends on 2027-01-20. After that, #459's live
fallback has nothing to fall back to, so the dashboard has to say when BigQuery is behind
instead. C5 (removing the Supermetrics code) depends on this.

---

## 1. How it works

### 1.1 Still one switch

Nothing changes unless `bqEnabled('googleads', slug)` is true (`lib/bq/backend.ts:11`, from #459):
`DATA_BACKEND_GOOGLEADS` is exactly `bq` and the slug is in `BQ_CLIENTS`. With it off, the range
passes through untouched and no BigQuery call is made. The outer test "switched off, the page is
unchanged" pins this. Meta has no BigQuery path, and LinkedIn keeps #459's live fallback behind
`DATA_BACKEND_LINKEDIN`.

### 1.2 Where the shown range comes from

`googleAdsWindow(slug, dateRange)` (`lib/bq/googleads-window.ts:32`) runs once per page, before
any fetch.

- **The newest day.** It reads `martFreshThrough(mart_googleads_campaign_performance)`, the newest
  `event_date` (cached an hour, from #459), and requires it to be `YYYY-MM-DD`.
- **The clip.** Start = max(range start, `AW_HISTORY_FROM` = 2026-04-01). End = min(range end,
  newest day) (`:61-62`). An untouched range keeps its own preset string, so caches and the hero's
  day/week bucketing are unchanged. A clipped one becomes `custom:start,end` (`:70`).
- **The prior period follows the clip.** The page passes the clipped string to every fetcher, so
  `previous_period` is derived from what is shown. This Month on 2026-11-17 compares Nov 1–16
  with Oct 16–31, not with Oct 15–31.
- **Nothing left.** If start > end, `dateRange` is null and the page fetches nothing.

### 1.3 What the reader sees

`adsNoticeText` (`components/report-sections/paid-media/data-delayed-notice.tsx`):

| Window | Text |
|---|---|
| End moved (range ends today, or the mart is stale) | "Data delayed — showing through Nov 16, 2026." (on the Overview: "Paid Search data delayed — …") |
| Start moved | "Paid Search history starts Apr 1, 2026, so this range is shown from then." |
| Nothing left | "… so this range has no data yet." / "… so this range has no data." |
| BigQuery failed | "Data delayed — Paid Search data can't be loaded right now. Try again shortly." |

The notice is a `role="note"` paragraph in brand yellow on the surface colour, and it prints in
the PDF (`data-export-block`), because the export's cover shows the requested range. On the Paid
Search page a clipped range whose reads fail shows both notices (`paid-search/index.tsx:67-68`).

### 1.4 Never live

`awQuery` (`lib/paid-search/base.ts:23`) with the switch on now logs and **rethrows** any
`readAwMart` miss instead of calling `smQuery`, and refuses Supermetrics `filters`/`settings`
(no caller passes them). Each Paid Search part is wrapped in `safe()`, so a miss becomes that
part's "Couldn't load this section." card. `readAwMart` still refuses a range before the floor.
That refusal is now reached only by a **prior period** (YTD's, or any Previous Year), and
`getPaidSearchKpis` already turns a failed compare into "no delta" (`lib/paid-search/kpis.ts:58-59`).
So a prior period that starts before the floor is dropped, never compared partially.

On the Overview, `getPaidMediaOverview` and `getPaidMediaTrend` take a `paidSearchRange` (default:
the page range). The section passes the window's range. Null means Paid Search is not fetched and
counts as a channel that did not report, which blanks the blend under the existing missing-channel
rule.

### 1.5 Logging

Every miss is still one `bq_fallback` JSON line, now with `served: 'live' | 'none'`
(`lib/bq/backend.ts:25`). The event name is unchanged so #459's acceptance count
(`source=googleads AND reason=error`) keeps working. New: a mart behind yesterday after 10:00 UTC,
or two days behind at any hour, logs `reason=stale` (`googleads-window.ts:57`). This matters
because dbt freshness alerts wait for X1 (A2 alerts on failed pull jobs only). A malformed
`custom:` range from the URL logs `unsupported`, not `error`.

---

## 2. Verification method

**Gates, local, at the feature commit** (CI's placeholder
`DATABASE_URL=postgresql://ci:ci@db.invalid/ci`):

- `make check`: typecheck clean; `vitest run` **388 files, 4,754 tests passed**; `check:rsc` passed.
- `next build` compiled and generated all 16 pages, then stopped on Next's own advisory check
  (`SecurityFatalError`: Next 16.4.1 flags a published vulnerability in itself; the same on `dev`,
  nothing to do with this branch). Rerun alone, it exits 0. The upgrade is a separate question
  for Paul.

**The acceptance tests**, "stale → notice, failure → notice, never live":
`components/report-sections/paid-search/index.bq.test.tsx` renders the real page through every
fetcher, `awQuery` and `readAwMart`. Only BigQuery's `bqRows` and Supermetrics' `smQuery` are
doubles. Every BigQuery case asserts `smQuery` was never called, which fails with #459's fallback
restored. The cases: This Month through yesterday, stale marts, Year to Date (no read before the
floor), BigQuery down, reads failing after a good probe (alone, and on a clipped range), and This
Week on a Monday. Unit tests pin the window arithmetic and logging (`lib/bq/googleads-window.test.ts`),
`awQuery`'s rethrow (`lib/paid-search/base.bq.test.ts`), the date-format refusal
(`lib/bq/googleads.read.test.ts`), the copy, and the Overview wiring.

**In the browser.** A local dev server ran with the switch on for Renaissance, reading prod
`marts` as `dashboard-reader@` (read-only). Checked: This Month, Year to Date, Last Year, the
Overview, and BigQuery down (dev server pointed at a missing dataset with the cache off; it logged
`reason=error, served=none` and called no Supermetrics). Screenshots are on the PR. The healthy
pages logged no `bq_fallback` line.

**`bq-shadow-compare`** against prod `marts` and live Supermetrics, read-only:
`SHADOW DIFFERS: 12904 compared, 48 MISMATCH, 11 TIE, 8 ORDER, 0 NOT RUN`. The classes are the
ones #459's record lists (leads still settling under the 35-day refresh, Q2 geo, LinkedIn cents).
Q2 is now compared without its Q1 prior period.

**Independent review pass**, given the diff without these conclusions. It found no remaining path
from either page to Supermetrics with the switch on (`git grep`: no other `awQuery` or
`getPaidSearchKpis` caller outside the shadow script). Its findings are §3.

**Read, not triggered:** a hung BigQuery job (Finding 7), and a nightly reload that moves
`max(event_date)` backwards (Finding 9).

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE
(code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `lib/bq/googleads-window.ts:42`, `lib/bq/googleads.ts:92` | An unpadded `custom:2026-1-1,…` sorts after `2026-04-01` as text, so it passed both floor checks and would have served pre-floor history with no notice. **Fixed on the branch**: both require `YYYY-MM-DD`, with tests. |
| 2 | ● | CONFIRMED | `lib/bq/googleads-window.ts:38` | `custom:` with no comma threw in `resolveDateRange` outside `safe()`, taking down the whole section (on the Overview, Meta and LinkedIn too). **Fixed on the branch**: caught, logged `unsupported`, notice shown. |
| 3 | ● | CONFIRMED | `scripts/bq-shadow-compare.ts` | With no fallback, the script failed every run on Q2's prior period, and crashed (exit 2) on a current-range miss before the nightly. **Fixed on the branch**: a miss reads NOT RUN, and a range starting on the floor is compared without a prior period. The live run above completed. |
| 4 | ○ | CONFIRMED | `paid-search/index.tsx:67`, `paid-media/overview/index.tsx:44` | The failure notice replaced the clip notice, so a reader lost "showing through {date}" when one part failed. **Fixed on the branch**: both show; test. |
| 5 | ○ | CONFIRMED | `lib/bq/googleads-window.ts:57` | The first draft logged a missed nightly only once the mart was two days behind, about 16 hours after the run failed. **Fixed on the branch**: from 10:00 UTC the same morning; tests at 09:30 and 12:00 UTC. |
| 6 | ○ | CONFIRMED | `lib/bq/googleads-window.test.ts:8` | The tests' comment claimed Europe was covered. Under `TZ=Europe/Berlin`, 8 tests fail: `toISO` gives the day before east of UTC (the open CLAUDE.md follow-up). **Comment corrected**; production runs UTC. |
| 7 | ○ | PLAUSIBLE | `paid-media/overview/index.tsx:32` | The freshness probe runs before Meta and LinkedIn start. Normally about a second (cached an hour); on a cold cache with BigQuery hanging, up to the 20 s job cap (#459 Finding 6). |
| 8 | ● | CONFIRMED | `lib/paid-media/overview.ts:125` | When the Paid Search window is empty (This Week on a Monday; the 1st before the nightly), Paid Search counts as not reporting and blended Spend/Clicks show "—". This follows the existing missing-channel rule. **Decide together.** |
| 9 | ○ | PLAUSIBLE | `lib/bq/freshness.ts:11` | The newest day is read twice per render (the window, then `assertCovers`). If a reload moved it backwards between the two, the parts fail into the notice. Never live, never wrong. |

---

## 4. Detail

### Findings 1 and 2: dates from the URL

**Mechanism.** `resolveDateRange` hands `custom:` dates back as typed. Both floor checks and the
clip compare strings, which only orders zero-padded ISO dates correctly. `'2026-1-1' > '2026-04-01'`,
so the floor did not move, and BigQuery's `date('2026-1-1')` accepts the value, reading the
pre-backfill history `AW_HISTORY_FROM` exists to avoid. A range with no comma makes `e.trim()`
throw a `TypeError`, outside any per-part `safe()`.

**Fix (on the branch).** `ISO_DATE` is required on the range in `googleAdsWindow` and on every
`readAwMart` call (so a URL `custom:` compare range is covered too). A parse failure is caught and
classified `unsupported`, so it never counts toward the `reason=error` acceptance number. The
picker never produces either string; this is about hand-edited or old links.

### Finding 3: the shadow script

**Mechanism.** `both()` relied on the fallback: a BigQuery miss used to return live rows, which
the script then reported as NOT RUN. Now the miss throws out of `fn()`. Separately, Q2's
`previous_period` is Q1, which BigQuery now refuses, so `compareValue` differed on every run.

**Fix (on the branch).** The BigQuery leg's throw is caught and reported as NOT RUN. The KPI check
passes no comparison for a range starting on `AW_HISTORY_FROM`. October's prior-period lines (the
ones A6 tracks) are unaffected.

### Finding 8: the Overview blend on an empty Paid Search window

**Mechanism.** `getPaidMediaOverview` treats a configured channel with no value as failed and
withholds the blend (the 2026-08 missing-channel rule). With no live fallback, Paid Search has no
value for a window with nothing in the marts yet. The notice says why.

**Options.** Keep it (current), or exclude Paid Search from the blend when its window is empty,
with the notice saying it is left out. That is a client-visible rule change to the blend, so it is
Paul's and Thomas's call. A related one: on This Month, Paid Search runs through yesterday while
Meta and LinkedIn include today in the same blended total. Each channel's own delta is consistent.

### Finding 7: the probe on the Overview's critical path

**Suggested fix.** Start the Meta and LinkedIn fetches before awaiting the window, or address
#459 Finding 6 (lower the job cap, or skip BigQuery for an hour after an `error`). Separate PR,
after real latency numbers.

---

## 5. Follow-ups

**Decide together (does not block the merge):**
- Finding 8: the blend on an empty Paid Search window, and the mixed windows in one total.
- The history-floor rule (PR #461 body): clip the start, show nothing for a range wholly before it,
  and drop any prior period that starts before it. Until the warehouse holds Google Ads history
  before 2026-04-01, Last Year and every Previous Year comparison on Paid Search are empty.

**Before the flip:** unchanged from #459 (X1 first, then one more shadow run).

**Later, separate PRs:**
- LinkedIn: the same treatment when it moves to BigQuery (needs Reach and Geography in the marts;
  waits on E2/A14).
- Meta: its own read path (C2).
- The configurable dashboard's Supermetrics adapter still calls `smQuery` for Google Ads (C5).
- Finding 7 (latency), with #459 Finding 6.

**Closed on the branch:** Findings 1–6.
