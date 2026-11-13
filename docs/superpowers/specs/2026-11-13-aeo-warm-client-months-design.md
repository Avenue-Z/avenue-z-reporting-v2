# AEO Informed Social: warm every month a client can pick (at most two)

Status: draft, 2026-11-13. Builds on `2026-11-12-aeo-informed-social-tab-design.md` section 4. Nothing visible changes.

## Why

The hourly cache warmer pre-loads the tab's three views (MoM, YTD, All time, default min) so a client never waits for a cold Peec pull
(about 30 s for YTD and All time, `docs/findings/2026-11-12-aeo-tab-page-time-limit.md`). It warms only the newest month a client viewer
is served: `lockedRangeFor(client, 'CLIENT_VIEWER', undefined, clock)?.month` (`lib/organic-social/aeo-tab/warm.ts:17`). Since
2026-11-13 every locked-months client lets clients pick two months (`reportingMonths.clientMonths: 2`, all six clients, read only that
day), so the second month's views are cold on first open.

## Measured

| Fact | Source |
|---|---|
| `lockedRangeFor` returns `months`: every month that viewer can pick, newest first, and `month`: the one served | `lib/organic-social/reporting-months.ts:20-22`, `monthsFor` |
| The list is capped only at `MAX_REPORTING_MONTHS = 36` (`reporting-months.ts:6`); a client without `clientMonths` can pick every opened month | `monthsFor`, `reporting-months.ts:158-181` |
| The warmer runs hourly at :30 (`vercel.json`), 300 s limit (`app/api/cache-warm/route.ts:41`), 8 renders at a time (`lib/cache-warm/run.ts:28`); AEO URLs are appended after every other URL (`route.ts:73-77`) | code |
| A settled month's view, once captured, is served from the lock store with no Peec call (`aeo-tab/data.ts:60-63`) | code |

## Change

`aeoWarmUrls` warms the three views for each of the newest **two** months a client viewer can pick
(`lockedRangeFor(...).months.slice(0, 2)`), newest month first, in the same three-view order as today. `WARM_MONTHS = 2` is a named
constant. For a client not on locked months nothing changes (`last_30_days`, three views). A client with no month open to clients still
gets none.

The first three URLs for every client are exactly today's (the newest month's three views), so nothing warmed today moves or is dropped.

## Inputs and outputs

| | In | Out |
|---|---|---|
| `aeoWarmUrls(baseUrl, client, clock)` | unchanged | the same URL shape (`/portal/<slug>/reports?section=organic-social&subsection=organic-aeo-informed[&aeo=ytd|all]&dateRange=<month>`), 3 per warmed month, at most 6 |
| `/api/cache-warm` | unchanged | the same URLs as today, plus up to 3 more per AEO client, still after every other URL |

## Failure behavior

Unchanged: each URL is one self-fetch through the shared runner (`lib/cache-warm/run.ts`); a failing view is counted and logged by the
runner as today and never stops the others. A settled month that has not been captured is captured by its first warm (a `late lock`
line, as for any late capture, `aeo-tab/data.ts`); after that it is a lock read.

## Edge cases

| # | Case | Expected |
|---|---|---|
| 1 | `clientMonths: 1` | one month, three views (today's behavior) |
| 2 | `clientMonths: 2` | two months, six views, newest first |
| 3 | No `clientMonths` (every opened month offered) | the newest two only (the cap) |
| 4 | Only one month open to clients yet | that month, three views |
| 5 | No month open to clients | none |
| 6 | Not on locked months | `last_30_days`, three views (unchanged) |
| 7 | No AEO tab, Organic Social hidden or not enabled | none (unchanged) |

## Cost

Production has no client with the tab today (read only, 2026-11-13), so nothing changes in production until one is switched on. For one
AEO client: up to 3 more renders per hourly run. The older month is settled, so after its first capture each is a lock read, not a Peec
pull.

## Tests (written first)

- `warm.test.ts`: edge cases 1 to 7, each exact URL list in order.
- `cache-warm-route.test.ts`: every URL warmed before is still warmed in the same order; an AEO client on two client months gets its six
  views after them, newest month first.
