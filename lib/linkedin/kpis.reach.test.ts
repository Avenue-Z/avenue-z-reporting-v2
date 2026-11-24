// C4: LinkedIn reach on BigQuery, the tile per state, then through the KPI fetch, linkedinQuery and the mart
// reader. Only the network edges are doubles: BigQuery's query call (a fake of the marts) and Supermetrics' smQuery.
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
import { reachNotice } from '@/lib/bq/reach'
import { getLinkedInKpis, transformLinkedInKpis } from './kpis'

const PRESET_ONLY = 'Reach and frequency are shown for the preset date ranges only.'
const NINETY_DAYS = 'LinkedIn only reports Reach for date ranges up to ~90 days.'
const SUMS = { spend: '100', impressions: '6000', clicks: '40' }
type Kpis = ReturnType<typeof transformLinkedInKpis>
const tile = (k: Kpis, key: string) => k.find((c) => c.key === key)!

describe('transformLinkedInKpis reach per state (C4)', () => {
  test('preset-only: — with the preset tooltip on Reach and Frequency, and no page notice', () => {
    const k = transformLinkedInKpis({ ...SUMS, _reach: 'preset-only' }, null)
    for (const key of ['reach', 'frequency']) expect(tile(k, key)).toMatchObject({ value: '—', tooltip: PRESET_ONLY, delta: undefined })
    expect(tile(k, 'reach').reachState).toBeUndefined()
  })
  test.each([
    ['delayed', "Reach and frequency are waiting on today's snapshot."],
    ['unavailable', "Reach and frequency can't be loaded right now."],
  ] as const)('%s: — with its own tooltip, and the Reach tile carries the state', (state, tooltip) => {
    const k = transformLinkedInKpis({ ...SUMS, _reach: state }, null)
    expect(tile(k, 'reach')).toMatchObject({ value: '—', tooltip, reachState: state })
    expect(tile(k, 'frequency')).toMatchObject({ value: '—', tooltip })
    expect(tile(k, 'spend').value).toBe(100)
  })
  test("a NULL reach (served '') keeps live's ~90-days note", () => {
    const k = transformLinkedInKpis({ ...SUMS, approximateUniqueImpressions: '' }, null)
    expect(tile(k, 'reach')).toMatchObject({ value: '—', tooltip: NINETY_DAYS })
    expect(tile(k, 'reach').reachState).toBeUndefined()
  })
})

/** The account rows of the 2026-11-24 pull; last_year holds NULL reach, as LinkedIn returns for year-long ranges. */
const SNAPSHOT = [
  { start: '2026-11-01', end: '2026-11-23', reach: 3000, frequency: 2 }, // this_month
  { start: '2026-10-01', end: '2026-10-31', reach: 2000, frequency: 2.5 }, // last_month
  { start: '2025-01-01', end: '2025-12-31', reach: null, frequency: null }, // last_year
]
function marts(o: { reach?: Error } = {}) {
  vi.mocked(bqRows).mockImplementation(async (sql: string, p: Record<string, string>) => {
    if (sql.includes('max(event_date)')) return [{ d: '2026-11-23' }]
    if (sql.includes('max(pulled_on)')) return [{ d: '2026-11-24' }]
    if (sql.includes('reach_by_range')) {
      if (o.reach) throw o.reach
      return SNAPSHOT.filter((r) => r.start === p.start && r.end === p.end).map((r) => ({ ...r, pulled_on: '2026-11-24' }))
    }
    return [{ spend: 100, impressions: 6000, clicks: 40, landingPageClicks: 10 }]
  })
}

describe('LinkedIn reach by range through getLinkedInKpis (C4)', () => {
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

  test('a preset window is served from the snapshot; Frequency is impressions over it; never live', async () => {
    marts()
    const k = await getLinkedInKpis('renaissance', 'custom:2026-11-01,2026-11-23', null)
    expect(tile(k, 'reach')).toMatchObject({ value: 3000 })
    expect(tile(k, 'frequency')).toMatchObject({ value: 2, suffix: 'x' })
    expect(reachNotice(k)).toBeNull()
    expect(smQuery).not.toHaveBeenCalled()
  })

  test("a year-long preset whose reach is NULL reads — with the ~90-days note, as live", async () => {
    marts()
    const k = await getLinkedInKpis('renaissance', 'custom:2025-01-01,2025-12-31', null)
    expect(tile(k, 'reach')).toMatchObject({ value: '—', tooltip: NINETY_DAYS })
    expect(reachNotice(k)).toBeNull()
  })

  test('a custom range: — with the preset-only tooltip, no arrow, and the sums served', async () => {
    marts()
    const k = await getLinkedInKpis('renaissance', 'custom:2026-11-03,2026-11-17', 'custom:2026-10-01,2026-10-31')
    for (const key of ['reach', 'frequency']) expect(tile(k, key)).toMatchObject({ value: '—', tooltip: PRESET_ONLY, delta: undefined })
    expect(tile(k, 'spend').value).toBe(100)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a compare window that is itself a stored preset gives the arrow; one that is not gives the value alone', async () => {
    marts()
    const vsPreset = await getLinkedInKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'custom:2026-10-01,2026-10-31')
    expect(tile(vsPreset, 'reach').delta).toBeCloseTo(50)
    expect(tile(vsPreset, 'frequency').delta).toBeCloseTo(((6000 / 3000 - 6000 / 2000) / (6000 / 2000)) * 100)
    const vsCustom = await getLinkedInKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'custom:2026-10-02,2026-10-24')
    expect(tile(vsCustom, 'reach')).toMatchObject({ value: 3000, delta: undefined })
    expect(tile(vsCustom, 'frequency').delta).toBeUndefined()
  })

  test('a reach failure: the sums are still served from BigQuery, — and the notice, and Supermetrics is never called', async () => {
    marts({ reach: new Error('Not found: Table mart_linkedin_reach_by_range') })
    const k = await getLinkedInKpis('renaissance', 'custom:2026-11-01,2026-11-23', 'custom:2026-10-01,2026-10-31')
    expect(tile(k, 'spend').value).toBe(100)
    expect(tile(k, 'reach')).toMatchObject({ value: '—', reachState: 'unavailable' })
    expect(reachNotice(k)).toEqual({ kind: 'reach', reason: 'unavailable' })
    expect(smQuery).not.toHaveBeenCalled()
  })
})
