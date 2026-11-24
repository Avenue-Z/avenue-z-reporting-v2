# Reach and Frequency by Range (C4): Code Review Record

**Scope.** PR #513, branch `feat/reach-by-range`. The feature diff is `04a45945^..4af9029b`
(`git diff origin/dev...4af9029b`), four commits:
- `04a45945` the plan, `docs/superpowers/plans/2026-11-24-reach-by-range.md`;
- `1c8fb4f5` the shared reach lookup, `lib/bq/reach.ts`. Its body carries the edge-case table;
- `7d4e17af` Meta: reach moves out of the sums cache; one tile and one page notice per reach state;
- `4af9029b` LinkedIn: reach from `mart_linkedin_reach_by_range`, never live.

That is 23 files under `lib/bq/`, `lib/meta/`, `lib/linkedin/`, `lib/paid-search/types.ts`, the Meta and LinkedIn
pages, `DataDelayedNotice`, their tests and `vitest.config.ts`. No unrelated code.

The data-warehouse dependency is Avenue-Z/data-warehouse#232 (`6ef4981`): a new
`mart_linkedin_reach_by_range` table in `marts`, with no other model changed.

**This document changes no code.** What is left is in §5.

Context: tracker item C4, the last dashboard item for the Dec 18 checkpoint (G2). **Off by default**:
nothing changes until `DATA_BACKEND_META=bq` or `DATA_BACKEND_LINKEDIN=bq` is set and the slug is in
`BQ_CLIENTS`. Production comes through `staging → main` (H14). Paul sets the flags after the warehouse
switches (X2, X3).

---

## 1. How it works

### 1.1 Why reach needs its own tables

Reach counts distinct people, so it cannot be added up over days the way spend can. The connectors therefore pull
each platform's own reach every night for 14 preset ranges:
- last 7, 14, 30, 60 and 90 days;
- this week and last week;
- this month and last month;
- this quarter and last quarter;
- this year, year to date and last year.

