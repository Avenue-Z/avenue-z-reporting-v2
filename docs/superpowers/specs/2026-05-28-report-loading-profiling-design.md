# Report Loading Profiling — Design

**Date:** 2026-05-28
**Status:** Design approved, ready for implementation plan
**Author:** Brainstorm between Paul and Claude

---

## Goal

Measure where time is spent during report-page rendering, so subsequent optimization work can be targeted at the actual bottlenecks instead of guessed at.

This design is for the **profiling pass only**. It explicitly does not include any fix to a slow report. Findings from running the tooling described here become the input to a separate brainstorm.

## Context

Per `TODO.md` ("Analytics consolidation onto BigQuery"), report sections "hit live vendor APIs on every page request, causing 1–3s page loads." Spot-reading the report sections confirms the shape: each section is an async React Server Component that does a single `Promise.all([...])` of vendor API calls and awaits the whole batch before any markup streams. `components/report-sections/ga4/index.tsx` alone fires ~19 GA4 Data API calls per render. The slowest call in any section's `Promise.all` sets the floor for that section.

The BigQuery consolidation is the eventual answer, but it is a large initiative with its own design. Before committing to it (or to any cross-cutting cache layer, or to per-vendor optimizations), we want data on where time is actually going.

## What we need to learn

1. **Per vendor call:** which functions are slow (median / p95 / max), and which clients or date ranges trigger the worst cases.
2. **Per report section:** total render-to-data wall time — the "headline number" a user feels.
3. **Wait vs. compute:** is time spent in vendor I/O, or in post-fetch processing inside the report section?
4. **Parallelism quality:** are any `Promise.all` batches accidentally serialized? How close are they to the slowest-single-call floor?

## Non-goals

- Fixing any specific report. Profile → findings doc → separate brainstorm → fix.
- The BigQuery consolidation initiative.
- Production observability / OpenTelemetry / Vercel Analytics. If findings show we need ongoing monitoring, that's a follow-up.
- Serverless / Vercel cold-start measurement. Local prod build does not surface this.
- Hydration or interactivity measurement. This profiles server-side render only.

## Approach

A small, gated, vendor-layer instrumentation library plus two scripts: one to drive a captured run, one to summarize the captured log.

We considered two alternatives and rejected them:

- **Section + vendor instrumentation with `AsyncLocalStorage` request IDs.** Richer hierarchical data, but ~28 extra files touched for marginal gain over vendor-layer + browser TTFB. We can promote to this later if findings show meaningful in-section compute time.
- **OpenTelemetry via `instrumentation.ts` / `@vercel/otel`.** Reusable for production observability, but doesn't see inside vendor SDKs without manual spans anyway, and the collector setup is overkill for a one-shot pass.

## Design

### `lib/perf.ts` — the helper

One exported function:

```ts
export function timed<TArgs extends unknown[], TRet>(
  vendor: string,
  fn: string,
  impl: (...args: TArgs) => Promise<TRet>,
): (...args: TArgs) => Promise<TRet>
```

`timed('ga4', 'runReport', ga4Query)` returns a wrapped function. On every call it records `performance.now()`, runs the wrapped function, and emits one JSON line to stdout when `PERF_LOG=1`:

```
PERF {"ts":"2026-05-28T18:42:11.043Z","vendor":"ga4","fn":"runReport","client":"renaissance","ms":842,"ok":true,"dateRange":"2026-04-28,2026-05-28"}
```

Properties:
- Gated on `process.env.PERF_LOG === '1'`. When off: zero work beyond a single env check per call.
- Fixed `PERF` prefix — greppable and easy for the analyzer to parse.
- Extracts `clientSlug` and `dateRange` from the wrapped function's arguments for tagging. The exact extraction mechanism (positional lookup table inside the helper vs. an optional per-call extractor function passed to `timed()`) is an implementation choice for the plan. Either way, when a field can't be derived, it is omitted from the log line rather than guessed.
- Logs to stdout. `next start` already streams to the terminal; `tee perf.log` captures it. No extra transport.
- Errors are caught, logged with `ok: false`, and re-thrown unchanged.

### Instrumentation surface

Wrap every exported async function in each vendor client.

| File | Wrap targets |
|---|---|
| `lib/ga4/client.ts` | `ga4Query` (single fan-out point — covers all 19 calls in GA4) |
| `lib/hubspot/client.ts` | every exported `get*` |
| `lib/peec/client.ts` | `getPeecOverview` and any other exported fetchers |
| `lib/profound/client.ts` | `getProfoundOverview` and any other exported fetchers |
| `lib/gsc/` | exported fetchers |
| `lib/bigquery/` | query runner |
| `lib/sitebulb/` | exported fetchers |
| `lib/screaming-frog/` | exported fetchers |
| `lib/pr-proof/` | exported fetchers |
| `lib/content-calendar/` | exported fetchers |
| `lib/platforms/` | exported fetchers |
| `lib/db/queries.ts` | `getClientBySlug`, `getClientByEmail`, `getAllClients` |

