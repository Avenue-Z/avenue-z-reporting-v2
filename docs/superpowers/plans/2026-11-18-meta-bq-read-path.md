# Meta BigQuery Read Path (C2): Plan

**Date:** 2026-11-18 · **Tracker:** C2 · **Branch:** `feat/meta-bq-read-path` off `origin/dev` (`551e8969`).
**Pattern:** C1 (#459, `docs/qa/bq-read-path-ads-code-review.md`) and C3 (#461,
`docs/qa/bq-data-delayed-notice-code-review.md`): with the source switched to `bq` and the slug in
`BQ_CLIENTS`, the Meta sections read the warehouse marts only, never live Supermetrics; a range is
clipped to what the marts hold, with the "data delayed" notice; a failure shows the notice.
**Off by default:** nothing changes until `DATA_BACKEND_META=bq`.

**Warehouse side** (data-warehouse, read only): A11 design
`docs/superpowers/specs/2026-11-12-meta-detail-marts-design.md`, golden compare
`docs/notes/2026-11-12-meta-detail-marts-golden.md` and its 2026-11-16 addendum (#197, #200).

**Do not touch** `lib/bq/googleads-window.ts` or `lib/bq/googleads.ts`: C3a (#463, per-account
Google Ads history floor) is editing them in parallel. Import from them only.

## The Meta seam (every Meta Supermetrics call the dashboard makes)

All go through `metaQuery` (`lib/meta/base.ts`), data source `FA`, no filters, no settings.

| # | Caller | Dimensions | Metrics | Range |
|---|---|---|---|---|
| Q1 | `getMetaKpis` (`lib/meta/kpis.ts`), also the Paid Media Overview | none | `cost impressions reach Frequency inline_link_clicks CTR CPM CPC landing_page_views cost_per_landing_page_view action_post_engagement` | main + compare |
| Q2 | `getCreativeTree` (`lib/meta/creative.ts`), `maxRows: 200` | `ad_name adcampaign_name adset_name adstatus` | Q1 minus `CPM` | main |
| Q3 | `getMetaGeoData` (`lib/meta/geo.ts`), `maxRows: 500` | `Region` | `cost inline_link_clicks landing_page_views action_post_engagement` | main + compare |
| Q4 | `getMetaSeries` (`lib/paid-media/trend.ts`) | `Date` | `cost inline_link_clicks` | main |

Out of scope: the configurable dashboard's Supermetrics adapter (`components/dashboard/add-block/leaf-builder.tsx`
offers `DS_IDS.META`), which is C5, as for Google Ads.

## Facts the design rests on (checked 2026-11-18)

- **Prod `marts` does not hold the four Meta detail marts yet** (only the legacy
  `mart_fbads_ad_performance` / `mart_fbads_campaign_performance`). They arrive with the next runner
  deploy from data-warehouse `dev`. `dbt_dev_marts` holds them: creative through 2026-11-15, geo
  through 11-10, account reach snapshot pulled 11-11, ad reach snapshot pulled 11-16.
- Mart columns: creative `ACCOUNT_ID (STRING) CAMPAIGN_ID campaign_name AD_GROUP_ID ad_group_name
  AD_ID ad_name ad_status event_date cost impressions clicks inline_link_clicks landing_page_views
  action_post_engagement`; geo `ACCOUNT_ID country_code region event_date` + the same six sums;
  `mart_fbads_reach_by_range` `ACCOUNT_ID CAMPAIGN_ID(null = account row) range_key start_date
  end_date reach frequency pulled_on`; `mart_fbads_ad_reach_by_range` the same plus `AD_GROUP_ID AD_ID`.
  The reach marts hold one snapshot (the latest pull): one row per preset, dates as of the pull day.
- **The client row stores `act_1480350426850960`; the marts store `1480350426850960`.** Strip `act_`.
- Live Supermetrics returns **no Meta rows for Renaissance from 2024-01-01 to 2026-04-30**; the
  connector holds every day from 2026-05-01. So the marts answer exactly back to 2024-01-01.
- No Renaissance ad shares its (name, ad set, campaign, status) with another ad.

## Reading rules (from the golden note)

- Sums by the requested dimensions; rates from sums, `round(…, 4)`, **null on a zero denominator**:
  `CTR = clicks / impressions`, `CPC = cost / clicks` (**all** clicks, not link clicks),
  `CPM = cost / impressions × 1000`, `cost_per_landing_page_view = cost / landing_page_views`.
- Grouped reads drop a row only when **all six** sums are 0 (`cost impressions clicks
  inline_link_clicks landing_page_views action_post_engagement`).
