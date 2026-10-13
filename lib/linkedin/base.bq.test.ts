import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/ga4/client', () => ({
  parseDateRange: (r: string) => { const [startDate, endDate] = r.split(','); return { startDate, endDate } },
  deriveCompareRange: vi.fn(),
}))
vi.mock('@/lib/supermetrics/client', () => ({
  smQuery: vi.fn(async () => ({ header: [], rows: [] })),
  parseSmRows: vi.fn(),
  DS_IDS: { GOOGLE_ADS: 'AW', LINKEDIN: 'LIA' },
}))
vi.mock('@/lib/bq/linkedin', async (orig) => ({ ...(await orig<typeof import('@/lib/bq/linkedin')>()), readLinkedInMarts: vi.fn() }))

import { getClientBySlug } from '@/lib/db/queries'
import { smQuery, parseSmRows } from '@/lib/supermetrics/client'
import { readLinkedInMarts } from '@/lib/bq/linkedin'
import { linkedinQuery } from './base'

const RANGE = '2026-09-01,2026-09-30'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('SM_KEY', 'k')
  vi.stubEnv('DATA_BACKEND_LINKEDIN', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.mocked(getClientBySlug).mockResolvedValue({ linkedinConfig: { linkedinAdAccountId: '503368877' }, smApiKeyEnvVar: 'SM_KEY' } as never)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('linkedinQuery backend', () => {
  test('merges live reach into mart totals (Reach/Frequency stay live: declared GAP)', async () => {
    vi.mocked(readLinkedInMarts).mockResolvedValue([{ spend: '100', impressions: '5000' }])
    vi.mocked(parseSmRows).mockReturnValue([{ approximateUniqueImpressions: '2100' }])
    const rows = await linkedinQuery('renaissance', ['spend', 'impressions', 'approximateUniqueImpressions'], RANGE)
    expect(rows).toEqual([{ spend: '100', impressions: '5000', approximateUniqueImpressions: '2100' }])
    expect(vi.mocked(smQuery).mock.calls[0][0].fields).toEqual(['approximateUniqueImpressions'])
  })
  test('reach missing for a long range stays empty, so the card shows —', async () => {
    vi.mocked(readLinkedInMarts).mockResolvedValue([{ spend: '100' }])
    vi.mocked(parseSmRows).mockReturnValue([{ approximateUniqueImpressions: '' }])
    const [row] = await linkedinQuery('renaissance', ['spend', 'approximateUniqueImpressions'], RANGE)
    expect(row.approximateUniqueImpressions).toBe('')
  })
  test('geography (memberRegion, declared GAP) goes live without touching BigQuery', async () => {
    vi.mocked(parseSmRows).mockReturnValue([{ memberRegion: 'Florida', spend: '1' }])
    await linkedinQuery('renaissance', ['memberRegion', 'spend'], RANGE, { maxRows: 500 })
    expect(readLinkedInMarts).not.toHaveBeenCalled()
  })
  test('falls back to live when BigQuery throws', async () => {
    vi.mocked(readLinkedInMarts).mockRejectedValue(new Error('timeout'))
    vi.mocked(parseSmRows).mockReturnValue([{ spend: 'LIVE' }])
    expect(await linkedinQuery('renaissance', ['spend'], RANGE)).toEqual([{ spend: 'LIVE' }])
  })
  test('passes maxRows through to the mart read', async () => {
    vi.mocked(readLinkedInMarts).mockResolvedValue([])
    await linkedinQuery('renaissance', ['creativeDscName', 'spend'], RANGE, { maxRows: 200 })
    expect(readLinkedInMarts).toHaveBeenCalledWith('503368877', ['creativeDscName', 'spend'], '2026-09-01', '2026-09-30', 200)
  })
})
