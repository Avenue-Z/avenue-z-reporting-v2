# C4: reach and frequency from the reach-by-range marts (plan)

Tracker item C4: "Reach and frequency from `*_reach_by_range`; custom ranges show '—'". Off by default:
only with `DATA_BACKEND_META=bq` / `DATA_BACKEND_LINKEDIN=bq` and the slug in `BQ_CLIENTS`.

## The rule (both platforms, when the numbers come from BigQuery)

1. Reach and frequency come from the platform's reach-by-range mart, from the **account-level row**
   (`CAMPAIGN_ID is null`) whose `start_date` and `end_date` equal the displayed window. Two presets can share
   dates (`this_year`, `year_to_date`): take one row, never sum.
2. No row for those dates (custom ranges, and any window that is not one of the 14 stored presets): "—" with the
   tooltip "Reach and frequency are shown for the preset date ranges only."
3. A comparison period is looked up the same way, with its own dates. It has a value only when its window is itself
   a stored preset (This Month vs a custom compare of last month). Otherwise no change arrow on Reach or Frequency.
4. A stale snapshot is no match: "—", and the page shows a "data delayed" notice.
5. A BigQuery failure on the reach lookup: "—", the page shows a notice, and live Supermetrics is never called.
   The sums on the page are unaffected (they have their own read).
6. A matched row whose reach is NULL (LinkedIn for year-long ranges; Meta when nothing delivered) is served as an
   empty string, exactly as live Supermetrics returns it, so each platform's existing transform renders it as live
   does (LinkedIn "—" with its ~90-days note; Meta 0).

Stale = the same clock as `metaWindow`/`googleAdsWindow`: the reach jobs pull on day P and their rolling ranges end
P-1. With `yesterday = resolveDateRange('last_1_days').endDate` and `today = yesterday + 1`, a `pulled_on` is stale
when `pulled_on < yesterday`, or `pulled_on < today` and the UTC hour is 10 or later. A null or non-ISO value is
stale. Checked twice: the newest `pulled_on` of each of the platform's reach tables (Meta: account and ad marts;
LinkedIn: account mart), and the matched row's own `pulled_on` (a preset whose latest pull failed keeps an older row).

## Files

