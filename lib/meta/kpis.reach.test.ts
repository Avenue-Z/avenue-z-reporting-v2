// C4: Meta reach on BigQuery through the page window, the KPI fetch, metaQuery and the mart reader.
// Only the network edges are doubles: BigQuery's query call (a fake of the marts) and Supermetrics' smQuery.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('@/lib/bq/client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))
vi.mock('@/lib/supermetrics/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/supermetrics/client')>()),
  smQuery: vi.fn(async () => ({ header: [], rows: [] })),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { bqRows } from '@/lib/bq/client'
import { smQuery } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { metaWindow } from '@/lib/bq/meta-window'
import { reachNotice } from '@/lib/bq/reach'
import { DASH } from '@/lib/paid-media/format'
import { getMetaKpis } from './kpis'

const PRESET_ONLY = 'Reach and frequency are shown for the preset date ranges only.'
/** The account rows of the 2026-11-24 pull: rolling presets end the day before the pull. */
const SNAPSHOT = [
  { start: '2026-11-01', end: '2026-11-23', reach: 8000, frequency: 1.5 }, // this_month
  { start: '2026-10-01', end: '2026-10-31', reach: 6000, frequency: 1.2 }, // last_month
]

/** A fake of the marts: `through` is the creative and geo marts' newest day; `reach` fails the reach lookup. */
function marts(o: { through?: string; reach?: Error } = {}) {
  vi.mocked(bqRows).mockImplementation(async (sql: string, p: Record<string, string>) => {
    if (sql.includes('max(event_date)')) return [{ d: o.through ?? '2026-11-23' }]
    if (sql.includes('max(pulled_on)')) return [{ d: '2026-11-24' }]
    if (sql.includes('reach_by_range')) {
      if (o.reach) throw o.reach
      return SNAPSHOT.filter((r) => r.start === p.start && r.end === p.end).map((r) => ({ ...r, pulled_on: '2026-11-24' }))
    }
    return [{ cost: 100, impressions: 12000, inline_link_clicks: 30 }]
  })
}
const tile = (k: Awaited<ReturnType<typeof getMetaKpis>>, key: string) => k.find((c) => c.key === key)!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
  vi.stubEnv('DATA_BACKEND_META', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({ metaConfig: { metaAdAccountId: 'act_1480350426850960' }, smApiKeyEnvVar: 'SM_KEY' } as never)
  vi.mocked(bqRows).mockReset()
  vi.mocked(smQuery).mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.mocked(console.warn).mockRestore()
})

describe('Meta reach by range (C4)', () => {
  test("near miss: This Month clipped to the creative mart's newest day is the snapshot's this_month, so it is served", async () => {
    marts()
    const { dateRange } = await metaWindow('renaissance', 'this_month')
    expect(dateRange).toBe('custom:2026-11-01,2026-11-23')
    const k = await getMetaKpis('renaissance', dateRange!, null)
    expect(tile(k, 'reach')).toMatchObject({ value: 8000 })
    expect(tile(k, 'frequency')).toMatchObject({ value: 1.5, suffix: 'x' })
    expect(reachNotice(k)).toBeNull()
  })

  test('near miss: a window one day short of the snapshot (the creative mart a day behind) is preset-only', async () => {
    marts({ through: '2026-11-22' })
    const { dateRange } = await metaWindow('renaissance', 'this_month')
    expect(dateRange).toBe('custom:2026-11-01,2026-11-22')
    const k = await getMetaKpis('renaissance', dateRange!, null)
    expect(tile(k, 'reach')).toMatchObject({ value: DASH, tooltip: PRESET_ONLY })
    expect(reachNotice(k)).toBeNull()
  })

  test('a custom range: — with the preset-only tooltip, no arrow, and the sums served', async () => {
    marts()
    const k = await getMetaKpis('renaissance', 'custom:2026-11-03,2026-11-17', 'custom:2026-10-01,2026-10-31')
    for (const key of ['reach', 'frequency']) {
      expect(tile(k, key)).toMatchObject({ value: DASH, tooltip: PRESET_ONLY })
      expect(tile(k, key).delta).toBeUndefined()
    }
    expect(tile(k, 'spend').value).toBe(100)
    expect(reachNotice(k)).toBeNull()
  })

  test('a compare window that is itself a stored preset (This Month vs a custom last month) gives the arrow', async () => {
    marts()
    const k = await getMetaKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'custom:2026-10-01,2026-10-31')
    expect(tile(k, 'reach').delta).toBeCloseTo(((8000 - 6000) / 6000) * 100)
    expect(tile(k, 'frequency').delta).toBeCloseTo(((1.5 - 1.2) / 1.2) * 100)
  })

  test('a compare window that is not a preset: the value is shown, with no arrow', async () => {
    marts()
    const k = await getMetaKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'previous_period')
    expect(tile(k, 'reach')).toMatchObject({ value: 8000 })
    expect(tile(k, 'reach').delta).toBeUndefined()
    expect(tile(k, 'frequency').delta).toBeUndefined()
  })

  test('a reach failure: the sums are still served, — and the notice, and Supermetrics is never called', async () => {
    marts({ reach: new Error('Job timed out') })
    const k = await getMetaKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'previous_period')
    expect(tile(k, 'spend').value).toBe(100)
    expect(tile(k, 'reach')).toMatchObject({ value: DASH, reachState: 'unavailable' })
    expect(reachNotice(k)).toEqual({ kind: 'reach', reason: 'unavailable' })
    expect(smQuery).not.toHaveBeenCalled()
  })
})