Each pull lands as one snapshot. The rolling ranges end the day before the pull (`preset_ranges` in the
data-warehouse's `src/app/connectors/_shared/ranges.py`).

The marts keep the latest snapshot:
- Meta: `mart_fbads_reach_by_range` (account and campaign rows) and `mart_fbads_ad_reach_by_range` (per ad);
- LinkedIn: `mart_linkedin_reach_by_range` (account and campaign rows; data-warehouse#232).

### 1.2 The rule, one for both platforms (`lib/bq/reach.ts`)

| Window on screen | Reach and Frequency | Page notice |
|---|---|---|
| Equals a stored preset's dates, snapshot fresh | the platform's own reach for exactly that window | none |
| Anything else (a custom range, a window a day short) | "—", tooltip "shown for the preset date ranges only" | none |
| Snapshot stale | "—", tooltip "waiting on today's snapshot" | "Data delayed — {Meta/LinkedIn} reach and frequency are waiting on today's snapshot…" |
| BigQuery failed on the reach read | "—", tooltip "can't be loaded right now" | "Data delayed — … can't be loaded right now. Try again shortly." |

- **Matching.** The lookup reads the account row (`CAMPAIGN_ID is null`) whose `start_date` and `end_date` equal
  the window. Presets that share dates (`this_year`, `year_to_date`) carry equal values, so it takes one row
  (`order by range_key limit 1`) and never a sum (`reach.ts:62`). The Meta creative table reads the per-ad mart
  the same way. A creative row takes its ad's reach only when the row groups exactly one ad (`meta.ts:147`).
- **Stale** (`snapshotStale`, `reach.ts:37`) uses the same clock as `metaWindow`. A pull dated yesterday is normal
  until 10:00 UTC (the nightly lands around 08:00) and stale after that. Anything older, or unreadable, is always
  stale. It is checked twice:
  - against the newest `pulled_on` of each of the platform's reach tables (`reachPulledOn`, `:52`). For Meta,
    the older of the account and ad tables counts, so the KPI tiles and the creative table can never disagree on
    freshness;
  - against the matched row's own `pulled_on`, in case a preset's latest pull failed and an older row remains.
- **A matched NULL reach** is served as `''`, the way live Supermetrics returns it. Each platform's transform then
  renders it as live does: LinkedIn shows "—" with its "~90 days" note (its year-long ranges are NULL), and Meta
  reads 0 (NULL means nothing delivered).
- **Never throws, never goes live.** `lookup` (`:74`) turns every miss into a state and logs one `bq_fallback`
  line with `served=none` and `reason=stale|error`. The log's `slug` field carries the account id, because the
  readers know the account, not the slug. A state is never cached: only the row lookup is (`reachRows`, `:67`, one
  hour). So a delayed or failed answer is asked again on the next render.
- **How the state reaches the page.** A BigQuery row that asked for reach either carries the reach keys or carries
  `_reach` = the state and no reach keys. The KPI transforms (`lib/meta/kpis.ts:27`, `lib/linkedin/kpis.ts:33`)
  turn the state into "—" plus the matching tooltip. For `delayed` and `unavailable` they also set
  `Kpi.reachState`, which `reachNotice` (`reach.ts:102`) turns into the page notice
  (`meta-ads/index.tsx:58`, `linkedin-ads/index.tsx:41`).

### 1.3 Comparison periods

The prior window is looked up the same way, with its own dates. It has a value, and Reach and Frequency get an
arrow, only when the prior window is itself a stored preset. The example is This Month (clipped to
Nov 1–23) compared with a custom Oct 1–31, which is `last_month`. In every other case `delta()` reads the missing
prior as 0 and shows no arrow.

The page's default comparison is the previous period: the same length, immediately before. That is almost never a
preset. This Month clipped to Nov 1–23 compares with Oct 9–31, for example. So in practice the arrows appear for
custom comparisons that land on a preset.

### 1.4 Where each platform reads it

- **Meta** (`lib/bq/meta.ts:117`):
  - The sums read is cached as before. Reach is no longer inside that cache (version `v2`).
  - Totals call `accountReach('meta')`, and the creative read calls `adReach` (`:140`).
  - **Changed from C2:** a reach failure used to fail the whole read. Now the sums are served and reach shows "—"
    plus a notice.
  - The page window still comes from `metaWindow`, which clips This Month to the creative mart's newest day.
    That clip is what makes the window equal the snapshot's `this_month` (§2, near-miss test).
- **LinkedIn** (`lib/bq/linkedin.ts:86`):
  - `approximateUniqueImpressions` for totals comes from `accountReach('linkedin')`. Frequency is still impressions
    over reach, with impressions from the sums mart (`lib/linkedin/kpis.ts:14`).
  - **Changed from C1:** reach is no longer fetched live on BigQuery. The live-merge branch in `linkedinQuery` and
    `LI_LIVE_ONLY` are removed, since only `memberRegion` was left and it is routed live before the try
    (`lib/linkedin/base.ts:37`).
  - Reach with a dimension is `unsupported` (`linkedin.ts:88`), so that query takes C1's live fallback as before.
    No caller asks for it today.
  - Unchanged C1 behaviour: LinkedIn has no window clip. A preset ending today (This Week, Month, Quarter or Year)
    fails `assertCovers`, and the whole query, reach included, goes live. So on LinkedIn the reach marts serve the
    presets that end yesterday or earlier.
- **Paid Media Overview** shows no reach. It calls `getMetaKpis` and `getLinkedInKpis` (`lib/paid-media/overview.ts:128`),
  so the lookup runs and is logged there too, but nothing renders from it. Recorded as finding 5.

### 1.5 Shared code instead of C2's Meta-only version

C2's `reachSql` in `lib/bq/meta.ts` is replaced by `lib/bq/reach.ts`. The reasons:
- LinkedIn needed the same lookup.
- C2's version had no staleness check. A Meta window could be served from an older snapshot's row without anyone
  knowing.
- The rule now lives in one place, so a future platform gets it by adding a table name.

---

## 2. Verification method

- **Tests, written first.** Every named test is in the plan. The cases are:
  - `lib/bq/reach.test.ts`: the clock (before and after 10:00 UTC, old, malformed), preset served, NULL as `''`,
    preset-only, stale table, stale row, error (never thrown), and the SQL shape;
  - `lib/meta/kpis.reach.test.ts` runs the real chain `metaWindow → getMetaKpis → metaQuery → readMetaMarts →
    accountReach` with `bqRows` doubled at 2026-11-24 12:00 UTC:
    - **near miss:** This Month clips to `2026-11-01..2026-11-23`, the snapshot's `this_month`, so it is served;
    - a window one day short is preset-only;
    - a custom range shows "—" with no arrow;
    - a preset comparison gets an arrow; a non-preset comparison gets the value alone;
    - a reach failure keeps the sums, shows "—" and the notice, and Supermetrics is never called;
  - the same for LinkedIn in `lib/linkedin/kpis.reach.test.ts`, plus `lib/linkedin/base.bq.test.ts` (reach with a
    dimension goes live as C1 does);
  - the outer tests `components/report-sections/{meta,linkedin}-ads/index.bq.test.tsx`: a stale snapshot, a failed
    read (including the LinkedIn mart not existing yet), and a custom range with no notice.
- **Not every test failed first.** The near-miss, custom-range and comparison tests for Meta also pass on C2's
  reader, because C2 already matched on exact dates. They are regression pins. The failure test failed there.
- **Runs.**
  - Affected folders: 34 files and 316 tests pass.
  - Whole suite: 5717 tests pass. 10 files fail to load because `xlsx` and `@electric-sql/pglite` are missing from
    this worktree's `node_modules` (local only; CI installs them).
  - `tsc`: clean apart from those two modules.
  - Lint: clean on the changed files.
  - `check:rsc`: run with its `/.claude/` skip removed, because inside a worktree it otherwise scans nothing. It
    passes on 1383 files.
  - `next build`: run by CI.
- **Warehouse state.** Checked read-only with `bq` on 2026-11-24:
  - raw `meta_reach_by_range`, `meta_ad_reach_by_range` and `linkedin_reach_by_range` all hold a pull dated
    2026-11-24 with the 14 presets;
  - prod `marts` has **none** of the three reach marts yet (§5).

### 2.1 Tolerance against live Supermetrics

The latest snapshot (pulled 2026-11-24, read from raw; each mart is that snapshot unchanged) was compared with
Supermetrics MCP `data_query` on the same dates, on 2026-11-24 at about 14:40 UTC.

**Meta** (`FA`, `1480350426850960`): reach and Frequency.

| Preset | Dates | Snapshot | Live |
|---|---|---|---|
| last_7_days | 11-17..11-23 | 118,254 / 1.1338 | 118,254 / 1.1338 |
| last_week | 11-16..11-22 | 118,216 / 1.153 | 118,216 / 1.153 |
| last_30_days | 10-25..11-23 | 488,337 / 1.5514 | 488,337 / 1.5514 |
| this_month (clipped) | 11-01..11-23 | 310,605 / 1.5106 | 310,605 / 1.5106 |
| last_month | 10-01..10-31 | 481,250 / 1.619 | 481,250 / 1.619 |
| this_quarter (clipped) | 10-01..11-23 | 757,527 / 1.6479 | 757,527 / 1.6479 |
| last_90_days | 08-26..11-23 | 950,806 / 1.8661 | 950,806 / 1.8661 |
| last_quarter | 07-01..09-30 | 602,560 / 2.2498 | 602,560 / 2.2498 |
| this_year (clipped) | 01-01..11-23 | 2,490,623 / 2.023 | 2,490,623 / 2.023 |

**LinkedIn** (`LIA`, `503368877`): `approximateUniqueImpressions`. The tile's Frequency is sums-mart impressions
divided by reach.

| Preset | Dates | Snapshot | Live | Frequency tile, BQ / live |
|---|---|---|---|---|
| last_7_days | 11-17..11-23 | 41,433 | 41,433 | 1.7 / 1.7 (impressions 71,383 vs 71,373) |
| last_30_days | 10-25..11-23 | 222,538 | 222,538 | 2.4 / 2.4 (535,656 vs 535,646) |
| last_month | 10-01..10-31 | 2,529,598 | 2,529,598 | 1.5 / 1.5 (3,787,464 both) |
| this_month | 11-01..11-23 | 150,237 | 150,237 | 2.0 / 2.0 |
| last_quarter | 07-01..09-30 | 1,527,818 | 1,527,818 | 1.8 / 1.8 |
| last_90_days | 08-26..11-23 | 3,759,131 | 3,759,131 | 1.7 / 1.7 |
| this_year | 01-01..11-23 | NULL | null | — / — |

**Tolerance, chosen from this evidence.** It agrees with the A11 and A15 notes.
- **Reach: exact.** 16 of 16 windows are equal to the integer.
- **Frequency: equal at the displayed 1 dp.** Meta's is equal at 4 dp. LinkedIn's moves only with the sums mart's
  impressions, which are up to 10 off live over a week (A15's parity), and never changes the displayed value.

Any difference beyond that is a defect, not drift.

---

## 3. Findings

Sev: **●** correctness, **○** cleanup or convention. Status: CONFIRMED (proven in-tree) or PLAUSIBLE (code
assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | warehouse | No reach mart is in prod `marts` yet, Meta's included. Switched on today, both platforms would show "—" and the "can't be loaded" notice. |
| 2 | ● | PLAUSIBLE | `lib/cache.ts:117`, `reach.ts:67` | A failed reach read goes through `cached` with `healthCritical` on, so it counts as a failed fetch in the health beacon, although the page renders "—" and a notice. |
| 3 | ○ | CONFIRMED | `reach.ts:74` | A stale snapshot also shows the delayed notice on a custom range. The lookup cannot tell a custom range from a preset of a newer pull. |
| 4 | ○ | CONFIRMED | `reach.ts:52` | Freshness is per table across all accounts, not per account. A second account's late pull is hidden by Renaissance's. |
| 5 | ○ | CONFIRMED | `lib/paid-media/overview.ts:128` | The Overview triggers the reach lookups, and their `bq_fallback` lines, but shows no reach. |
| 6 | ○ | CONFIRMED | `lib/bq/linkedin.ts:86` | LinkedIn presets ending today go live entirely (C1 has no LinkedIn window clip), so the reach marts serve LinkedIn only for ranges ending yesterday or earlier. |

## 4. Detail

1. **The marts are not built in prod.** `bq ls marts` on 2026-11-24 shows no `mart_fbads_reach_by_range`,
   `mart_fbads_ad_reach_by_range` or `mart_linkedin_reach_by_range`. The raw snapshots are there. The deployed
   dbt-nightly image is older than the A11 and #197 models (data-warehouse#232's report: prod `staging` has no
   `stg_meta_*` or `stg_linkedin_reach_by_range` either).
   *Fix:* none in this PR. Before Paul sets either flag, merge data-warehouse#232, redeploy dbt-nightly from `dev`,
   and confirm all three marts exist and can be read as `dashboard-reader@`.
2. **Health beacon.** The page degrades correctly, but the beacon is told a fetch failed. That is the right signal
   while a mart is missing. It would be noise if reach failures turned out to be frequent and harmless.
   *Fix:* decide together. Keep it, or pass `healthCritical: false` to `reachRows` and `reachPulledOn` and rely on
   the `bq_fallback` line.
3. **The notice on a custom range during a stale snapshot.** Telling a custom range apart would need the
   connector's preset definitions mirrored in TypeScript, and that copy could drift. The notice is true (the reach
   data is late) and lasts until the nightly lands. Declined, and recorded in the plan (edge 12).
4. **Per-table freshness.** `martFreshThrough` makes the same choice for every mart. Matched rows are also
   checked against their own `pulled_on`, so a stale row is never served. The cost is only a notice that is
   missing or wrong for a second account. Revisit when a second client is added to `BQ_CLIENTS`.
5. **The Overview.** One extra cached BigQuery read per page, plus a log line when reach is late. *Fix:* a
   `fields` option on `getMetaKpis`/`getLinkedInKpis` so the Overview skips reach. Cleanup.
6. **LinkedIn presets ending today.** These still come from live Supermetrics, as C1 designed: no notice, nothing
   wrong, but no BigQuery either. They stop working when the licence ends (2027-01-20). *Fix:* give LinkedIn the
   same window clip as Meta and Google Ads. That is a separate item, because it changes every LinkedIn number, not
   just reach.

## 5. Follow-ups (none applied in this PR)

**Blocks switching on (not this merge):**
- Finding 1: data-warehouse#232 merged, dbt-nightly redeployed from `dev`, and the three marts readable as
  `dashboard-reader@`.

**Decide together (Paul and Thomas):**
- Finding 2: the health beacon on a reach failure.
- The notice and tooltip wording: "waiting on today's snapshot" and "can't be loaded right now".

**Highest value after the flip:**
- Finding 6: a LinkedIn window clip, so This Week, Month, Quarter and Year stop depending on Supermetrics
  before 2027-01-20.

**Cleanup:**
- Finding 5: the Overview skips reach.
- Finding 4: per-account freshness, when a second client is on BigQuery.
