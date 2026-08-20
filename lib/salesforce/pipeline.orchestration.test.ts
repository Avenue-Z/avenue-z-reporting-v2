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
// getSalesforcePipeline (the public export) is wrapped in cached(), which calls
// Next's unstable_cache under the hood. unstable_cache throws
// ("Invariant: incrementalCache missing") outside a real request context, which
// is exactly what every test here is. These tests import the internal
// ...Impl directly instead, per the pattern cached() is built around (see
// lib/hubspot/client.ts): the wrapper is a thin cache/perf/health shell around
// the impl, so exercising the impl directly tests the same orchestration logic
// without needing to fake a request context.
import { getSalesforcePipelineImpl as getSalesforcePipeline } from './pipeline'
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
  opportunity_is_won: false,
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

    const openCall = calls.find((c) => !c.fields.includes('opportunity_owner') && c.dateRange === '2016-08-20,2035-12-31')
    expect(openCall).toBeDefined()
    expect(openCall!.opts.settings).toEqual({ deal_date_field: 'deal_created', convert_to_default_currency: false })

    const ownerCall = calls.find((c) => c.fields.includes('opportunity_owner'))
    expect(ownerCall!.dateRange).toBe('2016-08-20,2035-12-31')
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
          expect(dateRange).toBe('2016-08-20,2035-12-31') // OPEN_WINDOW
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
})
