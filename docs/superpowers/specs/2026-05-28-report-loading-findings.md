# Report Loading Findings — 2026-05-28

Captured via the profiling tooling built per [2026-05-28-report-loading-profiling-design.md](2026-05-28-report-loading-profiling-design.md).

## Run metadata

- Environment: local prod build (`next build && next start`)
- Date range used: `last_30_days`
- Walker: sequential, all clients × all `enabledReports`
- Total PERF entries captured: 102
- Caveat: local-network latency to vendor APIs differs from Vercel-network latency. Numbers are **relative signal**, not production SLO.

## Raw analyzer output

```
Parsed 102 PERF entries from perf.log

Table 1 — Per vendor call (sorted by p95 desc)
vendor          fn                          n      median    p95       max       err
hubspot         getContactStats             1      3.13s     3.13s     3.13s     0
ga4             runReport                   33     364ms     1.49s     2.02s     0
hubspot         getPipelineDeals            2      1.03s     1.24s     1.26s     0
db              getClientByEmail            2      720ms     1.13s     1.18s     0
hubspot         getYearlyContactStats       1      262ms     262ms     262ms     0
hubspot         getOwnerMap                 1      186ms     186ms     186ms     0
db              getAllClients               10     48ms      176ms     268ms     0
peec            getOverview                 1      63ms      63ms      63ms      1
db              getClientBySlug             44     0ms       59ms      170ms     0
hubspot         getClient                   6      0ms       1ms       1ms       0
hubspot         getContactBreakdown         1      0ms       0ms       0ms       0

Table 3 — Per vendor totals (sorted by total wait desc)
vendor          total_calls   total_wait    median
ga4             33            16.82s        364ms
hubspot         12            5.65s         1ms
db              56            2.90s         1ms
peec            1             63ms          63ms
```

(Table 2 omitted — see "Tooling caveat" below; the section-boundary heuristic produced too many spurious 1-fetch sections to be useful in this run.)

## Top offenders

1. **`ga4/runReport` — biggest aggregate spend.** 33 calls totaling 16.82s, median 364ms, p95 1.49s, max 2.02s. This is the GA4 19-call fan-out per render the design predicted. The slowest single GA4 call sets the floor for every GA4-driven report.
2. **`hubspot/getContactStats` — single-call outlier at 3.13s.** Largest single observation in the whole run. Worth opening up to see whether it's a quota/throttling issue, a large date range, or a slow endpoint.
3. **`hubspot/getPipelineDeals` at ~1.03s median (2 calls).** Paginated deal search across pipeline `714699412`; pagination is sequential which compounds.
4. **`db/getClientByEmail` at 720ms median.** This is on the **auth path** — runs on every authenticated request. Neon serverless shouldn't be this slow; likely cold-connection warm-up or a missed index, but worth confirming. If real, every request pays this tax.
5. **HubSpot performance section appears to be effectively sequential** — one section showing 9 fetches, 4.66s wall, sum 4.66s, parallelism 1.0x. The calls should be parallelized via `Promise.all`.

## Things that are NOT a problem

- **GA4 parallelism is working.** The biggest GA4 section shows 14 fetches, 2.02s wall, sum 9.22s — that's 4.6x parallelism, meaning the `Promise.all` is doing its job. The remaining slowness is the slowest single call, not lost parallelism.
- **`db/getClientBySlug` is fast.** 44 calls, median 0ms (cache hits dominating), max 170ms. The `React.cache()` dedup is working well per render.

## Anomalies worth flagging

- **`peec/getOverview` errored (err=1) and only ran once.** Pre-existing issue per `TODO.md`? Single-call sample so can't characterize timing.
- **`db/getClientByEmail` 720ms median** is much higher than expected for a Neon serverless query. Could be auth-path cold start. Worth a targeted check.

## Tooling caveat — Table 2 section grouping

The `perSection` heuristic in `scripts/perf-report.ts` infers section boundaries from `db/getClientBySlug` calls. In practice `getClientBySlug` is `React.cache()`-wrapped, so it logs ~0ms after first call per render and the grouping breaks down into many spurious 1-fetch "sections." The meaningful aggregations are still readable in Tables 1 and 3.

If we want clean per-section numbers in the next iteration, we'd need to promote to the Option B design (section-level wraps with `AsyncLocalStorage` request IDs). For now Tables 1 + 3 give us the actionable signal.

## Recommended next actions

Frame each as a candidate brainstorm — implementation work is **not** part of this profiling pass.

1. **HubSpot performance section parallelization brainstorm.** The 9-call, 1x-parallelism section is the easiest win — likely a `for...await` pattern in `components/report-sections/hubspot-performance/index.tsx` that should become a `Promise.all`. Likely a single-PR fix.

2. **HubSpot `getContactStats` deep-dive.** Why 3.13s? Read the implementation, check the date range, see if there's a smaller version of the same query that satisfies callers.

3. **DB `getClientByEmail` auth-path investigation.** Confirm whether the 720ms median is real or a measurement artifact (cold connection on first walker request). If real, options include: warm the connection in middleware, denormalize the email→role lookup into a smaller table, or cache the JWT-baked role longer.

4. **GA4 — the larger conversation.** With 16.82s aggregate spend and an already-parallelized fan-out, the remaining lever is **fewer calls** or **faster calls**. Two paths from TODO.md:
   - Per-vendor caching layer (cheaper, smaller change).
   - The BigQuery consolidation (much bigger change, much bigger win — Supermetrics already populates some GA4 tables there for FFCI).

5. **(Optional) Tooling iteration.** If the next session wants clean per-section numbers, promote to the Option B design from the spec — section-level wraps with `AsyncLocalStorage` request IDs.

## Pointers

- Profiling design: [2026-05-28-report-loading-profiling-design.md](2026-05-28-report-loading-profiling-design.md)
- Implementation plan: [../plans/2026-05-28-report-loading-profiling.md](../plans/2026-05-28-report-loading-profiling.md)
- Tool entry points: `lib/perf.ts` (helper), `scripts/perf-walk.ts` (walker), `scripts/perf-report.ts` (analyzer)
- TODO.md context: "Analytics consolidation onto BigQuery" under "Larger initiatives"
