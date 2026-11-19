import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/ga4/client', () => ({
  parseDateRange: (r: string) => { const [startDate, endDate] = r.split(','); return { startDate, endDate } },
  deriveCompareRange: vi.fn(),
}))
vi.mock('@/lib/supermetrics/client', () => ({
  smQuery: vi.fn(async () => ({ header: [], rows: [] })),
  parseSmRows: vi.fn(() => [{ cost: 'LIVE' }]),
  DS_IDS: { META: 'FA' },
}))
vi.mock('@/lib/bq/meta', () => ({ readMetaMarts: vi.fn() }))

import { getClientBySlug } from '@/lib/db/queries'
import { smQuery } from '@/lib/supermetrics/client'
import { readMetaMarts } from '@/lib/bq/meta'
import { BqUnavailable } from '@/lib/bq/errors'
import { metaQuery } from './base'

const RANGE = '2026-09-01,2026-09-30'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({
    metaConfig: { metaAdAccountId: 'act_1480350426850960' },
    smApiKeyEnvVar: 'SM_KEY',
  } as never)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('metaQuery backend', () => {
  test('live when the source is not switched on (no BigQuery call)', async () => {
    expect(await metaQuery('renaissance', ['cost'], RANGE)).toEqual([{ cost: 'LIVE' }])
    expect(readMetaMarts).not.toHaveBeenCalled()
  })
  test('BigQuery when switched on and allowlisted, with the raw account id and maxRows', async () => {
    vi.stubEnv('DATA_BACKEND_META', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    vi.mocked(readMetaMarts).mockResolvedValue([{ cost: '1.5' }])
    expect(await metaQuery('renaissance', ['cost'], RANGE, { maxRows: 200 })).toEqual([{ cost: '1.5' }])
    expect(readMetaMarts).toHaveBeenCalledWith('act_1480350426850960', ['cost'], '2026-09-01', '2026-09-30', 200)
    expect(smQuery).not.toHaveBeenCalled()
  })
  test('a client off the allowlist stays live', async () => {
    vi.stubEnv('DATA_BACKEND_META', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    await metaQuery('kind-patches', ['cost'], RANGE)
    expect(readMetaMarts).not.toHaveBeenCalled()
  })
  test.each([
    ['stale', new BqUnavailable('stale', 'through 2026-09-29')],
    ['unsupported', new BqUnavailable('unsupported', 'x')],
    ['error', new Error('403 Access Denied')],
  ])('when BigQuery is %s it throws, logs it, and never calls Supermetrics (C2)', async (reason, err) => {
    vi.stubEnv('DATA_BACKEND_META', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    vi.mocked(readMetaMarts).mockRejectedValue(err)
    await expect(metaQuery('renaissance', ['cost'], RANGE)).rejects.toBe(err)
    expect(smQuery).not.toHaveBeenCalled()
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string)).toMatchObject({ source: 'meta', reason, served: 'none' })
  })
  test.each([
    [{ filters: 'ad_name == X' }],
    [{ settings: { foo: 1 } }],
  ])('a query with Supermetrics filters or settings (%o) is refused, never served live (C2)', async (opts) => {
    vi.stubEnv('DATA_BACKEND_META', 'bq')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    await expect(metaQuery('renaissance', ['cost'], RANGE, opts)).rejects.toMatchObject({ reason: 'unsupported' })
    expect(readMetaMarts).not.toHaveBeenCalled()
    expect(smQuery).not.toHaveBeenCalled()
  })
})
