import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('@/lib/bq/client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))

import { bqRows } from '@/lib/bq/client'
import { readMetaMarts } from './meta'

const ACCOUNT = 'act_1480350426850960'
const KPI = ['cost', 'impressions', 'reach', 'Frequency', 'CTR']
const CREATIVE = ['ad_name', 'cost', 'reach', 'Frequency']

/** Today's reach snapshot at the fixed clock below. */
const PULLED = '2026-11-24'
/** Answers each query by what it reads: freshness, reach pull dates, account reach, ad reach, or the sums. */
function marts(o: { fresh?: string; pulled?: string; sums?: Record<string, unknown>[]; reach?: Record<string, unknown>[] | Error; adReach?: Record<string, unknown>[] | Error }) {
  const snap = (rows: Record<string, unknown>[] | Error | undefined) => {
    if (rows instanceof Error) throw rows
    return (rows ?? []).map((r) => ({ pulled_on: PULLED, ...r }))
  }
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes('max(event_date)')) return [{ d: o.fresh ?? '2026-11-15' }]
    if (sql.includes('max(pulled_on)')) return [{ d: o.pulled ?? PULLED }]
    if (sql.includes('mart_fbads_ad_reach_by_range')) return snap(o.adReach)
    if (sql.includes('mart_fbads_reach_by_range')) return snap(o.reach)
    return o.sums ?? []
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

describe('readMetaMarts refusals', () => {
  test('an account nobody verified is refused with no BigQuery call', async () => {
    await expect(readMetaMarts('act_999', KPI, '2026-10-01', '2026-10-31')).rejects.toMatchObject({ reason: 'unsupported', message: expect.stringContaining('999') })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test('a start before the account floor is refused with no BigQuery call', async () => {
    await expect(readMetaMarts(ACCOUNT, KPI, '2023-12-31', '2026-10-31')).rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test.each([['2026-1-1', '2026-10-31'], ['2026-10-01', '2026-10-1'], ['2026-10-01', 'undefined']])(
    'a date that is not YYYY-MM-DD (%s..%s) is refused: it would sort wrong as text',
    async (start, end) => {
      await expect(readMetaMarts(ACCOUNT, KPI, start, end)).rejects.toMatchObject({ reason: 'unsupported' })
      expect(bqRows).not.toHaveBeenCalled()
    },
  )
  test('an unsupported field is refused with no BigQuery call', async () => {
    await expect(readMetaMarts(ACCOUNT, ['cost', 'video_views'], '2026-10-01', '2026-10-31')).rejects.toMatchObject({ reason: 'unsupported' })
    expect(bqRows).not.toHaveBeenCalled()
  })
  test('a range ending after the newest mart day is stale, and nothing else is read', async () => {
    marts({ fresh: '2026-10-30' })
    await expect(readMetaMarts(ACCOUNT, KPI, '2026-10-01', '2026-10-31')).rejects.toMatchObject({ reason: 'stale' })
    expect(sqls()).toHaveLength(1)
  })
  test('the geo read checks the geo mart is fresh', async () => {
    marts({ sums: [] })
    await readMetaMarts(ACCOUNT, ['Region', 'cost'], '2026-10-01', '2026-10-31')
    expect(sqls()[0]).toContain('max(event_date)')
    expect(sqls()[0]).toContain('mart_fbads_geo_performance')
  })
})

describe('readMetaMarts sums', () => {
  test('the account goes to BigQuery without act_, with the window as named params', async () => {
    marts({ sums: [{ cost: 1 }] })
    await readMetaMarts(ACCOUNT, ['cost'], '2026-10-01', '2026-10-31')
    expect(vi.mocked(bqRows).mock.calls.at(-1)![1]).toEqual({ account: '1480350426850960', start: '2026-10-01', end: '2026-10-31' })
  })
  test('rows are keyed exactly by the requested Supermetrics ids, stringified', async () => {
    marts({ sums: [{ Date: '2026-10-01', cost: 12.5, inline_link_clicks: 3 }] })
    expect(await readMetaMarts(ACCOUNT, ['Date', 'cost', 'inline_link_clicks'], '2026-10-01', '2026-10-31')).toEqual([
      { Date: '2026-10-01', cost: '12.5', inline_link_clicks: '3' },
    ])
    expect(sqls().some((s) => s.includes('reach_by_range'))).toBe(false)
  })
})

describe('readMetaMarts reach', () => {
  test('totals take reach and frequency from the account row for the exact window', async () => {
    marts({ sums: [{ cost: 10, impressions: 100, CTR: 0.02 }], reach: [{ reach: 80, frequency: 1.25 }] })
    expect(await readMetaMarts(ACCOUNT, KPI, '2026-10-01', '2026-10-31')).toEqual([
      { cost: '10', impressions: '100', CTR: '0.02', reach: '80', Frequency: '1.25' },
    ])
    const reachSql = sqls().find((s) => s.includes('mart_fbads_reach_by_range') && !s.includes('max(pulled_on)'))!
    expect(reachSql).toContain('CAMPAIGN_ID is null')
    expect(reachSql).toContain('start_date = date(@start)')
    expect(reachSql).toContain('end_date = date(@end)')
  })
  test('no reach row for the window (a custom range): reach and Frequency keys are absent, not 0, and the row says why', async () => {
    marts({ sums: [{ cost: 10, impressions: 100, CTR: 0.02 }], reach: [] })
    const [row] = await readMetaMarts(ACCOUNT, KPI, '2026-10-03', '2026-10-17')
    expect(row).toEqual({ cost: '10', impressions: '100', CTR: '0.02', _reach: 'preset-only' })
    expect('reach' in row).toBe(false)
    expect('Frequency' in row).toBe(false)
  })
  test("a matched row with null reach (no delivery) is served as '', as live returns it (the tile reads 0)", async () => {
    marts({ sums: [{ cost: null, impressions: null, CTR: null }], reach: [{ reach: null, frequency: null }] })
    const [row] = await readMetaMarts(ACCOUNT, KPI, '2026-10-01', '2026-10-31')
    expect(row).toMatchObject({ reach: '', Frequency: '', CTR: '' })
  })
  test('a stale reach snapshot: the sums are served, reach is absent and the row says delayed', async () => {
    marts({ pulled: '2026-11-22', sums: [{ cost: 10, impressions: 100, CTR: 0.02 }], reach: [{ reach: 80, frequency: 1.25 }] })
    expect(await readMetaMarts(ACCOUNT, KPI, '2026-10-01', '2026-10-31')).toEqual([{ cost: '10', impressions: '100', CTR: '0.02', _reach: 'delayed' }])
  })
  test('a failed reach lookup: the sums are still served, reach is absent and the row says unavailable', async () => {
    marts({ sums: [{ cost: 10, impressions: 100, CTR: 0.02 }], reach: new Error('job timed out') })
    expect(await readMetaMarts(ACCOUNT, KPI, '2026-10-01', '2026-10-31')).toEqual([{ cost: '10', impressions: '100', CTR: '0.02', _reach: 'unavailable' }])
  })
  test('only the requested reach field is added', async () => {
    marts({ sums: [{ cost: 10 }], reach: [{ reach: 80, frequency: 1.25 }] })
    expect(await readMetaMarts(ACCOUNT, ['cost', 'reach'], '2026-10-01', '2026-10-31')).toEqual([{ cost: '10', reach: '80' }])
  })
  test('creative rows take their one ad\'s reach; helper columns never reach the output', async () => {
    marts({
      sums: [
        { ad_name: 'A', cost: 5, _n_ads: 1, _ad_id: '11' },
        { ad_name: 'B', cost: 4, _n_ads: 2, _ad_id: '12' },
        { ad_name: 'C', cost: 3, _n_ads: 1, _ad_id: '13' },
        { ad_name: 'D', cost: 2, _n_ads: 1, _ad_id: '14' },
      ],
      adReach: [
        { ad_id: '11', reach: 50, frequency: 1.1 },
        { ad_id: '12', reach: 60, frequency: 1.2 },
        { ad_id: '14', reach: null, frequency: null },
      ],
    })
    expect(await readMetaMarts(ACCOUNT, CREATIVE, '2026-10-01', '2026-10-31')).toEqual([
      { ad_name: 'A', cost: '5', reach: '50', Frequency: '1.1' },
      { ad_name: 'B', cost: '4' }, // groups two ads: one ad's reach cannot stand for both
      { ad_name: 'C', cost: '3' }, // its ad has no reach row
      { ad_name: 'D', cost: '2', reach: '', Frequency: '' },
    ])
  })
  test('no ad reach rows at all for the window: every creative row lacks reach', async () => {
    marts({ sums: [{ ad_name: 'A', cost: 5, _n_ads: 1, _ad_id: '11' }], adReach: [] })
    expect(await readMetaMarts(ACCOUNT, CREATIVE, '2026-10-03', '2026-10-17')).toEqual([{ ad_name: 'A', cost: '5', _reach: 'preset-only' }])
  })
  test('a failed ad reach lookup: the creative rows are still served, without reach (C4; C2 failed the whole read)', async () => {
    marts({ sums: [{ ad_name: 'A', cost: 5, _n_ads: 1, _ad_id: '11' }], adReach: new Error('job timed out') })
    expect(await readMetaMarts(ACCOUNT, CREATIVE, '2026-10-01', '2026-10-31')).toEqual([{ ad_name: 'A', cost: '5', _reach: 'unavailable' }])
  })
  test('maxRows reaches the SQL', async () => {
    marts({ sums: [] })
    await readMetaMarts(ACCOUNT, CREATIVE, '2026-10-01', '2026-10-31', 200)
    expect(sqls().find((s) => s.includes('_n_ads'))).toMatch(/limit 200$/)
  })
})
