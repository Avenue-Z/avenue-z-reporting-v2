// C2 outer test: the Meta page on BigQuery, end to end through every fetcher, metaQuery, metaWindow and the
// mart reader. Only the network edges are doubles: BigQuery's query call and Supermetrics' smQuery.
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
vi.mock('@/components/report-sections/paid-search/kpi-grid', () => ({ KpiGrid: () => <div data-testid="part" /> }))
vi.mock('./creative-table', () => ({ CreativeTable: () => <div data-testid="part" /> }))
vi.mock('./geo-section', () => ({ MetaGeoSection: () => <div data-testid="part" /> }))

import { bqRows } from '@/lib/bq/client'
import { smQuery } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { MetaAdsReport } from './index'

const FRESHNESS = 'max(event_date)'
const PULLED = 'max(pulled_on)'
/**
 * BigQuery double: the freshness probe answers `through`, the reach snapshot's pull date `pulled` (today's by
 * default), every mart read `rows` (none by default, or `read` throws), and the reach lookups `reach` (none by default).
 */
function marts(through: string | Error, read: 'ok' | Error = 'ok', o: { pulled?: string; rows?: Record<string, unknown>[]; reach?: Record<string, unknown>[] | Error } = {}) {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes(FRESHNESS)) { if (through instanceof Error) throw through; return [{ d: through }] }
    if (sql.includes(PULLED)) return [{ d: o.pulled ?? '2026-11-17' }]
    if (read instanceof Error) throw read
    if (sql.includes('reach_by_range')) { if (o.reach instanceof Error) throw o.reach; return o.reach ?? [] }
    return o.rows ?? []
  })
}
const reads = () => vi.mocked(bqRows).mock.calls.filter(([sql]) => !sql.includes(FRESHNESS) && !sql.includes(PULLED))
const readRanges = () => reads().map(([, p]) => `${p.start},${p.end}`)
const page = async (dateRange: string) => render(await MetaAdsReport({ clientSlug: 'renaissance', dateRange }))
const UNAVAILABLE = "Data delayed — Meta data can't be loaded right now. Try again shortly."

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
  vi.stubEnv('DATA_BACKEND_META', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.stubEnv('SM_KEY', 'k')
  vi.mocked(getClientBySlug).mockResolvedValue({
    metaConfig: { metaAdAccountId: 'act_1480350426850960' },
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

describe('Meta on BigQuery (C2): stale → notice, failure → notice, never live', () => {
  test('This Month is served from BigQuery through yesterday, with the notice, on the bare account id', async () => {
    marts('2026-11-16')
    const { getByRole, getAllByTestId } = await page('this_month')
    expect(getByRole('note').textContent).toBe('Data delayed — showing through Nov 16, 2026.')
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(new Set(readRanges())).toEqual(new Set(['2026-11-01,2026-11-16', '2026-10-16,2026-10-31']))
    expect(reads().length).toBeGreaterThan(0)
    expect(reads().every(([, p]) => p.account === '1480350426850960')).toBe(true)
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

  test('BigQuery down: the notice, no parts, never live', async () => {
    marts(new Error('503 backendError'))
    const { getByRole, queryAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe(UNAVAILABLE)
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(reads()).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('the mart reads fail after the freshness check: error cards plus the notice, never live', async () => {
    marts('2026-11-16', new Error('Job timed out'))
    const { getByRole, getAllByText, queryAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe(UNAVAILABLE)
    expect(getAllByText("Couldn't load this section.")).toHaveLength(3)
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a clipped range whose reads fail keeps the clip notice and adds the failure one', async () => {
    marts('2026-11-16', new Error('Job timed out'))
    const { getAllByRole } = await page('this_month')
    expect(getAllByRole('note').map((n) => n.textContent)).toEqual([
      'Data delayed — showing through Nov 16, 2026.',
      UNAVAILABLE,
    ])
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('nothing of the range in the warehouse yet: the notice and no parts', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z')) // a Monday
    marts('2026-11-15')
    const { getByRole, queryAllByTestId } = await page('this_week')
    expect(getByRole('note').textContent).toBe('Data delayed — showing through Nov 15, 2026, so this range has no data yet.')
    expect(queryAllByTestId('part')).toHaveLength(0)
    expect(reads()).toHaveLength(0)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a stale reach snapshot (C4): the parts render, and the page says reach is delayed; never live', async () => {
    marts('2026-11-16', 'ok', { pulled: '2026-11-15', rows: [{ cost: 1 }] })
    const { getByRole, getAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — Meta reach and frequency are waiting on today's snapshot, so they show — for now.")
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(reads().some(([sql]) => sql.includes('reach_by_range'))).toBe(false) // a stale snapshot is never looked up
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a failed reach read (C4): the parts render, and the page says reach cannot be loaded; never live', async () => {
    marts('2026-11-16', 'ok', { rows: [{ cost: 1 }], reach: new Error('Job timed out') })
    const { getByRole, getAllByTestId } = await page('last_30_days')
    expect(getByRole('note').textContent).toBe("Data delayed — Meta reach and frequency can't be loaded right now. Try again shortly.")
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(smQuery).not.toHaveBeenCalled()
  })

  test('a custom range (C4): reach is preset-only, told by the tile alone, with no notice', async () => {
    marts('2026-11-16', 'ok', { rows: [{ cost: 1 }] })
    const { queryByRole, getAllByTestId } = await page('custom:2026-11-03,2026-11-10')
    expect(queryByRole('note')).toBeNull()
    expect(getAllByTestId('part')).toHaveLength(3)
  })

  test('switched off, the page is unchanged: live Supermetrics, no notice, no BigQuery', async () => {
    vi.stubEnv('DATA_BACKEND_META', '')
    const { queryByRole, getAllByTestId } = await page('this_month')
    expect(queryByRole('note')).toBeNull()
    expect(getAllByTestId('part')).toHaveLength(3)
    expect(smQuery).toHaveBeenCalled()
    expect(bqRows).not.toHaveBeenCalled()
  })
})
