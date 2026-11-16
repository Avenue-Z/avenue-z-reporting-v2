# AEO Informed Social: warm every month a client can pick (at most two)

Status: draft, 2026-11-13. Builds on `2026-11-12-aeo-informed-social-tab-design.md` section 4. Nothing visible changes.

## Why

The hourly cache warmer pre-loads the tab's three views (MoM, YTD, All time, default min) so a client never waits for a cold Peec pull
(about 30 s for YTD and All time, `docs/findings/2026-11-12-aeo-tab-page-time-limit.md`). It warms only the newest month a client viewer
is served: `lockedRangeFor(client, 'CLIENT_VIEWER', undefined, clock)?.month` (`lib/organic-social/aeo-tab/warm.ts:17`). Clients can now
pick two months (production, all six locked-months clients, `reportingMonths.clientMonths: 2` since 2026-11-13, read only with
`prod-2026-11-13-client-menu-labels-readonly.mts`; staging and dev were not changed). No environment has an AEO client on two client months
today, so the change is proven by tests here and seen working only once the tab is on for a client in production.

What the older month costs today, read from the code (review round 1, major 2): every month a client can pick has already locked
(`lockOn` never falls after the opening day, `lib/organic-social/lock-day.ts:25`), and the lock sweep captures MoM, YTD and All time for
the two newest locked months on their lock day (`lib/organic-social/lock-sweep.ts:30-38`). A captured view is a lock read
(`aeo-tab/data.ts:61-63`), kept in Next's cache for a day (`lib/organic-social/response-lock-store.ts:22`). So the older month is
normally one small id lookup per render plus one full answer read a day (`response-lock-store.ts:17-27`), not a Peec pull. It is a cold Peec pull (about 30 s for YTD and All time) only when the month was never
captured: the tab was switched on after that month's sweep window (`lock-sweep.ts:29`), or a capture failed or stored nothing.

The two real benefits: (1) on the day the tab is switched on, the hourly warmer captures both client months by itself, so no client is
the first to wait 30 s; (2) the older month's day-long lock cache stays warm.

## Measured

| Fact | Source |
|---|---|
| `lockedRangeFor` (`lib/organic-social/locked-range.ts:10-14`) returns `months`: every month that viewer can pick, newest first, and `month`: the one served, `months[0]` for a client viewer with no requested month | `reporting-months.ts:20-22` (type), `monthsFor` `:168-187`, `:210` |
| The list is capped only at `MAX_REPORTING_MONTHS = 36` (`reporting-months.ts:6`); a client without `clientMonths` can pick every opened month | `monthsFor`, `reporting-months.ts:168-187` |
| The warmer runs hourly at :30 (`vercel.json`), 300 s limit (`app/api/cache-warm/route.ts:41`), 8 renders at a time (`lib/cache-warm/run.ts:28`); AEO URLs are appended after every other URL (`route.ts:73-77`) | code |
| A settled month's view, once captured, is served from the lock store with no Peec call (`aeo-tab/data.ts:60-63`) | code |

## Change

`aeoWarmUrls` returns `{ served, extra }`: `served` is today's three URLs (the newest month a client viewer is served); `extra` is the
same three views for the next month a client can pick (`lockedRangeFor(...).months[1]`), or none. `WARM_MONTHS = 2` is a named constant
(served plus at most one more). The route (`app/api/cache-warm/route.ts:77`) appends every AEO client's `served` first, then every
client's `extra` (review round 1, major 1), so no URL warmed today moves behind a new one, across clients as well as within one. For a client not on locked months nothing changes (`last_30_days`, three views). A client with no month open to clients still
gets none.

Every URL warmed today keeps its position: `served` is exactly today's list, and all `extra` URLs come after every `served` URL.

## Inputs and outputs

| | In | Out |
|---|---|---|
| `aeoWarmUrls(baseUrl, client, clock)` | unchanged | `{ served: string[]; extra: string[] }`, each 0 or 3 URLs of today's shape (`/portal/<slug>/reports?section=organic-social&subsection=organic-aeo-informed[&aeo=ytd|all]&dateRange=<month>`); `served` byte-identical to today's list. Its readers change shape: `route.ts:77` and every `warm.test.ts` assertion |
| `/api/cache-warm` | unchanged | the same URLs as today, plus up to 3 more per AEO client, still after every other URL |

## Failure behavior

Each URL is one self-fetch through the shared runner (`lib/cache-warm/run.ts`); one view failing never stops the others. The runner
counts only the HTTP status (`run.ts:37`), and a failed AEO capture is an error card inside a 200 page
(`components/report-sections/organic-social/aeo-informed/section.tsx:74`), so the runner's `ok` count does not show it. The signals are the
log lines `[aeo-informed] lock capture failed` (`aeo-tab/data.ts:65,85`), `lock skipped (incomplete answer)` (`:73`, an empty answer, not
stored, so pulled again each hour) and `lock store read failed` / `lock store write failed` (`:62,77`), as for the views warmed today. A settled month that has not been captured is captured by its first warm (a `late lock`
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
| 8 | Malformed `reportingMonths` or an invalid `clientMonths` (for example 0) | none (no month is offered, `reporting-months.ts:132-133`) |
| 9 | `clientMonths` of 3 or more | the served month and one more (the cap) |
| 10 | All time on the older month ends before `allTimeFrom` | the page shows its no-data state and makes no Peec call (`aeo-tab/params.ts:58-61`) |

## Cost

Production has no client with the tab today (read only, 2026-11-13), so nothing changes in production until one is switched on. For one
AEO client: up to 3 more renders per hourly run. The older month is settled, so after its first capture each is a lock read, not a Peec
pull.

## Tests (written first)

- `warm.test.ts`: edge cases 1 to 9, each exact `served` and `extra` list in order: `extra` is `months[1]`'s three views, and empty for
  `clientMonths: 1`, one open month, and a client not on locked months. The existing locked-months case (`warm.test.ts:24-28`, no
  `clientMonths`) changes on purpose: `served` stays September, `extra` adds August.
- `cache-warm-route.test.ts`: every URL warmed before is still warmed in the same order; with two AEO clients on two client months, every
  `served` URL comes before any `extra` URL.
