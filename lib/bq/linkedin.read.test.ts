import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('@/lib/bq/client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))

import { bqRows } from '@/lib/bq/client'
import { readLinkedInMarts } from './linkedin'

const ACCOUNT = '503368877'
const KPI = ['spend', 'impressions', 'approximateUniqueImpressions', 'clicks']
const REACH = 'mart_linkedin_reach_by_range'

/** Answers each query by what it reads: freshness, the reach pull date, the reach row, or the sums. */
function marts(o: { pulled?: string; reach?: Record<string, unknown>[] | Error } = {}) {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes('max(event_date)')) return [{ d: '2026-11-23' }]
    if (sql.includes('max(pulled_on)')) return [{ d: o.pulled ?? '2026-11-24' }]
    if (sql.includes(REACH)) {
      if (o.reach instanceof Error) throw o.reach
      return (o.reach ?? []).map((r) => ({ pulled_on: '2026-11-24', ...r }))
    }
    return [{ spend: 100, impressions: 5000, clicks: 40 }]
  })
}
const sqls = () => vi.mocked(bqRows).mock.calls.map((c) => c[0] as string)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
  vi.mocked(bqRows).mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.mocked(console.warn).mockRestore()
})

describe('readLinkedInMarts reach (C4)', () => {
  test('totals take reach from the account row for the exact window, never from Supermetrics', async () => {
    marts({ reach: [{ reach: 2100, frequency: 2.38 }] })
    expect(await readLinkedInMarts(ACCOUNT, KPI, '2026-11-01', '2026-11-23')).toEqual([
      { spend: '100', impressions: '5000', clicks: '40', approximateUniqueImpressions: '2100' },
    ])
    const reachSql = sqls().find((s) => s.includes(REACH) && !s.includes('max(pulled_on)'))!
    expect(reachSql).toContain('CAMPAIGN_ID is null')
    expect(vi.mocked(bqRows).mock.calls.find(([s]) => s === reachSql)![1]).toEqual({ account: ACCOUNT, start: '2026-11-01', end: '2026-11-23' })
  })
  test("a NULL reach (a year-long range) is served as '', as live returns it, so the tile keeps its ~90-days note", async () => {
    marts({ reach: [{ reach: null, frequency: null }] })
    const [row] = await readLinkedInMarts(ACCOUNT, KPI, '2025-01-01', '2025-12-31')
    expect(row.approximateUniqueImpressions).toBe('')
    expect(row._reach).toBeUndefined()
  })
  test('no row for the window (a custom range): no reach key, and the row says preset-only', async () => {
    marts()
    const [row] = await readLinkedInMarts(ACCOUNT, KPI, '2026-11-03', '2026-11-17')
    expect(row).toEqual({ spend: '100', impressions: '5000', clicks: '40', _reach: 'preset-only' })
  })
  test('a stale snapshot or a failed lookup: the sums are served, and the row says why', async () => {
    marts({ pulled: '2026-11-20' })
    expect((await readLinkedInMarts(ACCOUNT, KPI, '2026-11-01', '2026-11-23'))[0]).toEqual({ spend: '100', impressions: '5000', clicks: '40', _reach: 'delayed' })
    marts({ reach: new Error('Not found: Table mart_linkedin_reach_by_range') })
    expect((await readLinkedInMarts(ACCOUNT, KPI, '2026-11-01', '2026-11-23'))[0]).toEqual({ spend: '100', impressions: '5000', clicks: '40', _reach: 'unavailable' })
  })
  test('reach with a dimension is unsupported, before any BigQuery call', async () => {
    await expect(readLinkedInMarts(ACCOUNT, ['Date', 'spend', 'approximateUniqueImpressions'], '2026-11-01', '2026-11-23'))
      .rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test('a read without reach never looks it up', async () => {
    marts()
    await readLinkedInMarts(ACCOUNT, ['spend', 'impressions'], '2026-11-01', '2026-11-23')
    expect(sqls().some((s) => s.includes('reach_by_range'))).toBe(false)
  })
})
