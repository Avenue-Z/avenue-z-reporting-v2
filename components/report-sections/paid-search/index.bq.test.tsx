// C3 outer test: the Paid Search page on BigQuery, end to end through every fetcher, awQuery and the mart
// reader. Only the network edges are doubles: BigQuery's query call and Supermetrics' smQuery.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('@/lib/bq/client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))
vi.mock('@/lib/supermetrics/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/supermetrics/client')>()),
  smQuery: vi.fn(async () => ({ header: [], rows: [] })),
  parseSmRows: vi.fn(() => []),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/components/report-sections/shared/shared-parts-header', () => ({ SharedPartsHeader: () => null }))
vi.mock('./hero', () => ({ Hero: () => <div data-testid="part" /> }))
vi.mock('./kpi-grid', () => ({ KpiGrid: () => <div data-testid="part" /> }))
vi.mock('./campaign-table', () => ({ CampaignTable: () => <div data-testid="part" /> }))
vi.mock('./leads-section', () => ({ LeadsSection: () => <div data-testid="part" /> }))
vi.mock('./geo-section', () => ({ GeoSection: () => <div data-testid="part" /> }))
vi.mock('./keywords', () => ({ KeywordsTable: () => <div data-testid="part" /> }))

import { bqRows } from '@/lib/bq/client'
import { smQuery } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { PaidSearchReport } from './index'

const FRESHNESS = 'max(event_date)'
/** BigQuery double: the freshness probe answers `through`; every mart read answers no rows (or `read` throws). */
function marts(through: string | Error, read: 'ok' | Error = 'ok') {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes(FRESHNESS)) { if (through instanceof Error) throw through; return [{ d: through }] }
    if (read instanceof Error) throw read
    return []
  })
}
const readRanges = () => vi.mocked(bqRows).mock.calls.filter(([sql]) => !sql.includes(FRESHNESS)).map(([, p]) => `${p.start},${p.end}`)
const page = async (dateRange: string) => render(await PaidSearchReport({ clientSlug: 'renaissance', dateRange }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
  vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({
    paidSearchConfig: { googleAdsAccountId: '4136001852', leadActions: [] },
    smApiKeyEnvVar: 'SM_KEY',
  } as never)
  vi.mocked(bqRows).mockReset()
  vi.mocked(smQuery).mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.mocked(console.warn).mockRestore()
})

describe('Paid Search on BigQuery (C3): stale → notice, failure → notice, never live', () => {
  test('This Month is served from BigQuery through yesterday, with the notice', async () => {
    marts('2026-11-16')
    const { getByRole, getAllByTestId } = await page('this_month')
    expect(getByRole('note').textContent).toBe('Data delayed — showing through Nov 16, 2026.')
    expect(getAllByTestId('part')).toHaveLength(6)
    expect(new Set(readRanges())).toEqual(new Set(['2026-11-01,2026-11-16', '2026-10-16,2026-10-31']))
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('stale marts clip the range to the newest day, with the same notice', async () => {
    marts('2026-11-12')
    const { getByRole } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe('Data delayed — showing through Nov 12, 2026.')
    expect(readRanges()).toContain('2026-10-18,2026-11-12')
    expect(readRanges().every((r) => r.split(',')[1] <= '2026-11-12')).toBe(true)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test("Year to Date starts on Renaissance's own history floor, Feb 27; its prior period, wholly before it, is dropped rather than read", async () => {
    marts('2026-11-16')
    const { getByRole } = await page('year_to_date')
    expect(getByRole('note').textContent).toContain('Paid Search history starts Feb 27, 2026')
    expect(readRanges()).toContain('2026-02-27,2026-11-16')
    expect(readRanges().every((r) => r >= '2026-02-27')).toBe(true)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test("a prior period starting before Renaissance's floor is still dropped, not read", async () => {
    marts('2026-11-16')
    await page('custom:2026-03-01,2026-03-31') // previous_period: 2026-01-29..2026-02-28
    expect(readRanges()).toContain('2026-03-01,2026-03-31')
    expect(readRanges().every((r) => r >= '2026-02-27')).toBe(true)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test("a prior period on or after Renaissance's floor is read from the marts, not dropped", async () => {
    marts('2026-11-16')
    await page('custom:2026-04-01,2026-04-30') // previous_period: 2026-03-02..2026-03-31
    expect(readRanges()).toContain('2026-03-02,2026-03-31')
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('an account with no verified earlier history (no rows in the marts) clips Year to Date at Apr 1', async () => {
    marts('2026-11-16')
    vi.mocked(getClientBySlug).mockResolvedValue({
      paidSearchConfig: { googleAdsAccountId: '1111111111', leadActions: [] },
      smApiKeyEnvVar: 'SM_KEY',
    } as never)
    const { getByRole, getAllByTestId } = await page('year_to_date')
    expect(getByRole('note').textContent).toContain('Paid Search history starts Apr 1, 2026')
    expect(getAllByTestId('part')).toHaveLength(6)
    expect(readRanges()).toContain('2026-04-01,2026-11-16')
    expect(readRanges().every((r) => r >= '2026-04-01')).toBe(true)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test("a failure looking up the client's floor: the notice, no parts, never live", async () => {
    marts('2026-11-16')
    vi.mocked(getClientBySlug).mockRejectedValue(new Error('Neon connection refused'))
    const { getByRole, queryAllByTestId } = await page('year_to_date')
    expect(getByRole('note').textContent).toBe("Data delayed — Paid Search data can't be loaded right now. Try again shortly.")
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('BigQuery down: the notice, no parts, never live', async () => {
    marts(new Error('503 backendError'))
    const { getByRole, queryAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — Paid Search data can't be loaded right now. Try again shortly.")
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('the mart reads fail after the freshness check: error cards plus the notice, never live', async () => {
    marts('2026-11-16', new Error('Job timed out'))
    const { getByRole, getAllByText } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — Paid Search data can't be loaded right now. Try again shortly.")
    expect(getAllByText("Couldn't load this section.")).toHaveLength(6)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a clipped range whose reads fail keeps the clip notice and adds the failure one', async () => {
    marts('2026-11-16', new Error('Job timed out'))
    const { getAllByRole } = await page('this_month')
    expect(getAllByRole('note').map((n) => n.textContent)).toEqual([
      'Data delayed — showing through Nov 16, 2026.',
      "Data delayed — Paid Search data can't be loaded right now. Try again shortly.",
    ])
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('nothing of the range in the warehouse yet: the notice and no parts', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z')) // a Monday
    marts('2026-11-15')
    const { getByRole, queryAllByTestId } = await page('this_week')
    expect(getByRole('note').textContent).toBe('Data delayed — showing through Nov 15, 2026, so this range has no data yet.')
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('switched off, the page is unchanged: live Supermetrics, no notice, no BigQuery', async () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', '')
    const { queryByRole } = await page('this_month')
    expect(queryByRole('note')).toBeNull()
    expect(smQuery).toHaveBeenCalled()
    expect(bqRows).not.toHaveBeenCalled()
  })
})
