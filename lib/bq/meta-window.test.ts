import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./freshness', () => ({ martFreshThrough: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))

import { martFreshThrough } from './freshness'
import { getClientBySlug } from '@/lib/db/queries'
import { metaWindow } from './meta-window'

const warn = () => JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string)

// Noon UTC. resolveDateRange's toISO turns local midnight into a UTC date, which is a day early east of
// UTC (the open toISO follow-up in CLAUDE.md), so these hold on UTC (CI, Vercel) and US zones only.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
  vi.stubEnv('DATA_BACKEND_META', 'bq')
  vi.stubEnv('BQ_CLIENTS', 'renaissance')
  vi.mocked(martFreshThrough).mockReset().mockResolvedValue('2026-11-16')
  vi.mocked(getClientBySlug).mockReset().mockResolvedValue({ metaConfig: { metaAdAccountId: 'act_1480350426850960' } } as never)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.mocked(console.warn).mockRestore()
})

describe('metaWindow', () => {
  test('switched off: the range is untouched and neither BigQuery nor the database is asked', async () => {
    vi.stubEnv('DATA_BACKEND_META', '')
    expect(await metaWindow('renaissance', 'this_month')).toEqual({ dateRange: 'this_month', notice: null })
    expect(martFreshThrough).not.toHaveBeenCalled()
    expect(getClientBySlug).not.toHaveBeenCalled()
  })

  test('a client off the allowlist is untouched', async () => {
    expect(await metaWindow('kind-patches', 'this_month')).toEqual({ dateRange: 'this_month', notice: null })
    expect(getClientBySlug).not.toHaveBeenCalled()
  })

  test('a range the warehouse holds whole keeps its own string and shows no notice', async () => {
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({ dateRange: 'last_30_days', notice: null })
    expect(await metaWindow('renaissance', 'last_year')).toEqual({ dateRange: 'last_year', notice: null })
  })

  test('a range ending today is served through yesterday, with the delayed notice', async () => {
    expect(await metaWindow('renaissance', 'this_month')).toEqual({
      dateRange: 'custom:2026-11-01,2026-11-16',
      notice: { kind: 'clipped', from: null, through: '2026-11-16', empty: false },
    })
  })

  test('stale marts (the nightly has not landed) clip further, with the same notice, and say so in the log', async () => {
    vi.mocked(martFreshThrough).mockResolvedValue('2026-11-13')
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({
      dateRange: 'custom:2026-10-18,2026-11-13',
      notice: { kind: 'clipped', from: null, through: '2026-11-13', empty: false },
    })
    expect(martFreshThrough).toHaveBeenCalledWith('mart_fbads_creative_performance')
    expect(warn()).toMatchObject({ event: 'bq_fallback', source: 'meta', slug: 'renaissance', reason: 'stale', served: 'none' })
  })

  test('a mart one day behind before 10:00 UTC clips quietly: the 08:00 nightly may not have landed', async () => {
    vi.setSystemTime(new Date('2026-11-17T09:30:00Z'))
    vi.mocked(martFreshThrough).mockResolvedValue('2026-11-15')
    expect((await metaWindow('renaissance', 'last_30_days')).notice).toMatchObject({ through: '2026-11-15' })
    expect(console.warn).not.toHaveBeenCalled()
  })

  test('a mart one day behind from 10:00 UTC is a missed nightly, logged the same morning', async () => {
    vi.mocked(martFreshThrough).mockResolvedValue('2026-11-15')
    await metaWindow('renaissance', 'last_30_days')
    expect(warn()).toMatchObject({ source: 'meta', reason: 'stale', served: 'none' })
  })

  test.each([['custom:2026-1-1,2026-11-16'], ['custom:2026-01-01']])('a malformed range from the URL (%s) is unavailable, never served unclipped', async (r) => {
    expect(await metaWindow('renaissance', r)).toEqual({ dateRange: null, notice: { kind: 'unavailable' } })
    expect(warn()).toMatchObject({ source: 'meta', reason: 'unsupported', served: 'none' })
  })

  test("a range starting before the account's history floor is clipped to start on it", async () => {
    expect(await metaWindow('renaissance', '2023-12-01,2024-01-31')).toEqual({
      dateRange: 'custom:2024-01-01,2024-01-31',
      notice: { kind: 'clipped', from: '2024-01-01', through: null, empty: false },
    })
  })

  test('a range entirely before the floor has nothing to fetch', async () => {
    expect(await metaWindow('renaissance', '2023-01-01,2023-12-31')).toEqual({
      dateRange: null,
      notice: { kind: 'clipped', from: '2024-01-01', through: null, empty: true },
    })
  })

  test('a range entirely after the newest day has nothing to fetch (This Week on a Monday)', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z')) // a Monday
    vi.mocked(martFreshThrough).mockResolvedValue('2026-11-15')
    expect(await metaWindow('renaissance', 'this_week')).toEqual({
      dateRange: null,
      notice: { kind: 'clipped', from: null, through: '2026-11-15', empty: true },
    })
  })

  test.each([
    ['no Meta config', { metaConfig: null }],
    ['an account with no verified history', { metaConfig: { metaAdAccountId: 'act_999' } }],
  ])('%s is unavailable, logged as unsupported, and BigQuery is never asked', async (_, client) => {
    vi.mocked(getClientBySlug).mockResolvedValue(client as never)
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({ dateRange: null, notice: { kind: 'unavailable' } })
    expect(warn()).toMatchObject({ source: 'meta', slug: 'renaissance', reason: 'unsupported', served: 'none' })
    expect(martFreshThrough).not.toHaveBeenCalled()
  })

  test('a database failure reading the client is unavailable and logged', async () => {
    vi.mocked(getClientBySlug).mockRejectedValue(new Error('neon down'))
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({ dateRange: null, notice: { kind: 'unavailable' } })
    expect(warn()).toMatchObject({ source: 'meta', reason: 'error', served: 'none' })
  })

  test('a BigQuery failure is unavailable, logged, and never a live range', async () => {
    vi.mocked(martFreshThrough).mockRejectedValue(new Error('403 Access Denied'))
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({ dateRange: null, notice: { kind: 'unavailable' } })
    expect(warn()).toMatchObject({ event: 'bq_fallback', source: 'meta', slug: 'renaissance', reason: 'error', served: 'none' })
  })

  test.each([[null], [''], ['16/11/2026'], [20261116]])('an empty mart or a malformed newest day (%s) is unavailable', async (d) => {
    vi.mocked(martFreshThrough).mockResolvedValue(d as never)
    expect(await metaWindow('renaissance', 'last_30_days')).toEqual({ dateRange: null, notice: { kind: 'unavailable' } })
  })
})
