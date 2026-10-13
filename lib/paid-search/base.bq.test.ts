import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/ga4/client', () => ({
  parseDateRange: (r: string) => { const [startDate, endDate] = r.split(','); return { startDate, endDate } },
  deriveCompareRange: vi.fn(),
}))
vi.mock('@/lib/supermetrics/client', () => ({
  smQuery: vi.fn(async () => ({ header: [], rows: [] })),
  parseSmRows: vi.fn(() => [{ Cost: 'LIVE' }]),
  DS_IDS: { GOOGLE_ADS: 'AW', LINKEDIN: 'LIA' },
}))
vi.mock('@/lib/bq/googleads', () => ({ readAwMart: vi.fn() }))

import { getClientBySlug } from '@/lib/db/queries'
import { smQuery } from '@/lib/supermetrics/client'
import { readAwMart } from '@/lib/bq/googleads'
import { BqUnavailable } from '@/lib/bq/errors'
import { awQuery } from './base'

const RANGE = '2026-09-01,2026-09-30'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({
    paidSearchConfig: { googleAdsAccountId: '4136001852', leadActions: [] },
    smApiKeyEnvVar: 'SM_KEY',
  } as never)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('awQuery backend', () => {
  test('live when the source is not switched on (no BigQuery call)', async () => {
    expect(await awQuery('renaissance', ['Cost'], RANGE)).toEqual([{ Cost: 'LIVE' }])
    expect(readAwMart).not.toHaveBeenCalled()
  })
  test('BigQuery when switched on and allowlisted', async () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    vi.mocked(readAwMart).mockResolvedValue([{ Cost: '1.5' }])
    expect(await awQuery('renaissance', ['Cost'], RANGE)).toEqual([{ Cost: '1.5' }])
    expect(readAwMart).toHaveBeenCalledWith('4136001852', ['Cost'], '2026-09-01', '2026-09-30')
    expect(smQuery).not.toHaveBeenCalled()
  })
  test('a client off the allowlist stays live', async () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    await awQuery('kind-patches', ['Cost'], RANGE)
    expect(readAwMart).not.toHaveBeenCalled()
  })
  test.each([
    ['stale', new BqUnavailable('stale', 'through 2026-09-29')],
    ['unsupported', new BqUnavailable('unsupported', 'x')],
    ['error', new Error('403 Access Denied')],
  ])('falls back to live when BigQuery is %s, and logs it', async (reason, err) => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    vi.mocked(readAwMart).mockRejectedValue(err)
    expect(await awQuery('renaissance', ['Cost'], RANGE)).toEqual([{ Cost: 'LIVE' }])
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string).reason).toBe(reason)
  })
  test('a query with Supermetrics filters or settings stays live', async () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    await awQuery('renaissance', ['Cost'], RANGE, { filters: 'Campaignname == X' })
    expect(readAwMart).not.toHaveBeenCalled()
  })
})