- Grouped reads with `maxRows` order by cost desc and limit.
- Reach and frequency only from the reach marts, from the row whose `start_date`/`end_date` equal
  the window; presets sharing dates are equal, take any one, never sum.

## Edge cases

Subject: `metaQuery` (`lib/meta/base.ts:5`) and the new reader/window it calls; producers of its
inputs: the page range (`resolveDateRange`, URL `custom:`), the client row's `metaAdAccountId`, the
four marts, `martFreshThrough` (`lib/bq/freshness.ts:11`); consumers: the four Meta fetchers, the
Meta page, the Paid Media Overview and trend.

| # | Category | What breaks | file:line | Disposition |
|---|---|---|---|---|
| 1 | external failure | A BigQuery job error or the 20 s cap (`lib/bq/client.ts:38`) must not fall back to `smQuery` | `lib/meta/base.ts:17` | fix: rethrow, part error card + "can't be loaded" notice; test |
| 2 | external failure | Freshness probe fails or returns a non-date: window must be `unavailable`, never an unclipped range | new `lib/bq/meta-window.ts` | fix; test |
| 3 | external failure | Reach lookup fails while the sums succeed | new `lib/bq/meta.ts` | fix: the whole read fails (never a silent partial); test |
| 4 | operator visibility | Every miss must say which client and why at 3am | `lib/bq/backend.ts:23` | fix: `bq_fallback` with `source: 'meta'`, `served: 'none'`; `stale` from 10:00 UTC as C3; test |
| 5 | operator visibility | A missed reach pull shows only as `—` on preset ranges, no log | new reader | file: review record §5 (A2 alerts on failed pull jobs) |
| 6 | bounds | Creative/geo rows unbounded | Q2/Q3 | fix: `order by sum(t.cost) desc limit maxRows`; trend is one row per day (decline a limit) |
| 7 | input boundary | `act_` prefix vs mart `ACCOUNT_ID`: every read returns zero rows, served as real zeros (C1 Finding 7) | `lib/meta/base.ts:12` | fix: strip `act_`; test |
| 8 | input boundary | An account whose history nobody verified reads as zeros | new reader | fix: per-account floor map; unknown account → `unsupported`; test |
| 9 | input boundary | Unpadded or malformed `custom:` range from the URL (C3 Findings 1–2) | new window + reader | fix: `ISO_DATE` on both, malformed → `unsupported`; test |
| 10 | input boundary | Supermetrics `filters`/`settings`, or a field the marts don't carry | reader | fix: `unsupported` before any BigQuery call; test |
| 11 | input boundary | A creative row grouping more than one `AD_ID` cannot take one ad's reach | reader | fix: reach unavailable for that row; test |
| 12 | input boundary | A matched reach row with null reach (no delivery) | reader | fix: reads as 0, as live does for an empty range; test |
| 13 | input boundary | Reach unavailable must render `—`, never a fabricated 0, while live rows stay as today | `lib/meta/kpis.ts:28`, `lib/meta/creative.ts:17` | fix: unavailable = the row lacks the `reach` key (live rows always carry it); test |
| 14 | state | Freshness read twice per render (window, then `assertCovers`); a reload moving it backwards between them fails the parts into the notice | `lib/bq/freshness.ts:11` | decline: never wrong, never live (C3 Finding 9) |
| 15 | state | Cache key must include account, fields, range and maxRows | reader `cached()` | fix: all are arguments of the cached impl |
| 16 | state | Overview awaits two window probes in series | `components/report-sections/paid-media/overview/index.tsx:32` | fix: `Promise.all` |
| 17 | security | Field names reaching SQL | reader | fix: whitelist maps only; table names through `martRef`; values as named params; test |
| 18 | security | Secrets in logs | `lib/bq/client.ts:19` | decline: C1 Finding 1 already fixed it; `detail` is sliced to 300 chars |

**Outer test:** `components/report-sections/meta-ads/index.bq.test.tsx` renders the real Meta page
through every fetcher, `metaQuery` and the reader; only `bqRows` and `smQuery` are doubles. Every
BigQuery case asserts `smQuery` was never called.

---

## Task 1: the reader (`lib/bq/meta.ts`) and the switch

**Files:** `lib/bq/backend.ts` (+ test), new `lib/bq/meta.ts`, new `lib/bq/meta.test.ts`,
new `lib/bq/meta.read.test.ts`.

