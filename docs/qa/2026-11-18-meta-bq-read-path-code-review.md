# Meta BigQuery Read Path (C2): Code Review Record

**Scope.** PR #466, branch `feat/meta-bq-read-path`. Feature diff `551e8969..9f5ce687`
(`git diff origin/dev...9f5ce687`): four commits, `dd3950c9` (the reader), `845fa088` (the seam,
the window, `—` for reach), `415996b5` (the pages, the Overview, the shadow script) and
`9f5ce687` (three fixes from this review). Files are under `lib/bq/`, `lib/meta/`,
`lib/paid-media/{overview,trend}.ts`, the Meta page, the Paid Media Overview, the
`DataDelayedNotice`, their tests, `scripts/bq-shadow-compare.ts`, `.env.example`,
`vitest.config.ts`, and the plan `docs/superpowers/plans/2026-11-18-meta-bq-read-path.md`.
No unrelated code. It touches neither `lib/bq/googleads.ts` nor `lib/bq/googleads-window.ts`,
which #465 (C3a) edits; the shared range clipping is copied into `lib/bq/meta-window.ts`, not changed.

**This document changes no code.** The fixes the review found were made on the feature branch
before this record. What is left is in §5.

Context: tracker item C2. Supermetrics' Meta loads stopped on 2026-10-08 and the licence ends on
2027-01-20. This is the dashboard side of moving Renaissance's Meta reporting onto the connector's
marts (data-warehouse A11 #203, #197, #200). **Off by default**: nothing changes until
`DATA_BACKEND_META=bq` is set and the slug is in `BQ_CLIENTS`. Production comes through
`staging → main` (H14), then Paul sets the flag after the warehouse's Meta switch (X2).

---

## 1. How it works

### 1.1 The switch

`bqEnabled('meta', slug)` (`lib/bq/backend.ts:12`) is true only when `DATA_BACKEND_META` is
exactly `bq` and the slug is in `BQ_CLIENTS`. Its own flag: Google Ads and LinkedIn are unaffected.

### 1.2 The seam

Every Meta number the report pages show goes through `metaQuery` (`lib/meta/base.ts`). It has four
callers, the A11 design's Q1 to Q4:

| # | Caller | Asks for |
|---|---|---|
| Q1 | KPI grid (`lib/meta/kpis.ts`), also Meta's line in the Paid Media Overview | account totals, main and prior period |
| Q2 | Creative table (`lib/meta/creative.ts`), top 200 | per ad name, ad set, campaign and status |
| Q3 | Geo (`lib/meta/geo.ts`), top 500 | per region, main and prior period |
| Q4 | Paid Media trend (`lib/paid-media/trend.ts`) | per day, cost and link clicks |

With the switch on, `metaQuery` (`base.ts:21`) calls `readMetaMarts` and never `smQuery`. A miss
is logged and **rethrown** (`:26`), so the part shows its error card. Supermetrics `filters` and
`settings` are refused (no caller passes them). The configurable dashboard's Supermetrics adapter
still offers Meta live; it is not a report page (C5).

### 1.3 Where a number comes from

`readMetaMarts` (`lib/bq/meta.ts:135`) reads `avenue-z-data-warehouse-prod.marts`:

- **Which mart.** Region → `mart_fbads_geo_performance` (region × day). Everything else →
  `mart_fbads_creative_performance` (ad × day, current names and status, action counts from the
  unbroken `meta_api_ad_daily`). `planMetaQuery` (`:56`) refuses any other field or combination
  before a BigQuery call.
- **Sums**, grouped by the dimensions asked for, filtered to the account and the dates.
- **Rates from the sums** (`buildMetaSql`, `:78`), each `round(…, 4)`, null on a zero denominator,
  exactly what the golden compare proved: `CTR = clicks / impressions` and `CPC = cost / clicks`
  (**all** clicks, as Supermetrics computes them, not link clicks), `CPM = cost / impressions × 1000`,
  `cost per LPV = cost / landing page views`. The page then formats them as before.
- **Rows dropped** only when all six sums are 0 (`:96`), which reproduces Supermetrics' row sets.
- **Top N**: `order by sum(t.cost) desc limit N` (`:97`).
- **Account id.** The client row stores `act_1480350426850960`; the marts store `1480350426850960`.
  `metaAccount` (`:22`) strips the prefix. Without it every read returns zero rows, served as zeros.
- **Which accounts.** Only one whose mart history is verified is served
  (`META_HISTORY_FROM_BY_ACCOUNT`, `:19`): Renaissance from 2024-01-01, because live Supermetrics
  has no Renaissance Meta rows from 2024-01-01 to 2026-04-30 (checked 2026-11-18) and the connector
  holds every day from 2026-05-01. Any other account is refused, never shown as zeros.
- **Cache.** One hour per (account, fields, range, max rows), `bigquery/readMetaMarts` (`:128`).

### 1.4 Reach and frequency

Reach does not add up over days, so it comes only from the two reach marts, which hold Meta's own
reach for each preset range as of the latest pull: `mart_fbads_reach_by_range` (account) and
`mart_fbads_ad_reach_by_range` (per ad, #197). A window gets reach only when a row's `start_date`
and `end_date` equal it exactly (presets sharing dates are equal; one is taken, never summed).

- **Matched**: the KPI grid and each ad row show Meta's reach and frequency. A matched row with
  null reach (no delivery) reads 0, as live does.
- **Not matched** (a custom range; any prior period; a range clipped to a day the reach pull does
  not end on): Reach and Frequency show **"—"** with the tooltip "Reach and frequency are shown for
  the preset date ranges only.", never a made-up 0. In the creative table a row grouping more than
  one ad id also shows "—", and so do its ad set, campaign and total.
- **How the transforms know.** A BigQuery row without reach lacks the `reach` key
  (`lib/meta/kpis.ts:28`, `lib/meta/creative.ts:10`). Live rows always carry it (`parseSmRows`
  builds every row from the requested header), so the live page is unchanged.
- **Ranges ending today.** C3's clipping ends This Month, This Quarter and This Year on yesterday,
  which is exactly the reach snapshot's end date, so they get reach from the marts. The A11
  hand-over had left those to C4; with the clip it is free.

### 1.5 The window and the notice (C3's rules)

`metaWindow` (`lib/bq/meta-window.ts:23`) runs once per page, before any fetch, on the Meta page
and the Overview (in parallel with Google Ads', `overview/index.tsx:33`):

- **Newest day** = the older of the creative and geo marts' `max(event_date)` (`:43`). Two
  connector jobs feed them; taking the older ends every part of the page on the same day.
- **Clip**: start = max(range start, the account's floor), end = min(range end, newest day). An
  untouched range keeps its string; a clipped one becomes `custom:start,end`, so the prior period
  follows what is shown. Nothing left → no fetch.
- **Notice** (`DataDelayedNotice`, now with `source`): "Data delayed — showing through Nov 16,
  2026."; on the Overview "Meta data delayed — …"; on failure "Data delayed — Meta data can't be
  loaded right now. Try again shortly." Paid Search's strings are byte-identical.
- **Unavailable**: a malformed `custom:` range, an unverified account, an unreadable newest day,
  or any BigQuery or database error → no range, the failure notice, a `bq_fallback` log line.
- **A client that does not run Meta** is left alone and logs nothing (the Overview asks for every client).
- **Logging**: one `{"event":"bq_fallback","source":"meta",…,"served":"none"}` line per miss,
  `reason` = `unsupported` / `stale` / `error`. `stale` is also logged when the marts are behind
  yesterday from 10:00 UTC, or two days behind at any hour (`:59`).

### 1.6 The Overview

`getPaidMediaOverview` and `getPaidMediaTrend` take a `metaRange` (default: the page range). Null
means Meta is not fetched and counts as a channel that did not report, which blanks the blend under
the existing missing-channel rule, exactly as C3 did for Paid Search.

### 1.7 What the marts hold today

**Prod `marts` does not have these four tables yet** (it has only the legacy
`mart_fbads_ad_performance` and `mart_fbads_campaign_performance`). They are built by the next
data-warehouse runner deploy from `dev`. They read the connector's raw tables only (no
`connector_switch`), so they never hold Supermetrics' stored copy. The dev build (`dbt_dev_marts`)
holds creative through 2026-11-15, geo through 11-10, the account reach snapshot of 11-11 and the
ad reach snapshot of 11-16, because the connector's nightly (H11) is not deployed yet.

---

## 2. Verification method

**Gates, local, at the feature head** (CI's placeholder `DATABASE_URL=postgresql://ci:ci@db.invalid/ci`):
- typecheck clean; `check:rsc` passed.
- `vitest run`: **393 files, 4,850 tests passed** at `415996b5`. At `9f5ce687` (229 tests across the 25 Meta, BigQuery and Paid Media files pass), a full run had 5 timing failures in 3 files this branch does not touch (`export-pdf-button.bulk`, `aeo-outbound/editor`, `charts/line-chart`); run alone they pass, 169/169.
- `next build` was not run locally: Turbopack refuses this worktree's symlinked `node_modules`. CI's `make check` builds it on the PR.

**The acceptance test**, "stale → notice, failure → notice, never live":
`components/report-sections/meta-ads/index.bq.test.tsx` renders the real Meta page through every
fetcher, `metaQuery`, `readMetaMarts` and `metaWindow`; only BigQuery's `bqRows` and Supermetrics'
`smQuery` are doubles. Every BigQuery case asserts `smQuery` was never called and every read's
`@account` is `1480350426850960`. Cases: This Month through yesterday, stale marts, BigQuery down,
reads failing after a good probe (alone and on a clipped range), This Week on a Monday, switched off.
Unit tests pin the SQL, the reach merge, the refusals, the window and its logging, `—` for
unavailable reach, and the live rows rendering as before.

**SQL against the dev marts, read-only, with the `bq` CLI as Paul** (the dashboard reader cannot
read `dbt_dev_marts`, and running the reader with Paul's credentials was declined). The SQL that
`buildMetaSql` generates was run against `dbt_dev_marts` and compared field by field with live
Supermetrics (`metaQuery`, switched off) for the dashboard's exact Q1 to Q4 requests, Renaissance,
2026-11-18, over 8 fixed windows (October; 11-09..11-15; 10-17..11-15; 10-12..11-10; Q3; Q2;
01-01..11-10; 08-31..09-30). Reach was merged by the same rule as the reader.

`5,030 fields compared, 455 differences, 0 unexplained`:

| Class | Count | What |
|---|---:|---|
| Reach unavailable | 422 | Reach/frequency on a window no snapshot row equals: the account snapshot is 11-11's and the ad snapshot 11-16's, so e.g. 10-17..11-15 has ad reach but no account reach, and Q2, 08-31..09-30 and 01-01..11-10 (ads) have none. Shown as "—" by design (§1.4). |
| Regional spend (G5) | 25 | Within $0.04 (Texas, Jan 1–Nov 10: 6,980.9972 live, 6,980.9570 marts). Accepted gap. |
| `Unknown` region (G5) | 2 | $0.10 vs $0.09 (Jan 1–Nov 10) and $0.01 vs $0.00 (Q2). Accepted gap. |
| Rate rounding ties | 6 | CPC or cost/LPV one step lower at the 4th decimal (e.g. 0.3313 vs 0.3312); identical at the cents the page shows. The golden note's *Also seen*. |

Equal everywhere: every key set (ad, ad set, campaign and status labels; 52 regions; 191 days),
cost to the cent, impressions, link clicks, landing page views, post engagement, CTR and CPM;
reach and frequency on every window a snapshot equals (Q1: October, Q3, 10-12..11-10,
01-01..11-10; per ad: October, Q3, 10-17..11-15, 11-09..11-15). This matches A11's golden note and
its 2026-11-16 addendum: Q1, Q2 and Q4 exact, Q3 within G5. The October values agree with the
golden note's (top ad CTR 0.0152, CPC 0.3313; 56 ads; 52 regions).

**`bq-shadow-compare` for Meta: PENDING the next data-warehouse runner deploy.** It runs the
dashboard's own fetchers (KPIs with the prior period, creative tree, geo, trend) both ways as
`dashboard-reader@` against prod `marts`, which does not hold these tables yet (§1.7). Paul runs,
after the deploy, from a checkout of this branch:

```bash
CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/bq-shadow-compare.ts renaissance meta
```

**Passing** = `0 NOT RUN`, and every `MISMATCH` line in one of these declared classes (the script
exits 1 while any MISMATCH exists, so read the lines, not the exit code):

1. `meta.kpis{key=reach}` / `{key=frequency}` value or `delta`, live a number and BigQuery `"—"`
   or `undefined`: reach for a window no snapshot equals, which includes every prior period (C4).
2. `meta.creative…reach` / `…frequency` the same way, and the ad set, campaign and total rows above
   such an ad.
3. `meta.geo` region spend within a few cents (reported as TIE, not MISMATCH, under $0.10), and an
   `Unknown` region present live and absent (or $0.00) in BigQuery, which also moves
   `totalRegions` / `prevTotalRegions` by one (G5).
4. Before the connector's nightly (H11) runs daily, a range ending after the marts' newest day
   reads NOT RUN (`stale`): rerun with `SHADOW_RANGES` set to windows the marts hold, e.g.
   `SHADOW_RANGES='2026-10-01,2026-10-31;2026-07-01,2026-09-30'`.

Anything else (a count, cost beyond cents, a missing ad or day, a rate beyond 4 dp) fails it. It
also proves `dashboard-reader@` can read the new tables, which A11 left to C2.

**Independent review pass**, given the diff and the candidate risks as questions, not answers. It
found no route from the Meta page or the Overview to Supermetrics with the switch on, and the live
path unchanged when it is off. Its findings are §3.

**Read, not triggered**: a hung BigQuery job (20 s cap, C1 Finding 6), a nightly reload moving the
newest day backwards between the window and the read (C3 Finding 9), and a creative table above 200 rows.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE
(code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `lib/meta/geo.ts:38` | A prior period before the account's floor is refused on BigQuery, and geo awaited it in a bare `Promise.all`, so the whole Geo section failed with a false "can't be loaded" notice (a range of about two years, or a Previous Year comparison of a range starting before 2025). **Fixed on the branch**: the prior period drops the comparison, as the KPIs already do; test. |
| 2 | ● | CONFIRMED | `lib/bq/meta-window.ts:43` | The window clipped to the creative mart's newest day only, while geo checks its own. The dev build shows geo five days behind creative; in prod, geo behind by a day would fail Geo on every render. **Fixed on the branch**: the window takes the older of the two and names it in the `stale` log; test. |
| 3 | ○ | CONFIRMED | `lib/bq/meta-window.ts:37` | The Overview asks for every allowlisted client's Meta window, so a client without Meta logged `unsupported` on every render. **Fixed on the branch**: no Meta config leaves the range alone and logs nothing; test. |
| 4 | ● | CONFIRMED | `lib/meta/kpis.ts:28` | On BigQuery the Reach and Frequency KPIs lose their change arrow: the prior period is never a preset, so it has no reach. Live shows them. Nothing wrong is shown. **Decide together / C4.** |
| 5 | ● | CONFIRMED | `lib/bq/meta.ts:19` | Custom ranges show "—" for Reach and Frequency on BigQuery (KPIs and creative table); live shows numbers. **C4.** |
| 6 | ○ | PLAUSIBLE | `lib/bq/meta.ts:97` | Above 200 ad rows (500 regions) the marts keep the top N by cost; Supermetrics' `max_rows` cut order is not known. Renaissance has at most 86 ad rows in any window. |
| 7 | ○ | CONFIRMED | `lib/paid-media/trend.ts:80` | A failed Meta trend read drops Meta's line from the Overview chart with no notice; the failure notice watches the KPIs only. Paid Search behaves the same since C3. |
| 8 | ○ | PLAUSIBLE | `lib/bq/meta.ts` | A missed reach pull is visible only as "—" on preset ranges; nothing logs it. A2 alerts on failed connector jobs. |
| 9 | ○ | CONFIRMED | `components/report-sections/paid-media/overview/index.tsx` | On This Month, Paid Search and Meta now run through yesterday while LinkedIn includes today, in one blended total (C3 Finding 8's mixed windows, now two channels against one). |

---

## 4. Detail

### Finding 1: a prior period before the floor broke Geo

**Mechanism.** `getMetaGeoData` awaited the main and prior-period queries together. On BigQuery,
`readMetaMarts` refuses a range starting before `metaHistoryFrom` (2024-01-01 for Renaissance), so
`custom:2023-06-01,2026-11-17` (clipped to start 2024-01-01, prior period ending 2023-12-31)
rejected the whole fetch. `getMetaKpis` already caught its prior period.

**Fix (on the branch).** `.catch(() => null)` on the prior period: no comparison, the section
renders. Test `getMetaGeoData prior period` (`lib/meta/geo.compare.test.ts`). Live behaviour on a
failed prior period changes the same way, which matches the KPIs.

### Finding 2: two marts, one window

**Mechanism.** The creative mart is fed by the connector's `meta_api_ad_daily` job and the geo mart
by `meta_api_geo`, separate jobs. Clipping to the creative mart alone let the page ask geo for days
it does not hold, which `assertCovers` refuses (`stale`), on every render.

**Fix (on the branch).** Probe both, clip to the older, log which one is behind. One cost: a geo
job that fails for days holds the whole Meta page back to its day, with the notice saying so. That
is the honest reading of "shown through"; the alternative was a page whose parts end on different days.

### Findings 4 and 5: reach outside the presets

**Mechanism.** The reach marts hold Meta's reach per preset only. A prior period of a preset is not
a preset, and a custom range is not one either.

**Options (C4).** The connector also pulls reach for each preset's prior period (closes 4), and/or
for arbitrary ranges on demand (closes 5); or the dashboard drops the Reach/Frequency deltas on
BigQuery. That is Thomas's call for what Renaissance sees.

---

## 5. Follow-ups

**Blocks the flip, not the merge:**
- Run the Meta shadow compare against prod `marts` after the runner deploy (§2); it also proves the
  reader's access to the new tables.
- X2 and H11 first: until the connector runs nightly, the marts stop at 11-15 (creative) and 11-10
  (geo), so every Meta range would be clipped to those days with the notice.

**Decide together (Paul and Thomas):**
- Findings 4 and 5: Reach and Frequency deltas and custom-range reach on BigQuery, or C4 first.
- Finding 9: the blend mixing windows on ranges ending today (with C3 Finding 8).

**C4:** reach for prior periods and non-preset ranges.

**Later, separate PRs:**
- Unify `metaWindow` and `googleAdsWindow` once #465 lands (the clip is duplicated on purpose here).
- Finding 7: a notice for a failed trend line, for both channels.
- Finding 8: log a reach snapshot older than the marts' newest day.
- C5: the configurable dashboard's Supermetrics adapter (Meta and Google Ads).

**Before a second client:** add its account to `META_HISTORY_FROM_BY_ACCOUNT` only after checking its
history against Supermetrics, then run the shadow compare for it.

**Closed on the branch:** Findings 1, 2, 3.