Out of scope: report-section components, chart components, `auth.ts`, `proxy.ts`.

**Wrapping pattern** (applied at each call site):

```ts
// before
export async function ga4Query(params: GA4QueryParams) { ... }

// after
async function ga4QueryImpl(params: GA4QueryParams) { ... }
export const ga4Query = timed('ga4', 'runReport', ga4QueryImpl)
```

The implementation body is renamed to `*Impl`, the public export becomes the wrapped version. Imports elsewhere keep working unchanged.

### Capture workflow

```bash
# 1. build prod, start with perf logging
PERF_LOG=1 npm run build
PERF_LOG=1 npm run start 2>&1 | tee perf.log

# 2. walk every report for every client
PERF_SESSION_COOKIE='<paste from devtools>' tsx scripts/perf-walk.ts

# 3. analyze
tsx scripts/perf-report.ts perf.log
```

**`scripts/perf-walk.ts`** — drives the local server so we get a full data set in one shot. Reads all clients + their `enabledReports` from the DB, hits each `/portal/<slug>/reports/<report>` URL via `fetch` with the supplied session cookie, waits for the response, moves on. **Sequential** (not concurrent) so vendor calls aren't competing for bandwidth and skewing each other.

**Why a session cookie instead of programmatic sign-in:** Auth.js Credentials flow needs CSRF tokens and redirects that are annoying to script. Pasting a cookie once is the smallest thing that works for a one-time profiling pass.

**Why local prod build:** matches user request — strips dev-mode compile overhead, gives realistic numbers, while leaving vendor-API network latency on the local machine. That caveat is recorded in the findings doc, not in production claims.

### Analysis output

`scripts/perf-report.ts` reads the log (path from `argv[2]`), parses every `PERF {...}` line, and prints three plain-text tables to stdout.

**Table 1 — Per vendor call (the long tail), sorted by p95 desc:**
```
vendor    fn              n    median   p95     max    err
ga4       runReport      342    412ms   980ms  1842ms   0
hubspot   getDeals        18    688ms  1402ms  1788ms   1
peec      getOverview     14   1240ms  2100ms  2380ms   0
...
```

**Table 2 — Per report section (the headline number).** For each `(clientSlug, section)` window, wall = `max(end_ts) - min(start_ts)`, sum = `Σ ms`, parallelism = `sum / wall`:
```
section              client          fetches   wall      sum     parallelism
ga4                  renaissance        19    1.84s   12.40s    6.7x
peec-ai              renaissance         6    2.38s    5.20s    2.2x
hubspot-performance  avenue-z            4    1.79s    2.10s    1.2x
```
Parallelism ≈ 1.0x means effectively serial; ≥5x means parallelism is saturated and the slowest single call is the floor.

**Table 3 — Per vendor totals (where to invest), sorted by total_wait desc:**
```
vendor      total_calls   total_wait    median
peec            42            48.2s     1180ms
ga4            342            142s       410ms
hubspot         54             32.1s     620ms
```

Section grouping in Tables 2 + 3 is inferred from log timestamps: contiguous log lines for a single `(clientSlug, dateRange)` between a `getClientBySlug` entry and the next one belong to the same section render. (Walker is sequential, so this is unambiguous.) If that turns out to be too fragile in practice, we add a section tag via an `AsyncLocalStorage` request-context — but we don't pre-build that.

### Findings doc

After one walker + analyzer run, write `docs/superpowers/specs/<date>-report-loading-findings.md` capturing:
- Top 5 offending vendor calls (Table 1, top of list)
- Top 5 slowest section renders (Table 2, sorted by wall desc)
- Per-vendor aggregate spend (Table 3)
- Known caveat: local network ≠ Vercel network. Numbers are relative signal.
- Recommended next actions, framed as candidate brainstorms.

That doc becomes the input to whatever optimization brainstorm comes next.

## Cleanup

Everything described here stays in the repo after profiling:
- `lib/perf.ts` — small, gated, zero runtime cost off. Reusable next time something feels slow.
- `scripts/perf-walk.ts`, `scripts/perf-report.ts` — reusable tooling.
- `timed(...)` wrappers — zero runtime cost without `PERF_LOG=1`.

Nothing from the profiling work itself gets removed. Any fix it motivates is a separate PR.

## Open questions / risks

- **Section-grouping inference may be ambiguous** if a user has multiple report tabs open concurrently against the same client. Walker is sequential so this won't happen during automated runs; flagged as a risk if anyone runs the profiler against real user traffic later.
- **`getClientBySlug` is wrapped in `React.cache()`** for per-render dedup. The first call inside a render gets timed; subsequent cache hits inside the same render aren't seen as separate fn calls. Fine — that's the behavior we want to measure.
- **Some vendor clients may not expose a single fan-out function** (unlike GA4). In those cases we wrap each exported `get*`; instrumentation surface widens proportionally. Confirmed at implementation time by reading each file.