1. `backend.ts`: `BqSource` gains `'meta'` → `DATA_BACKEND_META`. Test: only exactly `bq` + allowlisted.
2. `meta.ts` exports:
   - `META_FRESHNESS_TABLE = 'mart_fbads_creative_performance'`, `META_GEO_TABLE = 'mart_fbads_geo_performance'`.
   - `metaAccount(id)`: strips a leading `act_`.
   - `metaHistoryFrom(accountId): string | null`: from `META_HISTORY_FROM_BY_ACCOUNT = { '1480350426850960': '2024-01-01' }`
     (comment: live Supermetrics has no Renaissance Meta rows 2024-01-01..2026-04-30, checked
     2026-11-18; the connector holds every day from 2026-05-01). Unknown account → `null`.
   - `planMetaQuery(fields): { table, kind: 'totals' | 'daily' | 'creative' | 'geo' }`. Field ids:
     dims `Date`→`cast(event_date as string)`, `ad_name`→`coalesce(ad_name,'')`,
     `adcampaign_name`→`coalesce(campaign_name,'')`, `adset_name`→`coalesce(ad_group_name,'')`,
     `adstatus`→`coalesce(ad_status,'')`, `Region`→`coalesce(region,'')`; sums `cost impressions
     inline_link_clicks landing_page_views action_post_engagement`; ratios `CTR CPC CPM
     cost_per_landing_page_view`; reach fields `reach Frequency`. `Region` → geo mart (no other dim,
     no reach fields); any ad dim → creative (no `Date`, no `Region`); `Date` alone → daily (no reach
     fields); no dims → totals. Anything else → `BqUnavailable('unsupported')`.
   - `buildMetaSql(fields, kind, maxRows?)`: select output keys exactly as the Supermetrics field ids;
     ratio = `round(safe_divide(sum(t.num) * scale, sum(t.den)), 4)` (no coalesce: null on zero
     denominator, as live); `from ${martRef(table)} t where cast(t.ACCOUNT_ID as string) = @account
     and t.event_date between date(@start) and date(@end)`; grouped kinds `group by` the dim
     expressions and `having` the six-sum rule (qualified `t.`, BigQuery aliases are case-insensitive);
     `maxRows` → `order by sum(t.cost) desc\nlimit N`. Creative with a reach field also selects
     `count(distinct t.AD_ID) as _n_ads, any_value(cast(t.AD_ID as string)) as _ad_id`. Reach
     fields are never in this SQL.
   - Reach SQL: account row `select reach, frequency from ${martRef('mart_fbads_reach_by_range')} where
     cast(ACCOUNT_ID as string) = @account and CAMPAIGN_ID is null and start_date = date(@start) and
     end_date = date(@end) order by range_key limit 1`; ads `select cast(AD_ID as string) as ad_id,
     any_value(reach) as reach, any_value(frequency) as frequency from ${martRef('mart_fbads_ad_reach_by_range')}
     where … same window … group by 1`.
   - `readMetaMarts(accountId, fields, startDate, endDate, maxRows?)`: `planMetaQuery` first (no
     BigQuery call on a refusal); `ISO_DATE` on both dates (`unsupported`); `metaHistoryFrom(metaAccount(accountId))`
     null → `unsupported` naming the account; start before it → `unsupported`; `assertCovers(table, endDate)`
     for the mart read (creative or geo); then the sums query and, when a reach field is asked, the
     reach query, in parallel (either failing fails the read). Rows through `toSmRows` (from
     `./googleads`) on the non-reach fields, then reach merged:
     - totals: no matching row → leave `reach`/`Frequency` keys **absent**; a row → `String(reach ?? 0)`,
       `String(frequency ?? 0)`.
     - creative: no ad reach rows at all for the window, or `_n_ads !== 1`, or that ad missing → keys
       absent; else the ad's values. `_n_ads`/`_ad_id` never reach the output.
     Cache the BigQuery work with `cached('bigquery', 'readMetaMarts', impl, { ttlSeconds: 3600, version: 'v1', extractTags })`
     like `readOne` in `lib/bq/linkedin.ts`, with `maxRows ?? null` as an argument.
3. Tests (vitest, mock `@/lib/bq/client` `bqRows` and `@/lib/cache` like `components/report-sections/paid-search/index.bq.test.tsx:6-7`):
   the four plans; unsupported fields/combos; SQL fragments (ratios, having, order/limit, account
   filter, no `reach` in sums SQL); `act_` stripped in the `@account` param; unknown account and
   pre-floor start refused with no `bqRows` call; malformed dates refused; stale refused; reach merge
   cases from the table above (absent keys, null → `0`, `_n_ads` 2 → absent, missing ad → absent,
   helper columns stripped); reach query failure rejects.

## Task 2: the seam, the window, and `—` for unavailable reach

