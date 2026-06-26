# Real-Time (Immediate-on-Failure) Health Alerting — Future Enhancement

**Status:** Designed, NOT implemented. Deferred after the sweep MVP.
**Builds on:** [2026-06-25-health-alerting-layer-design.md](./2026-06-25-health-alerting-layer-design.md)

## Why

The shipped MVP is a scheduled sweep every 15 minutes. It is proactive (covers
pages no one has opened) but has up to a 15-minute detection delay. This
enhancement adds **immediate** alerting: the moment a real client request hits a
failing data source, a Slack alert fires — with no delay.

The two are complementary and meant to run together (hybrid):

| | Sweep (shipped) | Real-time (this doc) |
|---|---|---|
| Delay | up to 15 min | ~0, on the failing request |
| Coverage | every page, even unvisited | only pages a client actually opens |
| Reflects | cached health | the exact request the client just made |

## Mechanism

The hook already exists. `recordFetch()` runs inside the `cached()` wrapper on
**every** request (see [lib/cache.ts](../../../lib/cache.ts)). During a sweep the
collector is active; during normal traffic it is not. That distinction is the
trigger:

> **fetch failed AND no active collector ⇒ a real client-facing failure ⇒ alert.**

### Non-blocking

The alert must never slow the client's response. Fire it from Next's `after()`
(`import { after } from 'next/server'`), so the Slack POST and DB check happen
after the response is sent. `after()` is valid here because `cached()` runs
inside a request scope.

### Granularity

`(client, vendor, fn)` — e.g. `acme · ga4.getSessions`. This is what the cache
layer knows; it has no `section`/`surface` context. `vendor.fn` identifies the
data source clearly enough. The `client` slug comes from the fetcher's
`extractTags` (`{ client }`); fetchers without it fall back to `client: 'unknown'`.

### Dedup + re-alert throttle (no spam)

Reuse the existing `health_state` table with a separate `live:` key namespace:
`` `live:${clientSlug}:${vendor}:${fn}` ``.

On a real-traffic failure:
1. Read the `live:` row.
2. If absent, or `updated_at` is older than the throttle window (default **60
   min**), POST to Slack and upsert the row (`status: 'down'`, `updated_at = now`).
3. Otherwise stay quiet (already alerted recently).

A popular broken page therefore pings **once**, then re-pings at most hourly
while still broken. We do NOT record successes in the live path — that would
mean a DB write on every healthy request. Recoveries are announced by the
**sweep** (which tracks its own `surface:client:section` keys), so the live path
only ever reports breaks. A recovered source simply stops failing, so its `live:`
row goes stale and silent.

### Message format

Distinct prefix so live alerts are separable from sweep alerts in Slack:

```
⚡ Live · acme · ga4.getSessions — Missing env var GA4_TOKEN
```
(vs the sweep's `🔴 acme · portal · GA4 — …`)

## Proposed implementation (one task)

1. `lib/health/live.ts` — `recordLiveFailure({ client, vendor, fn, error })`:
   reads/writes the `live:` row via new query helpers, applies the throttle,
   formats the message, and calls the existing `postHealthChanges` (or a thin
   `postLiveFailure`) from [lib/health/slack.ts](../../../lib/health/slack.ts).
2. [lib/cache.ts](../../../lib/cache.ts) — in the existing catch branch, after
   `recordFetch(...)`, add: if no collector is active, compute `client` from
   `extractTags`, and `after(() => recordLiveFailure(...))`.
3. Query helpers in [lib/db/queries.ts](../../../lib/db/queries.ts):
   `getLiveState(key)` and `upsertLiveState(key)` (no schema change — the
   existing `health_state` columns suffice; `updated_at` doubles as
   `last_alerted_at` for `live:` keys).
4. Env: `HEALTH_LIVE_THROTTLE_MIN` (optional, default 60).

## Known tradeoffs (accepted by design)

- **cache-warm cron also triggers it.** The cache-warm job renders pages with no
  collector, so its failures alert too — but they dedup into the same `live:`
  throttle (≤1 extra ping/hour per source). It's still a real failure signal.
- **Warm cache masks failures.** A source served from a warm cache doesn't fail,
  so live alerts reflect genuine cache-miss failures the client actually hit —
  not staleness. (Same cache-freshness limitation as the sweep.)
- **No live recovery message.** Recovery is the sweep's job; the live path is
  break-only by design to avoid per-success DB writes.

## Out of scope (even for this enhancement)

- Per-section/surface granularity in the live path (cache layer lacks it).
- Distinguishing service-principal traffic (cache-warm) from real user sessions
  at the cache layer.
- Visual/logic-bug detection (both systems detect fetch failures, not wrong
  numbers).
