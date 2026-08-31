import { describe, expect, test, vi, beforeEach, afterEach, type Mock } from 'vitest'
// pipeline.ts imports ./base (-> lib/db -> next-auth); mock it so jsdom can load
// the module, same pattern as lib/linkedin/kpis.dash.test.ts. Kept in a separate
// file from pipeline.test.ts so this mock never touches the pure-function tests.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))
// pipeline.ts also reads the client directly (for salesforceConfig.wonStageName),
// separately from base.ts's own internal getClientBySlug call for the account id.
// The real getClientBySlug hits Next.js's unstable_cache, which throws outside a
// request context, so it must be mocked here too.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
// The four queries are now each wrapped in cached() individually (see the
// per-query caching test below), so the wrappers sit BETWEEN the composer and
// the mocked salesforceQuery and every test in this file would hit them.
// cached() calls Next's unstable_cache, which throws ("Invariant:
// incrementalCache missing") outside a real request context — exactly what
// every test here is. Replacing cached() with a pass-through is precisely what
// CACHE_DISABLE=1 does in production (lib/cache.ts), so the orchestration under
// test is unchanged; only the cache/perf/health shell is removed.
//
// Two records, because "a wrapper was built" and "the composer goes through it"
// are different claims and only the second one is the property that matters.
// cachedRegistry captures each cached() call at module load (with its options,
// so the health severity of a fetcher is pinned too); cacheCalls captures every
// invocation that actually passes through a wrapper during a render.
//
// The distinction is not theoretical. An earlier version of this file asserted
// on the registry alone, and swapping getOpenStages(slug) for openStagesImpl(slug)
// in the composer — which disables caching for that query outright — left all
// twenty tests green, because the `const getOpenStages = cached(...)` line still
// ran and still registered.
//
// The registry also keeps the IMPL each wrapper was built around. That is what
// lets a test ask the question the two records above cannot: is the value
// handed to cached() a rejection or a caught null? Moving a `.catch` from the
// composer into an impl is a one-line edit that leaves every other test in this
// file green while restoring the outage — unstable_cache stores the fulfilled
// null and replays it for the full hour.
const { cachedRegistry, cacheCalls } = vi.hoisted(() => ({
  cachedRegistry: [] as Array<{
    vendor: string
    fn: string
    options: Record<string, unknown>
    impl: (...a: unknown[]) => unknown
  }>,
  cacheCalls: [] as string[],
}))
vi.mock('@/lib/cache', () => ({
  cached: (
    vendor: string,
    fn: string,
    impl: (...a: unknown[]) => unknown,
    options: Record<string, unknown> = {},
  ) => {
    cachedRegistry.push({ vendor, fn, options, impl })
    // A DISTINCT function, never `impl` itself: the composer calling the impl
    // directly has to be observably different from it calling the wrapper, or
    // the test below cannot tell the two apart. Beyond the record it is a
    // pass-through, which is exactly what CACHE_DISABLE=1 does in production,
    // so the orchestration under test is unchanged.
    return (...args: unknown[]) => {
      cacheCalls.push(fn)
      return impl(...args)
    }
  },
}))
// These tests import the internal ...Impl directly, per the pattern the
// composer is built around (see lib/hubspot/client.ts): it is the plain,
// uncached orchestration, and calling it exercises the same logic a render does.
import {
  getSalesforcePipelineImpl as getSalesforcePipeline,
  // The public export, imported under its own name so the composite-uncached
  // test can compare the two by identity rather than by string.
  getSalesforcePipeline as exportedPipeline,
  openWindow,
} from './pipeline'
const EXPECTED_OPEN_WINDOW = openWindow()
import { salesforceQuery, resolveCompareIso } from './base'
import { getClientBySlug } from '@/lib/db/queries'

const stageRow = (
  stage: string,
  count: number,
  amount: number,
  probability = 25,
  isClosed = false,
) => ({
  opportunity_stage_name: stage,
  opportunity_is_closed: isClosed,
  opportunity_probability: probability,
  opportunity_count: count,
  opportunity_amount: amount,
})

const ownerRow = (owner: string, count: number, amount: number) => ({
  opportunity_owner: owner,
  opportunity_is_closed: false,
  opportunity_count: count,
  opportunity_amount: amount,
})