**Files:** `lib/meta/base.ts`, new `lib/meta/base.bq.test.ts`, new `lib/bq/meta-window.ts` (+ test),
`lib/meta/kpis.ts`, `lib/meta/creative.ts`, `lib/meta/types.ts`,
`components/report-sections/meta-ads/creative-table-client.tsx` (+ their tests).

1. `metaQuery`: when `bqEnabled('meta', slug)`: `filters`/`settings` → `BqUnavailable('unsupported')`;
   else `readMetaMarts(accountId, fields, startDate, endDate, opts.maxRows)`; any throw →
   `logBqFallback('meta', slug, err, 'none')` and rethrow. Never `smQuery`. Mirror `lib/paid-search/base.bq.test.ts`.
2. `metaWindow(slug, dateRange): Promise<AdsWindow>` (type imported from `./googleads-window`):
   the same algorithm as `googleAdsWindow` at `origin/dev` (`lib/bq/googleads-window.ts:32-71`),
   with `bqEnabled('meta')`, `martFreshThrough(META_FRESHNESS_TABLE)`, the floor from
   `metaHistoryFrom(metaAccount(client.metaConfig.metaAdAccountId))` (no config / unknown account →
   `unsupported` → `unavailable`), logs with source `'meta'`. Own `daysBefore` helper (don't edit
   googleads-window.ts). Tests mirror `lib/bq/googleads-window.test.ts`.
3. Unavailable reach renders `—`:
   - `transformMetaKpis`: when `totals` has keys but no `reach` key, the Reach and Frequency KPIs
     are `{ value: DASH, delta: undefined, tooltip: 'Reach and frequency are shown for the preset date ranges only.' }`.
     Live rows always carry `reach`, and an empty live result (`{}`) keeps today's 0. A compare row
     without `reach` already gives no delta (`delta()` drops a 0 prior).
   - `CreativeMetrics.reach` and `.frequency` become `number | null`; `transformCreative` sets both
     null when the row lacks `reach`; `aggregate` gives null reach and frequency when any item's
     reach is null. `creative-table-client.tsx`: a null metric renders `DASH`; sorting puts nulls
     last in either direction. Check every other `CreativeMetrics` consumer compiles (`npx tsc --noEmit`).
   - Tests: live-shaped rows unchanged; BigQuery-shaped rows without `reach` → `—`.

## Task 3: the pages, the Overview, the notice, the outer test, the shadow script

**Files:** `components/report-sections/meta-ads/index.tsx`, new `…/meta-ads/index.bq.test.tsx`,
`components/report-sections/paid-media/data-delayed-notice.tsx` (+ test),
`components/report-sections/paid-media/overview/index.tsx` (+ test), `lib/paid-media/overview.ts`,
`lib/paid-media/trend.ts` (+ tests), `scripts/bq-shadow-compare.ts`, `.env.example`.

1. Notice: `adsNoticeText(notice, channel?, source = 'Paid Search')` and `DataDelayedNotice` gains
   `source?: string`; "history starts" and "can't be loaded" name `source`. Paid Search text unchanged.
2. Meta page: `metaWindow` first; no range → header + notice only; else every fetcher gets the
   window's range; a failed part with `bqEnabled('meta')` adds the `unavailable` notice (as
   `paid-search/index.tsx:45-68`), `source="Meta"`.
3. Overview: `getPaidMediaOverview(…, paidSearchRange, metaRange = dateRange)` and
   `getPaidMediaTrend(…, paidSearchRange, metaRange = dateRange)`; null metaRange → Meta not fetched.
   The section awaits `googleAdsWindow` and `metaWindow` together, and shows Meta's notices when
   Meta is configured (`channel="Meta" source="Meta"`).
4. Outer test `index.bq.test.tsx`, modelled on `components/report-sections/paid-search/index.bq.test.tsx`:
   This Month through yesterday with notice; stale marts; BigQuery down; reads failing after a good
   probe; switched off → live and no BigQuery; `smQuery` never called on any BigQuery case.
5. Shadow script: optional 2nd arg `googleads|linkedin|meta` to run one source's checks; optional
   `SHADOW_RANGES` env (`;`-separated) to override `RANGES`; Meta checks `meta.kpis`
   (`getMetaKpis(slug, r, 'previous_period')`), `meta.creative` (`getCreativeTree` from `lib/meta/creative`),
   `meta.geo` (`getMetaGeoData(slug, r, 'previous_period')`), and `DATA_BACKEND_META` added to the
   trend check's flags. `ID_FIELDS` already matches `region`, `name`, `ad`, `key`, `date`.
6. `.env.example`: `DATA_BACKEND_META=` with the Google Ads wording.

Gate: `make check` with `DATABASE_URL=postgresql://ci:ci@db.invalid/ci`.
