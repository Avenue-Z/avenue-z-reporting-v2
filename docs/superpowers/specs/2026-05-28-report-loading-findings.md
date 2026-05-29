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
4. **`db/getClientByEmail` at 720ms median (n=2, suggestive only).** This is on the **auth path** — runs on every authenticated request. Neon serverless shouldn't be this slow; likely cold-connection warm-up on the first walker request, or a missed index. n=2 means median ≈ mean of two samples, so the headline number is suggestive rather than characterized. Worth a targeted re-measurement before acting.
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

## Caching results (2026-05-29 — perf/report-loading-fixes branch)

After the vendor-layer caching design from [2026-05-28-vendor-caching-design.md](2026-05-28-vendor-caching-design.md) was implemented per [the plan](../plans/2026-05-28-vendor-caching.md).

### Methodology

- Same local prod build (`next build && PERF_LOG=1 next start`), single walker pass-pair.
- Walker (`scripts/perf-walk.ts --pass cold|warm`) hits `/api/perf/boundary?label=<pass>` before walking, so `perf-compare.ts` splits cold/warm deterministically.
- Session cookie was minted directly via `@auth/core/jwt.encode()` against `AUTH_SECRET` instead of browser sign-in (deviation from plan Step 2 — the result is functionally identical).
- Walker iterated 2 clients × `enabledReports` = 8 URLs per pass.

### Bug fixed mid-verification

The boundary route lived at `app/api/_perf/boundary/` from commit f630b46. App Router treats folders prefixed with `_` as private (excluded from routing), so the boundary URL 404'd despite `PERF_LOG=1`. Renamed to `app/api/perf/boundary/` and updated the two references in `scripts/perf-walk.ts`. The `PERF_LOG=1` gate inside the route still provides the "only exists when profiling is on" guarantee.

### Results

```
Parsed 45 cold + 31 warm entries from perf-cache.log

vendor          cold_wait   warm_wait   delta     hit_rate
ga4             13.48s      26ms        -100%     100%
hubspot         1.38s       1ms         -100%     100%
db              1.08s       1.06s       -2%       0%
```

### Observations

- **GA4 caching works perfectly.** 13.48s cold → 26ms warm (-100%, 100% hit rate). This is the headline win — GA4 was the biggest aggregate spend in the original profiling.
- **HubSpot caching works perfectly.** 1.38s cold → 1ms warm (-100%, 100% hit rate). But this was only 2 calls (`getOwnerMap`, `getPipelineDeals`) — see coverage gap below.
- **`db` 0% hit rate is expected.** `getClientBySlug` / `getAllClients` are wrapped with `React.cache()` (per-render dedup) only, not `cached()` (cross-render). Plan acknowledged leaving inner React cache alone. -2% delta is noise.
- **Cross-client smoke: PARTIAL.** The walker hit both `avenue-z` and `renaissance` portal URLs without errors, and the GA4 cold calls in the log are correctly tagged with `client:"avenue-z"`. No cross-client contamination observed in the surfaces that actually rendered. Full visual smoke wasn't performed.

### Coverage gap — verification under-exercises the cache surface

The portal route's `getReportSection` switch in [app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:36](../../../app/portal/[clientSlug]/reports/[reportSlug]/page.tsx#L36) is missing cases for `demand-overview`, `peec-ai`, `inbound-funnel`, and `request-a-report` — those slugs are in `enabledReports`, the components exist, but the route falls through to `default: return null`. So those URLs returned 200 with an empty shell and never invoked their fetchers.

The dashboard route ([app/dashboard/[clientSlug]/reports/page.tsx](../../../app/dashboard/[clientSlug]/reports/page.tsx)) wires those report sections correctly. The walker only hits portal URLs, so:

- `peec`, `bigquery`, `profound`, and 16 of 18 HubSpot fetchers were never invoked during the cold/warm walk.
- The 8/8 ok / 4.1s cold elapsed reflects mostly empty shells (~60ms each) plus the two pages that do render (`/ga4` and `/hubspot-performance`).

The caching layer is verified for the surfaces that did exercise it. The rest is unverified by this run, not broken.

### Outstanding items

1. ~~**Portal report route is missing 4 cases.**~~ Done in this branch — `demand-overview`, `peec-ai`, `inbound-funnel`, `request-a-report` now wired into the portal switch (base cases; subsections still dashboard-only).
2. ~~**Re-run cold/warm after the route gap is closed.**~~ Done — see Round 2 below.
3. ~~**Walker should optionally cover dashboard routes too.**~~ Done — `scripts/perf-walk.ts` now accepts `--surface portal|dashboard|both`.
4. **HTTP response times reported by the walker are not wall-clock data wait.** Streaming RSC + Suspense closes the initial chunk fast (~60-200ms) while cached fetches continue. The PERF log between boundaries is the correct measurement surface; the walker's per-URL ms column is informational only.

## Caching results — Round 2 (2026-05-29 — extended coverage)

Re-run after closing the portal route coverage gap and adding `--surface both` to the walker. Same prod build, same methodology as Round 1.

### Methodology

- `npx tsx scripts/perf-walk.ts --pass cold --surface both` then `--pass warm --surface both`.
- 16 URLs per pass (2 clients × 6 portal + 8 dashboard reports — note enabledReports lists vary by client).

### Results

```
Parsed 112 cold + 102 warm entries from perf-cache.log

vendor          cold_wait   warm_wait   delta     hit_rate
peec            13.79s      28ms        -100%     100%
profound        9.19s       22ms        -100%     100%
hubspot         7.32s       4ms         -100%     100%
ga4             7.09s       62ms        -99%      100%
db              3.63s       1.72s       -52%      0%
```

### Observations

- **All four `cached()`-wrapped vendors hit 100% hit rate with -99% or -100% delta.** Peec, profound, and hubspot were not exercised at all in Round 1 — they are now and they behave the same as ga4. The `cached()` pattern is uniform across vendors.
- **Peec was the biggest single hidden win.** 13.79s cold spend → 28ms warm. Round 1 missed this entirely.
- **`db` shows -52% delta but still 0% hit rate.** Expected — React.cache only. The improvement is connection warm-up (cold pass first hit pays the Neon serverless cold start), not caching.
- **BigQuery still not exercised** — only `components/report-sections/conversational-summary` imports it, and that section isn't in any client's `enabledReports`. Out of scope for this walker until a client enables it.
- **Cross-client smoke (round 2).** Both clients walked clean on both surfaces, no errors. PERF log shows correct `client:` tags on per-client fetches. No cross-client contamination observed.

### What's left

- Portal subsections for `peec-ai` (pr-influence, content-impact, technical-audit), `inbound-funnel` (forms, pacing), and `ga4` (conversion-journey, search-console) are still dashboard-only. They use the same `cached()` fetchers under the hood, so caching should behave identically — but it's untested at the portal surface. Decide whether portal should expose them or stay scoped.
- BigQuery's `conversational-summary` section has wraps but no walker coverage; if it ever becomes an enabled report, re-run.
