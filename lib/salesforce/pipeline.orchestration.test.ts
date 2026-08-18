import { describe, expect, test, vi, beforeEach, type Mock } from 'vitest'
// pipeline.ts imports ./base (-> lib/db -> next-auth); mock it so jsdom can load
// the module, same pattern as lib/linkedin/kpis.dash.test.ts. Kept in a separate
// file from pipeline.test.ts so this mock never touches the pure-function tests.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))
// pipeline.ts also reads the client directly (for salesforceConfig.wonStageName),
// separately from base.ts's own internal getClientBySlug call for the account id.
// The real getClientBySlug hits Next.js's unstable_cache, which throws outside a
// request context, so it must be mocked here too.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
import { getSalesforcePipeline } from './pipeline'
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
  beforeEach(() => {
    // Default: no client row (or no salesforceConfig), so wonStage falls back to
    // the default 'Closed Won' unless a test overrides this. Every stageRow fixture
    // below already uses 'Closed Won' as its won stage, so this default keeps all
    // the pre-existing tests passing while it flows through unmocked.
    ;(getClientBySlug as Mock).mockResolvedValue(null)
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
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce] pipeline compare fetch failed'), expect.any(Error))
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

  test('owner query uses the main date range and OWNER_MAX_ROWS cap, and flags truncation end to end when it hits that cap', async () => {
    ;(resolveCompareIso as Mock).mockReturnValue('2025-01-01,2025-12-31')
    const cappedOwners = Array.from({ length: 500 }, (_, i) => ownerRow(`Owner ${i}`, 1, 10))
    ;(salesforceQuery as Mock).mockImplementation(
      (_slug: string, fields: string[], dateRange: string, opts: { maxRows?: number }) => {
        if (fields.includes('opportunity_owner')) {
          // Pins the owner query to the main range and its own cap: a reverted
          // implementation pointing it at cmpIso instead, or passing the wrong
          // maxRows, would fail these rather than passing silently against a
          // one-row fixture like the earlier tests use.
          expect(dateRange).toBe('year_to_date')
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
})
