import { describe, expect, test, vi, type Mock } from 'vitest'
// pipeline.ts imports ./base (-> lib/db -> next-auth); mock it so jsdom can load
// the module, same pattern as lib/linkedin/kpis.dash.test.ts. Kept in a separate
// file from pipeline.test.ts so this mock never touches the pure-function tests.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))
import { getSalesforcePipeline } from './pipeline'
import { salesforceQuery, resolveCompareIso } from './base'

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
  })
})
