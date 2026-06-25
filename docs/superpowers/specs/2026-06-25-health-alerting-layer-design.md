# Health & Alerting Layer — Design

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan

## Problem

The reporting platform goes client-facing. We need to know, proactively,
when something is unhealthy — a data source connection is missing, a report
section fails to load, or a page errors — before a client notices. Today there
is no monitoring: failures render a "Failed to load" fallback in-app and emit
at most a `console.error` to Vercel logs that nobody watches.

## Goal

A scheduled health sweep that detects per-section, per-data-source failures
across every client and posts **only state changes** (newly broken / recovered)
to an internal Slack channel.

## Scope decisions (locked)

| Decision | Choice |
|---|---|
| Alert delivery | Slack message to an internal channel (incoming webhook) |
| Trigger | Scheduled cron sweep (Vercel Cron) |
| Check depth | Section-level / data-source-level (deep), not just HTTP 200 |
| Alert noise | Only on changes (transitions), backed by a state table |
| Empty-but-successful data (0 rows) | Out of scope for v1 — flag errors/timeouts/missing connections only |

## Why this approach (Option A — in-band collector)

Every report section fetches its data server-side through the existing
`cached()` wrapper in [`lib/cache.ts`](../../../lib/cache.ts). That wrapper is a
single chokepoint that already:

- runs server-side during render,
- uses `AsyncLocalStorage`,
- knows `vendor`, `fn`, per-client tags, and `ok`/`error`.

So a failed fetch (missing token, source down, timeout) is a **server-side**
event that flows through `cached()` during the page render. We observe it
in-band rather than scraping HTML or maintaining a separate section→fetcher
registry. This means **no drift** (we watch the real render path) and the
signal reflects exactly what the client experiences.

Rejected alternatives:
- **Direct data-source probe** — requires a hand-maintained section→fetcher
  registry that duplicates page logic and rots on every section change.
- **HTTP + PERF log scraping** — cross-process log capture on Vercel is fragile.

## Architecture

```
Vercel Cron (every 15 min)
  └─→ GET /api/health/sweep   (Authorization: Bearer CRON_SECRET)
        ├─ getAllClients() → build URL list:
        │     for each client × enabledReport, both surfaces:
        │       /portal/{slug}/reports/{report}?dateRange=last_30_days&health=1
        │       /dashboard/{slug}/reports?section={report}&dateRange=last_30_days&health=1
        ├─ fetch each URL with a minted INTERNAL_ADMIN service cookie
        │     (reuses the cache-warm cookie-minting logic)
        │     └─ page renders in health mode:
        │          - collector context established at page root
        │          - cached() pushes {vendor,fn,client,ok,error} into collector
        │          - sections rendered awaited (no Suspense streaming) for
        │            deterministic document order
        │          - <ReportHealthBeacon> appends:
        │              <script id="report-health" type="application/json">
        │                { "sections": [ { "section": "ga4",
        │                                  "sources": [ {vendor,fn,ok,error} ] } ] }
        │              </script>
        ├─ for each URL: parse beacon + HTTP status → unit status (ok | down)
        ├─ diff vs health_state table → keep only transitions
        └─ post transitions to Slack webhook; upsert health_state
```

### Unit of health

`(surface, clientSlug, section)`. **down** if any of:

- HTTP status is not 2xx/3xx, or the fetch threw;
- the beacon reports ≥1 failed data source in that section;
- the beacon is missing entirely (page did not render far enough to emit it).

Otherwise **ok**.

## Components

### New

- **`lib/health/collector.ts`** — request-scoped collector built on
  `AsyncLocalStorage`.
  - `runWithCollector(fn)` — establishes a fresh collector for a render.
  - `recordFetch({ vendor, fn, client, ok, error })` — push a record if a
    collector is active; **no-op when none is active** (normal traffic).
  - `getCollected()` — return the accumulated records.

- **`<ReportHealthBeacon>`** (server component) — when health mode is on,
  reads `getCollected()` and renders the inline JSON `<script id="report-health">`
  tag. Renders nothing in normal mode.

- **`app/api/health/sweep/route.ts`** — the cron crawler. Auth via
  `Bearer CRON_SECRET` (same pattern/route shape as
  [`app/api/cache-warm/route.ts`](../../../app/api/cache-warm/route.ts)).
  `export const dynamic = 'force-dynamic'`, `export const maxDuration = 60`.
  Builds URLs, crawls in parallel, parses beacons, diffs, posts, upserts.