describe('getSalesforcePipeline', () => {
  // Most fixtures in this file are orchestration fixtures (truncation, compare
  // degrade, owner fetch failure, etc.) that don't bother including a stage
  // matching the default 'Closed Won' literal, so the no-match warn added for
  // FIX 2 fires incidentally in several tests here. That warn is legitimate
  // (it is not what these tests are asserting on), so it is silenced rather
  // than asserted, keeping suite output pristine without weakening any
  // existing assertion. transformPipeline's own no-match warn behavior is
  // covered directly in pipeline.test.ts.
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Default: no client row (or no salesforceConfig), so wonStage falls back to
    // the default 'Closed Won' unless a test overrides this. Every stageRow fixture
    // below already uses 'Closed Won' as its won stage, so this default keeps all
    // the pre-existing tests passing while it flows through unmocked.
    ;(getClientBySlug as Mock).mockResolvedValue(null)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  test('open and owner queries use the wide created-date window and settings, never year_to_date on the close-date basis', async () => {
    // The regression this guards: the open tiles were windowed by close-date
    // year_to_date (the connector default), showing only the overdue subset. This
    // asserts every call's dateRange and settings directly, rather than relying on
    // a fixture value that would pass either way.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    const calls: Array<{ fields: string[]; dateRange: string; opts: { settings?: Record<string, unknown>; maxRows?: number } }> = []
    ;(salesforceQuery as Mock).mockImplementation(
      (_slug: string, fields: string[], dateRange: string, opts: { settings?: Record<string, unknown>; maxRows?: number }) => {
        calls.push({ fields, dateRange, opts })
        if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
        return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
      },
    )
    await getSalesforcePipeline('acme')
    expect(calls).toHaveLength(4) // open, won-current, won-prior, owner

    const openCall = calls.find((c) => !c.fields.includes('opportunity_owner') && c.dateRange === EXPECTED_OPEN_WINDOW)
    expect(openCall).toBeDefined()
    expect(openCall!.opts.settings).toEqual({ deal_date_field: 'deal_created', convert_to_default_currency: false })

    const ownerCall = calls.find((c) => c.fields.includes('opportunity_owner'))
    expect(ownerCall!.dateRange).toBe(EXPECTED_OPEN_WINDOW)
    expect(ownerCall!.opts.settings).toEqual({ deal_date_field: 'deal_created', convert_to_default_currency: false })

    const wonCurCall = calls.find((c) => !c.fields.includes('opportunity_owner') && c.dateRange === 'year_to_date')
    expect(wonCurCall).toBeDefined()
    expect(wonCurCall!.opts.settings).toEqual({ deal_date_field: 'deal_closed', convert_to_default_currency: false })

    const wonPriorCall = calls.find((c) => !c.fields.includes('opportunity_owner') && c.dateRange === '2025-01-01,2025-12-31')
    expect(wonPriorCall).toBeDefined()
    expect(wonPriorCall!.opts.settings).toEqual({ deal_date_field: 'deal_closed', convert_to_default_currency: false })

    // No stage-fields call may combine year_to_date with the created-date open
    // settings: that is exactly the bug (open tiles windowed by close-date YTD).
    const openWindowedByYtd = calls.find(
      (c) =>
        !c.fields.includes('opportunity_owner') &&
        c.dateRange === 'year_to_date' &&
        c.opts?.settings?.deal_date_field === 'deal_created',
    )
    expect(openWindowedByYtd).toBeUndefined()
  })

  test('gives every Salesforce query a timeout above smQuery\'s 15s hang guard, won queries included', async () => {
    // The won queries were the last two left on smQuery's 15s default, on the
    // reasoning that only the wide created-date queries were slow enough to
    // need more. Staging disproved that: the closed-won query aborted at
    // exactly 15000ms on 2026-08-26 AND 2026-08-27, while the two queries that
    // had been given headroom never failed once.
    //
    // The reason is that the 15s budget is not a network budget. The abort
    // timer is armed before the fetch and res.json() runs inside the same
    // window (lib/supermetrics/client.ts), so connect + transfer + parse + any
    // time the continuation spends waiting on a busy event loop all count
    // against it. On a CPU-pressured serverless function that aborts a query
    // whose response actually arrived in ~2s, which is what these measure
    // uncontended and at 16 in flight.
    //
    // Raising all four costs nothing in worst-case page latency: they run
    // concurrently in one Promise.all, so the ceiling was already the wide
    // queries' 60s. A genuinely hung connector still fails, just later.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    const calls: Array<{ fields: string[]; dateRange: string; timeoutMs?: number }> = []
    ;(salesforceQuery as Mock).mockImplementation(
      (_slug: string, fields: string[], dateRange: string, opts: { timeoutMs?: number }) => {
        calls.push({ fields, dateRange, timeoutMs: opts?.timeoutMs })
        return Promise.resolve([])
      },
    )
    await getSalesforcePipeline('acme')

    expect(calls).toHaveLength(4) // open, won-current, won-prior, owner
    for (const c of calls) expect(c.timeoutMs).toBeGreaterThan(15_000)

    // Named explicitly so a regression that reverts only the won queries — the
    // exact shape of the bug — fails here rather than passing on the other two.
    const won = calls.filter((c) => c.dateRange !== EXPECTED_OPEN_WINDOW)
    expect(won).toHaveLength(2)
    for (const c of won) expect(c.timeoutMs).toBeGreaterThan(15_000)
  })

  test('caches each query separately, so one failure cannot poison the other three', () => {
    // The hour-long outage this prevents (staging, 2026-08-26 16:32): the open
    // query 500'd and the closed-won query timed out while the owner query
    // succeeded. A partial degrade is still a FULFILLED result, so cached()
    // stored the degraded object over a good entry and served four dashed tiles
    // for the rest of the TTL, long after the vendor recovered. Retrying 5xx
    // makes that rarer; it cannot make it impossible, because any single query
    // failing for a reason retries cannot cure does the same thing again.
    //
    // Caching each query on its own entry removes the shared fate: a query that
    // throws is simply not stored (unstable_cache writes nothing for a rejected
    // call), so the next render retries that one query while the other three
    // serve warm. The composite must NOT be cached, or the poisoning is back.
    //
    // Structural rather than behavioural on purpose: the property under test is
    // where the cache boundary sits, and unstable_cache's real store cannot be
    // exercised outside a request context.
    // Exact, not arrayContaining: a set that merely CONTAINS the four is also
    // satisfied by a fifth entry wrapping the composer, which is the one thing
    // this test exists to forbid.
    const fns = cachedRegistry.filter((c) => c.vendor === 'salesforce').map((c) => c.fn).sort()
    expect(fns).toEqual(['openStages', 'ownerRows', 'wonStages', 'wonStagesCompare'])

    // Identity, not name. The previous version asserted the registry held no
    // entry called 'getSalesforcePipeline', which any other label sails past —
    // `cached('salesforce', 'pipeline', getSalesforcePipelineImpl)` restores the
    // shared fate with the whole suite green. Comparing the export to the impl
    // cannot be fooled: a wrapper is a different function object, whatever it
    // is registered as.
    expect(exportedPipeline).toBe(getSalesforcePipeline)
  })

  test('hands cached() a rejection, never a caught null: the .catch stays outside the wrapper', () => {
    // The invariant the whole split rests on, and the one no test covered.
    // unstable_cache stores nothing for a REJECTED call — that is the entire
    // mechanism by which a failed query no longer poisons an entry. It does
    // store a FULFILLED one, so a `.catch(() => null)` moved from the composer
    // down into an impl turns the failure back into cached data and replays the
    // outage for the full hour, with every other test in this file still green.
    //
    // Asserted on the impls the registry captured rather than on the composer,
    // because that is exactly the boundary in question: what cached() is handed.
    ;(salesforceQuery as Mock).mockRejectedValue(new Error('vendor 500'))
    const salesforce = cachedRegistry.filter((c) => c.vendor === 'salesforce')
    expect(salesforce).toHaveLength(4)
    return Promise.all(
      salesforce.map((c) =>
        // Both arities: the won impl takes (slug, range), the other two (slug).
        expect(c.impl('acme', '2025-01-01,2025-12-31')).rejects.toThrow('vendor 500'),
      ),
    )
  })

  test('routes every query through its wrapper, not past it to the bare impl', async () => {
    // The half of the property the registration check cannot see. Registering a
    // wrapper proves nothing if the composer then calls the impl directly, and
    // that swap is a one-word edit that silently disables caching for a query.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve([stageRow('Closed Won', 10, 1000, 100, true)])
    })
    cacheCalls.length = 0
    await getSalesforcePipeline('acme')
    // All four, including the compare window: each one that stops appearing here
    // is a query that has quietly left the cache and is re-fetched every render.
    expect(cacheCalls.sort()).toEqual(['openStages', 'ownerRows', 'wonStages', 'wonStagesCompare'])
  })

  test('keeps the compare fetch out of the health verdict, unlike the three that back tiles', () => {
    // The prior-year window only supplies the Closed Won delta, and the composer
    // documents its failure as costing exactly that. Once recordFetch moved down
    // onto the queries, a failure there would have entered the beacon's failed
    // set and made deriveStatus mark the whole Executive Overview down — paging
    // Slack over a missing arrow on a page that rendered every figure it owes.
    const bySeverity = (fn: string) =>
      cachedRegistry.find((c) => c.vendor === 'salesforce' && c.fn === fn)?.options.healthCritical
    expect(bySeverity('wonStagesCompare')).toBe(false)
    // Left undefined (cached() defaults it true) on the three whose failure does
    // dash a tile, so a real outage still reports.
    for (const fn of ['openStages', 'wonStages', 'ownerRows']) {
      expect(bySeverity(fn)).toBeUndefined()
    }
  })

  test('gives every Salesforce query a negative TTL far below the positive one', () => {
    // unstable_cache stores nothing for a rejected call, so without this a query
    // failing persistently is re-issued on every render and pays the full 60s
    // ceiling each time. Short enough that a blip cannot cost anything like the
    // hour it used to; long enough to stop the storm.
    for (const c of cachedRegistry.filter((c) => c.vendor === 'salesforce')) {
      expect(c.options.negativeTtlSeconds).toBe(60)
      expect(c.options.negativeTtlSeconds as number).toBeLessThan(3600)
    }
  })

  test('a failed owner fetch yields byOwner null, never an empty array', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.reject(new Error('owner query failed'))
      return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
    })
    const data = await getSalesforcePipeline('acme')
    // null means "not loaded"; [] means "genuinely no owners". A failed fetch
    // must read as the former, never collapse to the latter.
    expect(data.byOwner).toBeNull()
    expect(data.ownersTruncated).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce] owner fetch failed'), expect.any(Error))
    errorSpy.mockRestore()
  })

  test('a failed compare fetch still resolves, with deltas absent rather than the section failing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === '2025-01-01,2025-12-31') return Promise.reject(new Error('compare timeout'))
      return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.openDeals.value).toBe(10) // current value preserved
    expect(data.openDeals.delta).toBeUndefined()
    expect(data.totalPipeline.delta).toBeUndefined()
    expect(data.closedWon.delta).toBeUndefined()
    expect(data.weightedPipeline.delta).toBeUndefined()
    // The failure is logged, same convention as the owner-fetch failure below, not
    // just silently swallowed.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce] pipeline won-prior fetch failed'), expect.any(Error))
    errorSpy.mockRestore()
  })

  test('open tiles suppress delta while closedWon still computes one, end to end through a fetched compare set', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === '2025-01-01,2025-12-31') {
        // The compare window: a healthy, nonzero prior for every field, same
        // shape as the live 2025 data before deals had a year to close. If
        // suppression were bypassed at this layer (e.g. by not passing cmpRows
        // through), these nonzero priors would surface as real percentages.
        return Promise.resolve([
          stageRow('Proposal Released', 200, 10_000_000, 25),
          stageRow('Closed Won', 50, 20_000_000, 100, true),
        ])
      }
      return Promise.resolve([
        stageRow('Proposal Released', 10, 1000, 25),
        stageRow('Closed Won', 4, 40_000, 100, true),
      ])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.openDeals.delta).toBeUndefined()
    expect(data.totalPipeline.delta).toBeUndefined()
    expect(data.weightedPipeline.delta).toBeUndefined()
    expect(data.closedWon.delta).toBeCloseTo(((40_000 - 20_000_000) / 20_000_000) * 100, 4)
  })

  test('a successful path composes all four tiles plus owners, querying stages at STAGE_MAX_ROWS', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation(
      (_slug: string, fields: string[], _dateRange: string, opts: { maxRows?: number }) => {
        if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
        // A reverted bare 100 (instead of STAGE_MAX_ROWS = 500) fails this.
        expect(opts?.maxRows).toBe(500)
        return Promise.resolve([
          stageRow('Proposal Released', 10, 1000, 25),
          stageRow('Closed Won', 4, 400, 100, true),
        ])
      },
    )
    const data = await getSalesforcePipeline('acme')
    expect(data.openDeals.value).toBe(10)
    expect(data.totalPipeline.value).toBe(1000)
    expect(data.closedWon.value).toBe(400)
    expect(data.weightedPipeline.value).toBeCloseTo(250, 2) // 1000 * 0.25
    expect(data.byOwner).toEqual([{ owner: 'Owner A', count: 5, amount: 500 }])
    expect(data.ownersTruncated).toBe(false)
    expect(data.stageTruncated).toBe(false)
  })

  test('flags stage truncation when the stage query hits its cap', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    const cappedStageRows = Array.from({ length: 500 }, (_, i) => stageRow(`Stage ${i}`, 1, 100))
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve(cappedStageRows)
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.stageTruncated).toBe(true)
  })

  test('does not flag stage truncation when the stage query is under its cap', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.stageTruncated).toBe(false)
  })

  test('owner query uses the open scope wide window and OWNER_MAX_ROWS cap, and flags truncation end to end when it hits that cap', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    const cappedOwners = Array.from({ length: 500 }, (_, i) => ownerRow(`Owner ${i}`, 1, 10))
    ;(salesforceQuery as Mock).mockImplementation(
      (_slug: string, fields: string[], dateRange: string, opts: { maxRows?: number }) => {
        if (fields.includes('opportunity_owner')) {
          // Pins the owner query to the open scope's wide window and its own cap:
          // a reverted implementation pointing it at year_to_date or cmpIso
          // instead, or passing the wrong maxRows, would fail these rather than
          // passing silently against a one-row fixture like the earlier tests use.
          expect(dateRange).toBe(EXPECTED_OPEN_WINDOW) // the dynamic open window
          expect(opts?.maxRows).toBe(500) // OWNER_MAX_ROWS
          return Promise.resolve(cappedOwners)
        }
        if (dateRange === '2025-01-01,2025-12-31') return Promise.resolve([])
        return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
      },
    )
    const data = await getSalesforcePipeline('acme')
    // ownersTruncated: true is never produced anywhere else in this file: without
    // this case, a truncation flag that was always false would pass every other test.
    expect(data.ownersTruncated).toBe(true)
  })

  test('uses the client-configured won-stage label, end to end, instead of the hardcoded default', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({
      salesforceConfig: { salesforceAccountId: '00D000000000000EAA', wonStageName: 'Won - Custom' },
    })
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve([
        // Under the client's custom label, this row is the won one and the literal
        // 'Closed Won' row is not. A default-only implementation that ignores
        // wonStageName would count 400 (the 'Closed Won' row) instead of 900.
        stageRow('Won - Custom', 2, 900, 100, true),
        stageRow('Closed Won', 4, 400, 100, true),
      ])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.closedWon.value).toBe(900)
  })

  test('falls back to the Closed Won default when the client has no wonStageName configured', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue({
      salesforceConfig: { salesforceAccountId: '00D000000000000EAA' },
    })
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve([stageRow('Closed Won', 4, 400, 100, true)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.closedWon.value).toBe(400)
  })

  test('flags stage truncation when only the compare-window fetch hits its cap', async () => {
    // Current-period fetch is well under the cap; the compare fetch alone hits it.
    // Before the fix, stageTruncated only looked at the current-period length, so
    // this case (a truncated prior period undercounting prev.closedWon and
    // overstating the closedWon delta) shipped with no warning flag at all.
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    const cappedCmpStageRows = Array.from({ length: 500 }, (_, i) => stageRow(`Stage ${i}`, 1, 100))
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === '2025-01-01,2025-12-31') return Promise.resolve(cappedCmpStageRows)
      return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.stageTruncated).toBe(true)
  })

  test('surfaces unrecognised is_closed flags so the UI can caveat the tiles', async () => {
    // A garbled flag is failed CLOSED by toBool, so the deal silently leaves the
    // open tiles and, on a won-stage row, lands in closedWon. The console warn is
    // invisible to a dashboard reader; this count is what the UI renders a caveat
    // from. 'Yes' is deliberately included and must NOT count: the vocabulary was
    // widened to cover it.
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === 'year_to_date') {
        return Promise.resolve([{ ...stageRow('Closed Won', 4, 400, 100, true), opportunity_is_closed: 'Yes' }])
      }
      return Promise.resolve([{ ...stageRow('Proposal Released', 10, 1000), opportunity_is_closed: 'Closed' }])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.unrecognizedClosedFlags).toBe(1)
  })

  test('counts rows, not deals: the open and won windows overlap by design', async () => {
    // The open query (wide, created-date basis) and the won query (year to date,
    // close-date basis) both return the same deal when it was created and closed
    // this year, so one bad row can contribute more than once. That is why the
    // field is documented as a severity hint rather than a deal count; asserting
    // it here stops anyone "fixing" it into a silent dedup later.
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    const garbled = [{ ...stageRow('Closed Won', 4, 400, 100, true), opportunity_is_closed: 'Closed' }]
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve(garbled)
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.unrecognizedClosedFlags).toBe(2) // same row seen by the open and won queries
  })

  test('reports zero unrecognised flags when every row is clean', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.resolve([stageRow('Closed Won', 4, 400, 100, true)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.unrecognizedClosedFlags).toBe(0)
  })

  test('a failed open query degrades to unavailable open tiles, keeping closedWon and byOwner', async () => {
    // The open query spans about ten years on the created-date basis and is the
    // likeliest of the four to trip smQuery's 15s guard (observed live on the
    // owner query during the 2026-08-20 probe). Without a catch it throws
    // straight through, the section blanks via the error boundary, and the
    // closedWon and owner data that fetched fine is thrown away with it.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === 'year_to_date') return Promise.resolve([stageRow('Closed Won', 4, 400, 100, true)])
      return Promise.reject(new Error('Supermetrics request timed out after 15000ms'))
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.openUnavailable).toBe(true)
    expect(data.closedWon.value).toBe(400)      // still rendered
    expect(data.byOwner).toEqual([{ owner: 'Owner A', count: 5, amount: 500 }])
    expect(data.openDeals.value).toBe(0)        // 0 only because the flag says unavailable
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  test('throws when EVERY query fails, so a total outage is never cached as a result', async () => {
    // The incident this guards (staging, 2026-08-26): a transient socket failure
    // took all four queries down at once. Returning an all-unavailable object
    // makes that a successful RESULT, so cached() stored it and served four
    // dashed tiles for the full hour, long after the network recovered.
    //
    // Degrade-not-fail exists to protect data that DID arrive. When none did
    // there is nothing to protect, and throwing is both more honest and
    // self-healing: unstable_cache stores no entry for a rejected call, so the
    // next reader retries instead of inheriting the failure. index.tsx already
    // renders this as "Couldn't load pipeline data." for a configured client,
    // which is what four dashed tiles were saying anyway.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    ;(salesforceQuery as Mock).mockRejectedValue(new Error('fetch failed'))
    await expect(getSalesforcePipeline('acme')).rejects.toThrow(/every salesforce query failed/i)
    err.mockRestore()
  })

  test('still degrades rather than throwing while ANY query returns data', async () => {
    // The boundary of the rule above: three of four down is still a partial
    // result worth rendering and worth caching.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      return Promise.reject(new Error('fetch failed'))
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.openUnavailable).toBe(true)
    expect(data.wonUnavailable).toBe(true)
    expect(data.byOwner).toEqual([{ owner: 'Owner A', count: 5, amount: 500 }])
    err.mockRestore()
  })

  test('a failed closed-won query degrades to an unavailable won tile, keeping the open tiles', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue(null)
    ;(salesforceQuery as Mock).mockImplementation((_slug: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([ownerRow('Owner A', 5, 500)])
      if (dateRange === 'year_to_date') return Promise.reject(new Error('boom'))
      return Promise.resolve([stageRow('Proposal Released', 10, 1000)])
    })
    const data = await getSalesforcePipeline('acme')
    expect(data.wonUnavailable).toBe(true)
    expect(data.openUnavailable).toBe(false)
    expect(data.openDeals.value).toBe(10)
    // An unavailable window is not a stage mismatch; that flag must stay quiet.
    expect(data.wonStageUnmatched).toBe(false)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('campaign scoping', () => {
  const OURS = '2026 - Inbound Prospecting'
  const THEIRS = 'Napa Golf Outing'
  const NAMES = [OURS, '2026 - Inbound Prospecting - Brokers', '2026 - Inbound Prospecting - Employers']

  const withCampaign = (row: Record<string, unknown>, campaign: string) => ({ ...row, campaign_name: campaign })

  /** A client row carrying a configured campaign list. */
  const configured = (campaignNames?: string[]) =>
    ({ salesforceConfig: { salesforceAccountId: '00D', campaignNames } }) as unknown as ReturnType<typeof getClientBySlug>

  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
  })
  afterEach(() => warnSpy.mockRestore())

  test('every query requests campaign_name, or there is nothing to filter on', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    const fieldSets: string[][] = []
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) => {
      fieldSets.push(fields)
      return Promise.resolve([])
    })
    await getSalesforcePipeline('acme')
    expect(fieldSets).toHaveLength(4)
    for (const fields of fieldSets) expect(fields).toContain('campaign_name')
  })

  test('scopes every tile to the configured campaigns, dropping the rest of the book', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) => {
      if (fields.includes('opportunity_owner'))
        return Promise.resolve([
          withCampaign(ownerRow('Jason Clemons', 1, 51730.62), OURS),
          withCampaign(ownerRow('Someone Else', 900, 90000000), THEIRS),
        ])
      return Promise.resolve([
        withCampaign(stageRow('Proposal Released', 1, 51730.62, 25, false), OURS),
        // The renewal book: vastly larger, and not ours. It must not reach a tile.
        withCampaign(stageRow('Proposal Released', 3946, 172005960, 25, false), THEIRS),
        withCampaign(stageRow('Closed Won', 1, 20584.44, 100, true), '2026 - Inbound Prospecting - Employers'),
        withCampaign(stageRow('Closed Won', 623, 31326868, 100, true), THEIRS),
      ])
    })
    const p = await getSalesforcePipeline('acme')
    expect(p.openDeals.value).toBe(1)
    expect(p.totalPipeline.value).toBeCloseTo(51730.62, 2)
    expect(p.weightedPipeline.value).toBeCloseTo(12932.66, 2)
    expect(p.closedWon.value).toBeCloseTo(20584.44, 2)
    expect(p.byOwner).toEqual([{ owner: 'Jason Clemons', count: 1, amount: 51730.62 }])
    expect(p.campaignScoped).toBe(true)
    expect(p.openCampaignUnmatched).toBe(false)
    expect(p.wonCampaignUnmatched).toBe(false)
  })

  test('filters the prior-year window too, so the delta compares like with like', async () => {
    // The trap: scope the current window but not the compare window, and the
    // closed-won delta measures our slice against their entire book — a
    // permanent, enormous false decline on a client-facing tile.
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([])
      const ours = withCampaign(stageRow('Closed Won', 1, 100, 100, true), OURS)
      const theirs = withCampaign(stageRow('Closed Won', 500, 50000, 100, true), THEIRS)
      // Prior-year window carries both; if it is left unfiltered the baseline is 50100.
      return Promise.resolve(dateRange === '2025-01-01,2025-12-31' ? [ours, theirs] : [ours])
    })
    const p = await getSalesforcePipeline('acme')
    // Baseline must be 100 (ours last year), so the delta is 0 — not -99.8%.
    expect(p.closedWon.delta).toBeCloseTo(0, 6)
  })

  test('flags unmatched rather than publishing a confident $0 when nothing matches', async () => {
    // A renamed campaign in the CRM lands here. The tiles legitimately compute 0,
    // and 0 is indistinguishable from "no agency-sourced pipeline" without a flag.
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([
      withCampaign(stageRow('Proposal Released', 3946, 172005960, 25, false), THEIRS),
    ])
    const p = await getSalesforcePipeline('acme')
    expect(p.totalPipeline.value).toBe(0)
    expect(p.openCampaignUnmatched).toBe(true)
    expect(p.campaignScoped).toBe(true)
  })

  /**
   * The two flags describe DIFFERENT windows: open is a wide created-date window
   * evaluated as of now, won is year to date on the close date. While they were
   * OR'd into one flag, a client with real open pipeline and no close yet — the
   * ordinary opening state of a newly scoped client — had all four of their
   * tiles disclaimed as "these totals are 0".
   */
  test('raises the open and closed-won unmatched flags independently, never as one OR', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([])
      // Open window: in scope. Won windows (year to date and prior year): rows
      // arrived, none of them ours.
      if (dateRange === EXPECTED_OPEN_WINDOW)
        return Promise.resolve([withCampaign(stageRow('Proposal Released', 1, 51730.62, 25, false), OURS)])
      return Promise.resolve([withCampaign(stageRow('Closed Won', 623, 31326868, 100, true), THEIRS)])
    })
    const p = await getSalesforcePipeline('acme')
    expect(p.openCampaignUnmatched).toBe(false)
    expect(p.wonCampaignUnmatched).toBe(true)
    // And the open figure the OR'd flag used to disclaim is genuinely there.
    expect(p.totalPipeline.value).toBeCloseTo(51730.62, 2)
  })

  test('the prior-year window matching nothing raises neither flag: it is an empty baseline, not a caveat', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[], dateRange: string) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([])
      if (dateRange === '2025-01-01,2025-12-31')
        return Promise.resolve([withCampaign(stageRow('Closed Won', 500, 50000, 100, true), THEIRS)])
      return Promise.resolve([withCampaign(stageRow('Closed Won', 1, 100, 100, true), OURS)])
    })
    const p = await getSalesforcePipeline('acme')
    expect(p.openCampaignUnmatched).toBe(false)
    expect(p.wonCampaignUnmatched).toBe(false)
  })

  test('an unconfigured client keeps whole-org reporting and is not flagged as scoped', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(undefined))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
      Promise.resolve(
        fields.includes('opportunity_owner')
          ? [withCampaign(ownerRow('Someone Else', 900, 90000), THEIRS)]
          : [withCampaign(stageRow('Proposal Released', 10, 1000, 25, false), THEIRS)],
      ),
    )
    const p = await getSalesforcePipeline('acme')
    expect(p.openDeals.value).toBe(10)
    expect(p.campaignScoped).toBe(false)
    expect(p.openCampaignUnmatched).toBe(false)
    expect(p.wonCampaignUnmatched).toBe(false)
  })

  test('a config of blank names is not a scope: whole-org reporting, and no scoped label', async () => {
    // hasCampaignScope and filterByCampaign must agree. A `names.length > 0`
    // test says "scoped" here while the filter applies nothing, which puts
    // "Scoped to agency-sourced campaigns." over the client's entire book.
    ;(getClientBySlug as Mock).mockResolvedValue(configured([' ', '']))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
      Promise.resolve(
        fields.includes('opportunity_owner')
          ? [withCampaign(ownerRow('Someone Else', 900, 90000), THEIRS)]
          : [withCampaign(stageRow('Proposal Released', 10, 1000, 25, false), THEIRS)],
      ),
    )
    const p = await getSalesforcePipeline('acme')
    expect(p.campaignScoped).toBe(false)
    expect(p.openDeals.value).toBe(10)
    expect(p.openCampaignUnmatched).toBe(false)
  })

  /**
   * The truncation flags must stay pinned to the RAW response length, never the
   * post-filter one. Nothing else in this suite would notice the swap: a scoped
   * client's post-filter count is a handful of rows against a 500 cap, so moving
   * these to the scoped rows disables truncation detection permanently while
   * every other test still passes.
   */
  test('judges truncation on the RAW response, not the campaign-scoped subset', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) => {
      // 500 raw rows = the cap. Exactly ONE of them is in scope, so a
      // post-filter check sees 1 and reports a false all-clear.
      const theirs = Array.from({ length: 499 }, () =>
        withCampaign(stageRow('Proposal Released', 1, 100, 25, false), THEIRS))
      if (fields.includes('opportunity_owner'))
        return Promise.resolve([...Array.from({ length: 499 }, () =>
          withCampaign(ownerRow('Someone Else', 1, 100), THEIRS)),
          withCampaign(ownerRow('Jason Clemons', 1, 100), OURS)])
      return Promise.resolve([...theirs, withCampaign(stageRow('Proposal Released', 1, 100, 25, false), OURS)])
    })
    const p = await getSalesforcePipeline('acme')
    expect(p.stageTruncated).toBe(true)
    expect(p.ownersTruncated).toBe(true)
    // Proof the scoped set really is far under the cap, so these flags cannot be
    // passing for the wrong reason.
    expect(p.openDeals.value).toBe(1)
    expect(p.byOwner).toHaveLength(1)
  })

  /**
   * Per-TERM pinning for stageTruncated, which the combined test above cannot
   * give. That test hands the same 500-row payload to all three stage windows,
   * so the flag is an OR of three terms that are all true at once: mutate any
   * ONE of them from the raw length to the scoped length and the other two
   * still carry it green. Verified by mutation \u2014 all three drifted green
   * individually, while ownersTruncated (a single term) correctly failed.
   *
   * Each case below puts exactly ONE window at the cap and leaves the other two
   * at a single row, so the term under test is the only thing that can raise
   * the flag. 499 out-of-scope rows plus one in-scope row keeps the SCOPED set
   * at 1 \u2014 three orders of magnitude under the cap \u2014 which is what
   * makes a raw-to-scoped swap observable rather than a no-op.
   */
  describe('stageTruncated pins each window independently', () => {
    const capped = () => [
      ...Array.from({ length: 499 }, () =>
        withCampaign(stageRow('Proposal Released', 1, 100, 25, false), THEIRS)),
      withCampaign(stageRow('Proposal Released', 1, 100, 25, false), OURS),
    ]
    const single = () => [withCampaign(stageRow('Proposal Released', 1, 100, 25, false), OURS)]

    /** Every stage query under the cap except the one named. */
    const onlyCapped = (target: 'open' | 'wonCur' | 'wonPrior') => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[], dateRange: string) => {
        if (fields.includes('opportunity_owner')) return Promise.resolve([])
        const which =
          dateRange === EXPECTED_OPEN_WINDOW ? 'open'
          : dateRange === '2025-01-01,2025-12-31' ? 'wonPrior'
          : 'wonCur'
        return Promise.resolve(which === target ? capped() : single())
      })
    }

    test('the OPEN window alone raises it', async () => {
      onlyCapped('open')
      const p = await getSalesforcePipeline('acme')
      expect(p.stageTruncated).toBe(true)
      // Proof the scoped set is nowhere near the cap, so a raw-to-scoped swap
      // on this term really does flip the flag rather than passing anyway.
      expect(p.openDeals.value).toBe(1)
    })

    test('the CLOSED-WON year-to-date window alone raises it', async () => {
      onlyCapped('wonCur')
      const p = await getSalesforcePipeline('acme')
      expect(p.stageTruncated).toBe(true)
    })

    test('the PRIOR-YEAR window alone raises it, since a capped baseline overstates the delta', async () => {
      onlyCapped('wonPrior')
      const p = await getSalesforcePipeline('acme')
      expect(p.stageTruncated).toBe(true)
    })

    test('all three under the cap leaves it false', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
        Promise.resolve(fields.includes('opportunity_owner') ? [] : single()))
      expect((await getSalesforcePipeline('acme')).stageTruncated).toBe(false)
    })
  })

  /**
   * scopedOwner.unmatched was computed and thrown away. The owner rows back the
   * breakdown and no tile, so the tile caveat cannot speak for them: filtered to
   * empty, byOwner is [] and the list renders "No open deals by owner.", which
   * is a claim about the client's deals rather than about the filter.
   */
  describe('ownerCampaignUnmatched reaches the caller', () => {
    test('is true when owner rows arrived and none were on a configured campaign', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
        Promise.resolve(
          fields.includes('opportunity_owner')
            ? [withCampaign(ownerRow('Someone Else', 900, 90000000), THEIRS)]
            : [withCampaign(stageRow('Proposal Released', 1, 51730.62, 25, false), OURS)],
        ))
      const p = await getSalesforcePipeline('acme')
      expect(p.ownerCampaignUnmatched).toBe(true)
      // The empty list the flag exists to explain.
      expect(p.byOwner).toEqual([])
      // And it is independent of the tile flags: the open window matched fine.
      expect(p.openCampaignUnmatched).toBe(false)
    })

    test('is false when owners matched the configured campaigns', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
        Promise.resolve(
          fields.includes('opportunity_owner')
            ? [withCampaign(ownerRow('Jason Clemons', 1, 51730.62), OURS),
               withCampaign(ownerRow('Someone Else', 900, 90000000), THEIRS)]
            : [],
        ))
      const p = await getSalesforcePipeline('acme')
      expect(p.ownerCampaignUnmatched).toBe(false)
      expect(p.byOwner).toEqual([{ owner: 'Jason Clemons', count: 1, amount: 51730.62 }])
    })

    test('is false for an empty owner fetch, which is missing data rather than a mismatch', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockResolvedValue([])
      expect((await getSalesforcePipeline('acme')).ownerCampaignUnmatched).toBe(false)
    })

    test('is false for an unconfigured client, which is not scoped at all', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(undefined))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
        Promise.resolve(
          fields.includes('opportunity_owner')
            ? [withCampaign(ownerRow('Someone Else', 900, 90000), THEIRS)]
            : [],
        ))
      expect((await getSalesforcePipeline('acme')).ownerCampaignUnmatched).toBe(false)
    })

    test('is false when the owner fetch FAILED: byOwner is null and unavailable outranks scope', async () => {
      ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
      ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) =>
        fields.includes('opportunity_owner')
          ? Promise.reject(new Error('owner query failed'))
          : Promise.resolve([withCampaign(stageRow('Proposal Released', 1, 100, 25, false), OURS)]))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const p = await getSalesforcePipeline('acme')
      errSpy.mockRestore()
      expect(p.byOwner).toBeNull()
      expect(p.ownerCampaignUnmatched).toBe(false)
    })
  })

  test('counts unrecognized closed flags on the SCOPED rows, not the whole org', async () => {
    // Otherwise a client with two in-scope deals inherits a warning generated by
    // 89,000 rows they are not being shown, and the caveat is meaningless.
    ;(getClientBySlug as Mock).mockResolvedValue(configured(NAMES))
    ;(salesforceQuery as Mock).mockImplementation((_s: string, fields: string[]) => {
      if (fields.includes('opportunity_owner')) return Promise.resolve([])
      return Promise.resolve([
        withCampaign({ ...stageRow('Proposal Released', 1, 100, 25, false), opportunity_is_closed: 'maybe' }, THEIRS),
        withCampaign(stageRow('Proposal Released', 1, 100, 25, false), OURS),
      ])
    })
    const p = await getSalesforcePipeline('acme')
    expect(p.unrecognizedClosedFlags).toBe(0)
  })
})