- **New `lib/bq/reach.ts`** (shared; replaces C2's Meta-only `reachSql` in `lib/bq/meta.ts`):
  - `type ReachPlatform = 'meta' | 'linkedin'`; tables: meta `mart_fbads_reach_by_range` (+ `mart_fbads_ad_reach_by_range`),
    linkedin `mart_linkedin_reach_by_range` (new mart, data-warehouse PR; a dependency).
  - `REACH_STATE_KEY = '_reach'`; `type ReachState = 'preset-only' | 'delayed' | 'unavailable'`. A BigQuery row that
    asked for reach carries the reach keys when served, else `_reach` = the state and no reach keys.
  - `snapshotStale(pulledOn: unknown): boolean`.
  - `reachPulledOn(platform)`: cached 1h; per table `select cast(max(pulled_on) as string) as d`; the oldest of the
    platform's tables; throws `BqUnavailable('stale')` when any is null or non-ISO.
  - `accountReach(platform, accountId, start, end)` → `{ reach: string; frequency: string } | ReachState`. The row
    lookup is cached 1h; the function itself is not, so a failure is never cached. Never throws: an error is
    `'unavailable'`, logged `bq_fallback` reason=error served=none; a stale snapshot is `'delayed'`, logged
    reason=stale served=none. (The readers know the account id, not the slug: the log's `slug` field carries the
    account id, as `extractTags` already does.)
  - `adReach(accountId, start, end)` (Meta) → `Map<adId, {reach, frequency}> | ReachState`; an empty lookup is
    `'preset-only'`.
  - `reachNotice(kpis: Kpi[] | undefined): AdsNotice | null`: from the Reach tile's `reachState`.
- `lib/bq/meta.ts`: the cached sums read no longer includes reach (cache version `v2`); `readMetaMarts` merges
  `accountReach`/`adReach` after it. Reach failure no longer fails the sums (C2 did; changed so both platforms share
  rule 5).
- `lib/bq/linkedin.ts`: `approximateUniqueImpressions` is served from `accountReach('linkedin')` for totals; with a
  dimension it is `unsupported` (C1's live fallback for that query, as before). `LI_LIVE_ONLY` loses it.
- `lib/linkedin/base.ts`: the live-merge branch for live-only fields becomes unreachable (only `memberRegion` was
  left, and it is routed live before the try) — remove it and `LI_LIVE_ONLY`.
- `lib/paid-search/types.ts`: `Kpi.reachState?: 'delayed' | 'unavailable'`.
- `lib/meta/kpis.ts`, `lib/linkedin/kpis.ts`: tile per state (tooltip per state; `reachState` set for delayed and
  unavailable); compare delta only when the compare row carries reach.
- `lib/bq/googleads-window.ts`: `AdsNotice` gains `{ kind: 'reach'; reason: 'delayed' | 'unavailable' }`;
  `components/report-sections/paid-media/data-delayed-notice.tsx` words it.
- `components/report-sections/meta-ads/index.tsx`, `components/report-sections/linkedin-ads/index.tsx`: render
  `reachNotice(kpis.data)`.
- Paid Media Overview shows no reach: nothing to change there (verify).
- `vitest.config.ts`: add every new test file (the include list is an allowlist; unlisted lib tests silently skip).

## Edge cases

Subject: `readMetaMarts`/`readLinkedInMarts` (and what they call: `bqRows`, `cached`, `martFreshThrough`) and their
callers `metaQuery`/`linkedinQuery` → `getMetaKpis`/`getLinkedInKpis`/`getCreativeTree` → the two report sections.
Inputs come from the URL range (`resolveDateRange`), the page window (`metaWindow`, clipped to the creative mart's
newest day) and the reach marts (nightly connector snapshots).

| # | Category | What breaks | file:line | Disposition |
|---|---|---|---|---|
| 1 | external failure | A reach-mart error fails the whole Meta read (sums included) | lib/bq/meta.ts:114-118 | fix |
| 2 | external failure | On BigQuery, LinkedIn reach is always fetched live from Supermetrics; any reach error sends the whole query live | lib/linkedin/base.ts:40-51 | fix |
| 3 | external failure | `bqRows` has a 20s job timeout, nothing else hangs | lib/bq/client.ts:37 | decline: already bounded |
| 4 | operator visibility | A stale reach snapshot is invisible: no log says which account showed "—" and why | lib/bq/meta.ts:105-110 | fix |
| 5 | state / concurrency | The window is clipped to the creative mart's freshness while reach reads another table with its own pull | lib/bq/meta-window.ts:47-50 | fix (rule 4: table and row `pulled_on`) |
| 6 | state / concurrency | Reach is inside the 1h sums cache, so a delayed/failed reach would be cached an hour | lib/bq/meta.ts:128 | fix |
| 7 | state / concurrency | Freshness is cached 1h, so reach can read "delayed" up to an hour after the nightly lands | lib/bq/freshness.ts:11 | decline: same as every mart's freshness |
| 8 | input boundary | NULL reach/frequency from the mart | lib/bq/meta.ts:122 | fix (rule 6) |
| 9 | input boundary | `max(pulled_on)` null (empty table) or not ISO | new | fix (stale) |
| 10 | input boundary | Two presets with the same dates | lib/bq/meta.ts:107 | fix (one row; kept) |
| 11 | bounds | Ad lookup returns one row per ad delivered in the window (56 for Oct) | new | decline: bounded by the account's ads |
| 12 | state | A stale snapshot also shows the notice on a custom range (it cannot tell a custom range from a preset of a newer pull) | new | decline: documented; the notice is about the snapshot |
| 13 | external dependency | `mart_linkedin_reach_by_range` is not in `marts` yet: LinkedIn reach reads "—" + notice until it ships | n/a | file: data-warehouse PR |
| 14 | security | Dates reach SQL only as named params; table names through `martRef`'s identifier check | lib/bq/client.ts:30-33 | none identified |

Outer test: `components/report-sections/meta-ads/index.bq.test.tsx` (section → kpis → metaQuery → readMetaMarts →
reach, `bqRows` doubled) gains the delayed-snapshot case.

## Tests first (each a named test)

- `snapshotStale`: before/after 10:00 UTC, yesterday, older, null/non-ISO.
- `accountReach`: preset match served; NULL reach served as ''; no row → preset-only; stale table → delayed with no
  row lookup; matched row with stale `pulled_on` → delayed; BigQuery error → unavailable + log; SQL is account-level,
  date-equality, one row, per-platform table.
- Near-miss: at 2026-11-24 12:00 UTC with the creative mart through 11-23, `metaWindow('this_month')` gives
  `custom:2026-11-01,2026-11-23`, which matches the snapshot's `this_month` row → served. A window one day short
  (11-01..11-22) → preset-only.
- Custom range → "—" + preset-only tooltip, no arrow.
- Comparison: compare window = stored preset → delta; compare not a preset → value shown, no arrow.
- Reach failure: sums still served, "—" + notice, `smQuery` never called (Meta and LinkedIn).
- LinkedIn reach with a dimension → unsupported → C1 live fallback.
- Section: delayed/unavailable reach renders the notice; preset-only renders none.
