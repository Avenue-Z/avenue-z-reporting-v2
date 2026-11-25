// C4 outer test: the LinkedIn page on BigQuery, through the KPI fetch, linkedinQuery and the mart reader. Only the
// network edges are doubles (BigQuery's query call, Supermetrics' smQuery); the creative and geo parts are stubbed.
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
vi.mock('@/lib/linkedin/creative', () => ({ getCreativeTree: vi.fn(async () => []) }))
vi.mock('@/lib/linkedin/geo', () => ({ getLinkedInGeoRows: vi.fn(async () => []) }))
vi.mock('@/components/report-sections/shared/shared-parts-header', () => ({ SharedPartsHeader: () => null }))
vi.mock('@/components/report-sections/paid-search/kpi-grid', () => ({ KpiGrid: () => <div data-testid="part" /> }))
vi.mock('./creative-table', () => ({ LinkedInCreativeTable: () => <div data-testid="part" /> }))
vi.mock('./geo-section', () => ({ LinkedInGeoSection: () => <div data-testid="part" /> }))

import { bqRows } from '@/lib/bq/client'
import { smQuery } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { LinkedInAdsReport } from './index'

/** BigQuery double: fresh marts, the reach snapshot pulled `pulled`, the reach lookup `reach`, one sums row. */
function marts(o: { pulled?: string | Error; reach?: Record<string, unknown>[] } = {}) {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes('max(event_date)')) return [{ d: '2026-11-23' }]
    if (sql.includes('max(pulled_on)')) { if (o.pulled instanceof Error) throw o.pulled; return [{ d: o.pulled ?? '2026-11-24' }] }
    if (sql.includes('reach_by_range')) return o.reach ?? []
    return [{ spend: 100, impressions: 6000 }]
  })
}
const page = async (dateRange: string) => render(await LinkedInAdsReport({ clientSlug: 'renaissance', dateRange }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
  vi.stubEnv('DATA_BACKEND_LINKEDIN', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({ linkedinConfig: { linkedinAdAccountId: '503368877' }, smApiKeyEnvVar: 'SM_KEY' } as never)
  vi.mocked(bqRows).mockReset()
  vi.mocked(smQuery).mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.mocked(console.warn).mockRestore()
})

describe('LinkedIn reach on BigQuery (C4): delayed or failed reach → notice, never live', () => {
  test('a stale reach snapshot: the parts render and the page says reach is delayed', async () => {
    marts({ pulled: '2026-11-21' })
    const { getByRole, getAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — LinkedIn reach and frequency are waiting on today's snapshot, so they show — for now.")
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('the reach mart not there yet (edge 13): the parts render and the page says reach cannot be loaded', async () => {
    marts({ pulled: new Error('Not found: Table avenue-z-data-warehouse-prod:marts.mart_linkedin_reach_by_range') })
    const { getByRole, getAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — LinkedIn reach and frequency can't be loaded right now. Try again shortly.")
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a custom range is preset-only: no notice', async () => {
    marts()
    const { queryByRole, getAllByTestId } = await page('custom:2026-11-03,2026-11-10')
    expect(queryByRole('note')).toBeNull()
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(smQuery).not.toHaveBeenCalled()
  })
})
