import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'

// Same pattern (and same reasons) as pipeline.orchestration.test.ts: leads.ts
// imports ./base, which reaches lib/db and next-auth, and it reads the client
// directly for salesforceConfig.campaignNames. Kept out of leads.test.ts so
// these mocks never touch the pure dedupeLeadWeeks tests.
vi.mock('@/lib/salesforce/base', () => ({ salesforceQuery: vi.fn(), resolveCompareIso: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
// cached() calls Next's unstable_cache, which throws outside a request context.
// A pass-through is what CACHE_DISABLE=1 does in production, so the code under
// test is unchanged; only the cache shell is removed.
vi.mock('@/lib/cache', () => ({
  cached: (_v: string, _f: string, impl: (...a: unknown[]) => unknown) => impl,
}))

import { salesforceQuery, resolveCompareIso } from '@/lib/salesforce/base'
import { getClientBySlug } from '@/lib/db/queries'
import { getSalesforceWeeklyLeadsImpl } from './leads'

const NAMES = [
  '2026 - Inbound Prospecting',
  '2026 - Inbound Prospecting - Brokers',
  '2026 - Inbound Prospecting - Employers',
]
const NOW = new Date('2026-08-19T12:00:00Z')

const row = (id: string, week: string, campaign: string) =>
  ({ lead_id: id, yearWeekIso_created: week, campaign_name: campaign, lead_count: 1 }) as unknown as Record<string, string>

const withScope = (campaignNames?: string[]) =>
  ({ salesforceConfig: { salesforceAccountId: '00D', campaignNames } }) as unknown as ReturnType<typeof getClientBySlug>

beforeEach(() => {
  vi.clearAllMocks()
  // Undefined compare window, so these tests exercise the current year only.
  ;(resolveCompareIso as Mock).mockReturnValue(undefined)
})

/**
 * campaignUnmatched has to survive the whole impl, not just dedupeLeadWeeks.
 *
 * This is the regression these tests exist for: dedupeLeadWeeks computed the
 * flag correctly and getSalesforceWeeklyLeadsImpl dropped it on the floor,
 * which no unit test of either piece alone could see. The consequence was a
 * renamed campaign rendering "No data for this period." — a claim the period
 * was empty, when the query in fact returned rows and none were in scope.
 */
describe('getSalesforceWeeklyLeadsImpl — campaignUnmatched reaches the caller', () => {
  it('is true when rows arrived and none were on a configured campaign', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', 'Napa Golf Outing')])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(true)
    // And the series really is empty, which is why the flag is the only thing
    // standing between the reader and a false explanation of that emptiness.
    expect(out.weeks).toEqual([])
  })

  it('is false when rows matched the configured campaigns', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([
      row('L1', '2026|30', NAMES[0]),
      row('L2', '2026|30', NAMES[2]),
    ])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
    expect(out.weeks.length).toBeGreaterThan(0)
  })

  it('is false for an empty fetch, which is missing data rather than a mismatch', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(NAMES))
    ;(salesforceQuery as Mock).mockResolvedValue([])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
  })

  it('is false when the client configures no campaigns at all', async () => {
    ;(getClientBySlug as Mock).mockResolvedValue(withScope(undefined))
    ;(salesforceQuery as Mock).mockResolvedValue([row('L1', '2026|30', 'Napa Golf Outing')])

    const out = await getSalesforceWeeklyLeadsImpl('renaissance', NOW)

    expect(out.campaignUnmatched).toBe(false)
  })
})