- **`lib/health/slack.ts`** — `postHealthChanges(transitions)` formats and
  POSTs to `SLACK_HEALTH_WEBHOOK_URL`. Failure is logged, not thrown.

- **`health_state` table** in [`lib/db/schema.ts`](../../../lib/db/schema.ts)
  + a query helper in [`lib/db/queries.ts`](../../../lib/db/queries.ts) and a
  Drizzle migration under `/drizzle`.

### Touched (minimal)

- **`lib/cache.ts`** — inside the existing success and catch branches, also call
  `recordFetch(...)` with the same `{vendor, fn, ok, error}` it already computes,
  plus the `client` tag from `extractTags`. No change to caching or return
  behavior; purely additive observation.

- **Report page composition** (the `/dashboard/[clientSlug]/reports` and
  `/portal/[clientSlug]/reports/[reportSlug]` render path) — when
  `searchParams.health === '1'`:
  - wrap the render in `runWithCollector`,
  - render sections **awaited (no `<Suspense>` streaming)** so the trailing
    beacon captures a complete collector in deterministic document order,
  - append `<ReportHealthBeacon>`.

  Normal traffic (no `health` flag) is **unchanged** and keeps streaming.

## State table & change detection

```sql
health_state (
  key         text primary key,   -- `${surface}:${clientSlug}:${section}`
  status      text not null,       -- 'ok' | 'down'
  detail      text,                -- last error summary, e.g. "GA4: Missing env var ..."
  since       timestamptz,         -- when it entered the current status
  updated_at  timestamptz
)
```

Per sweep, for each probed unit:

1. Look up stored status by `key`.
2. If no row exists → **seed silently** as the observed status (treat first
   sighting as the baseline; the initial backfill must not spam Slack).
3. If stored status differs from observed → it's a **transition**; include it in
   the Slack message; set `since = now`.
4. Upsert the row (`status`, `detail`, `updated_at`, and `since` on change).

Only transitions are sent. No transitions → no Slack message.

Units present in the table but **not probed** this run (e.g. a report was
disabled) are left untouched in v1 (no "stale" handling).

## Slack output

Changes-only, grouped, one message per sweep:

```
Health changes — 14:15
🔴 acme · portal · GA4 — data fetch failed (Missing env var GA4_…)
🔴 acme · dashboard · GA4 — data fetch failed (…)
✅ globex · portal · Meta Ads — recovered
```

Silent when there are no transitions.

## Error handling

- The sweep is resilient: a single URL fetch failure is recorded as that unit's
  status (down), never aborts the run.
- A Slack POST failure is logged (`console.error`) and does not fail the sweep —
  but state is still upserted so we don't re-alert next run. (Acceptable: a
  missed Slack post is rare; re-alerting on the next genuine change still works.)
- `recordFetch()` is null-safe: with no active collector it is a no-op, so the
  instrumentation in `cached()` carries **zero risk** to live, non-health
  traffic.

## Testing

- **Differ** (pure unit tests): `ok→down`, `down→ok`, no-change, first-seen
  (silent seed). The differ takes `(stored[], observed[])` and returns
  `(transitions[], upserts[])` with no I/O.
- **Beacon parser**: given an HTML string with / without the
  `report-health` script tag, returns the parsed sections or "missing".
- **Sweep integration**: mocked `getAllClients()` returning two clients, one
  whose crawl returns a passing beacon and one a failing beacon; assert the
  correct transitions and Slack payload, and that a non-2xx page is treated as
  down.

## Configuration

```env
SLACK_HEALTH_WEBHOOK_URL=    # Slack incoming webhook for the internal health channel
CRON_SECRET=                 # already exists; reused for sweep auth
```

`vercel.json` cron entry:

```json
{ "crons": [ { "path": "/api/health/sweep", "schedule": "*/15 * * * *" } ] }
```

## Out of scope (future)

- Empty-but-successful detection (fetch ok, zero rows).
- Pure client-side render exceptions caught by the React error boundary
  (current design captures the dominant server-side fetch-failure mode).
- Stale-unit cleanup when a report is disabled.
- A health status dashboard UI (Slack-only for now).
- De-duplication / flap suppression beyond the simple transition model.
```