import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
vi.mock('./client', () => ({ martRef: (t: string) => t, bqRows: vi.fn() }))

import { bqRows } from './client'
import { accountReach, adReach, reachNotice, snapshotStale } from './reach'

const PULLED = 'max(pulled_on)'
const sqls = () => vi.mocked(bqRows).mock.calls.map((c) => c[0] as string)
const lookups = () => sqls().filter((s) => !s.includes(PULLED))
const warn = () => JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string)

/** The reach marts: `pulled` answers each table's newest pull; `rows` answers the row lookup. */
function marts(o: { pulled?: Record<string, unknown>; rows?: Record<string, unknown>[] | Error }) {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes(PULLED)) {
      const table = Object.keys(o.pulled ?? {}).find((t) => sql.includes(`from ${t}`))
      return [{ d: table ? o.pulled![table] : '2026-11-24' }]
    }
    if (o.rows instanceof Error) throw o.rows
    return o.rows ?? []
  })
}

// Noon UTC, as the other window tests: resolveDateRange is a day early east of UTC (CLAUDE.md follow-up).
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

describe('snapshotStale', () => {
  test("today's pull is fresh", () => {
    expect(snapshotStale('2026-11-24')).toBe(false)
  })
  test("yesterday's pull is fresh before 10:00 UTC (the nightly has not landed) and stale from 10:00", () => {
    vi.setSystemTime(new Date('2026-11-24T09:59:00Z'))
    expect(snapshotStale('2026-11-23')).toBe(false)
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'))
    expect(snapshotStale('2026-11-23')).toBe(true)
  })
  test('anything older is stale at any hour', () => {
    vi.setSystemTime(new Date('2026-11-24T09:00:00Z'))
    expect(snapshotStale('2026-11-22')).toBe(true)
  })
  test.each([[null], [undefined], [''], ['2026-11-24T00:00:00'], ['24/11/2026'], [20261124]])('%j is stale: not a readable pull date', (v) => {
    expect(snapshotStale(v)).toBe(true)
  })
})

describe('accountReach', () => {
  test('a preset window is served from its account row, as strings', async () => {
    marts({ rows: [{ reach: 8000, frequency: 1.25, pulled_on: '2026-11-24' }] })
    expect(await accountReach('meta', '1480350426850960', '2026-11-01', '2026-11-23')).toEqual({ reach: '8000', frequency: '1.25' })
    expect(vi.mocked(bqRows).mock.calls.at(-1)![1]).toEqual({ account: '1480350426850960', start: '2026-11-01', end: '2026-11-23' })
    expect(console.warn).not.toHaveBeenCalled()
  })
  test('a NULL reach and frequency are served as empty strings, as live Supermetrics returns them', async () => {
    marts({ rows: [{ reach: null, frequency: null, pulled_on: '2026-11-24' }] })
    expect(await accountReach('linkedin', '503368877', '2025-01-01', '2025-12-31')).toEqual({ reach: '', frequency: '' })
  })
  test('no row for the window (a custom range) is preset-only, and nothing is logged', async () => {
    marts({ rows: [] })
    expect(await accountReach('meta', '1480350426850960', '2026-11-03', '2026-11-17')).toBe('preset-only')
    expect(console.warn).not.toHaveBeenCalled()
  })
  test('a stale table is delayed, logged, and the row is never looked up', async () => {
    marts({ pulled: { mart_fbads_ad_reach_by_range: '2026-11-22' }, rows: [{ reach: 1, frequency: 1, pulled_on: '2026-11-24' }] })
    expect(await accountReach('meta', '1480350426850960', '2026-11-01', '2026-11-23')).toBe('delayed')
    expect(lookups()).toHaveLength(0)
    expect(warn()).toMatchObject({ event: 'bq_fallback', source: 'meta', slug: '1480350426850960', reason: 'stale', served: 'none' })
  })
  test('an empty table (no pull date) is delayed', async () => {
    marts({ pulled: { mart_linkedin_reach_by_range: null } })
    expect(await accountReach('linkedin', '503368877', '2026-11-01', '2026-11-23')).toBe('delayed')
    expect(lookups()).toHaveLength(0)
  })
  test("a matched row from an older pull (that preset's latest pull failed) is delayed", async () => {
    marts({ rows: [{ reach: 8000, frequency: 1.25, pulled_on: '2026-11-20' }] })
    expect(await accountReach('meta', '1480350426850960', '2026-10-01', '2026-10-31')).toBe('delayed')
    expect(warn()).toMatchObject({ source: 'meta', reason: 'stale', served: 'none' })
  })
  test('a BigQuery error is unavailable and logged, never thrown', async () => {
    marts({ rows: new Error('Job timed out') })
    expect(await accountReach('linkedin', '503368877', '2026-11-01', '2026-11-23')).toBe('unavailable')
    expect(warn()).toMatchObject({ event: 'bq_fallback', source: 'linkedin', slug: '503368877', reason: 'error', served: 'none', detail: 'Job timed out' })
  })
  test('the lookup is the account-level row for exactly the window, one row, from the platform table', async () => {
    marts({ rows: [] })
    await accountReach('meta', '1', '2026-11-01', '2026-11-23')
    await accountReach('linkedin', '2', '2026-11-01', '2026-11-23')
    const [meta, li] = lookups()
    for (const sql of [meta, li]) {
      expect(sql).toContain('CAMPAIGN_ID is null')
      expect(sql).toContain('start_date = date(@start) and end_date = date(@end)')
      expect(sql).toContain('cast(ACCOUNT_ID as string) = @account')
      expect(sql).toMatch(/limit 1$/)
      expect(sql).not.toMatch(/sum\(/)
    }
    expect(meta).toContain('from mart_fbads_reach_by_range\n')
    expect(li).toContain('from mart_linkedin_reach_by_range\n')
    // Meta's freshness covers both of its reach tables; LinkedIn's its one.
    expect(sqls().filter((s) => s.includes(PULLED))).toEqual([
      'select cast(max(pulled_on) as string) as d from mart_fbads_reach_by_range',
      'select cast(max(pulled_on) as string) as d from mart_fbads_ad_reach_by_range',
      'select cast(max(pulled_on) as string) as d from mart_linkedin_reach_by_range',
    ])
  })
})

describe('adReach', () => {
  test("each ad's row for the window, keyed by ad id; NULL reach as ''", async () => {
    marts({ rows: [
      { ad_id: '11', reach: 50, frequency: 1.1, pulled_on: '2026-11-24' },
      { ad_id: '14', reach: null, frequency: null, pulled_on: '2026-11-24' },
    ] })
    expect(await adReach('1480350426850960', '2026-10-01', '2026-10-31')).toEqual(new Map([
      ['11', { reach: '50', frequency: '1.1' }],
      ['14', { reach: '', frequency: '' }],
    ]))
    expect(lookups()[0]).toContain('from mart_fbads_ad_reach_by_range\n')
  })
  test('no rows for the window is preset-only', async () => {
    marts({ rows: [] })
    expect(await adReach('1480350426850960', '2026-10-03', '2026-10-17')).toBe('preset-only')
  })
  test('a stale table is delayed with no row lookup; an error is unavailable', async () => {
    marts({ pulled: { mart_fbads_reach_by_range: '2026-11-20' } })
    expect(await adReach('1480350426850960', '2026-10-01', '2026-10-31')).toBe('delayed')
    expect(lookups()).toHaveLength(0)
    marts({ rows: new Error('boom') })
    expect(await adReach('1480350426850960', '2026-10-01', '2026-10-31')).toBe('unavailable')
  })
  test('any matched row from an older pull is delayed', async () => {
    marts({ rows: [
      { ad_id: '11', reach: 50, frequency: 1.1, pulled_on: '2026-11-24' },
      { ad_id: '12', reach: 60, frequency: 1.2, pulled_on: '2026-11-21' },
    ] })
    expect(await adReach('1480350426850960', '2026-10-01', '2026-10-31')).toBe('delayed')
  })
})

describe('reachNotice', () => {
  test("the Reach tile's state is the page's notice; served or preset-only is none", () => {
    expect(reachNotice([{ key: 'spend', label: 'Spend', value: 1 }, { key: 'reach', label: 'Reach', value: '—', reachState: 'delayed' }]))
      .toEqual({ kind: 'reach', reason: 'delayed' })
    expect(reachNotice([{ key: 'reach', label: 'Reach', value: '—', reachState: 'unavailable' }])).toEqual({ kind: 'reach', reason: 'unavailable' })
    expect(reachNotice([{ key: 'reach', label: 'Reach', value: '—' }])).toBeNull()
    expect(reachNotice(undefined)).toBeNull()
  })
})

/** Answers the row lookup in the order its SQL asks for, so the ORDER BY, not the fixture's order, picks the row. */
function ordered(rows: Record<string, unknown>[]) {
  vi.mocked(bqRows).mockImplementation(async (sql: string) => {
    if (sql.includes(PULLED)) return [{ d: '2026-11-24' }]
    const order = /order by (.+) limit 1$/.exec(sql)?.[1] ?? ''
    const keys = order.split(',').map((k) => k.trim().split(/\s+/))
    const sorted = [...rows].sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = String(a[k]).localeCompare(String(b[k])) * (dir === 'desc' ? -1 : 1)
        if (c) return c
      }
      return 0
    })
    return sorted.slice(0, 1)
  })
}

describe('presets that share dates (Thomas, #513)', () => {
  test('this_year and year_to_date from different pulls: the fresh row wins over the stale one, whatever the names', async () => {
    ordered([
      { range_key: 'this_year', reach: 1, frequency: 1, pulled_on: '2026-11-20' },
      { range_key: 'year_to_date', reach: 2490623, frequency: 2.023, pulled_on: '2026-11-24' },
    ])
    expect(await accountReach('meta', '1480350426850960', '2026-01-01', '2026-11-23')).toEqual({ reach: '2490623', frequency: '2.023' })
    ordered([
      { range_key: 'this_year', reach: 2490623, frequency: 2.023, pulled_on: '2026-11-24' },
      { range_key: 'year_to_date', reach: 1, frequency: 1, pulled_on: '2026-11-20' },
    ])
    expect(await accountReach('meta', '1480350426850960', '2026-01-01', '2026-11-23')).toEqual({ reach: '2490623', frequency: '2.023' })
  })
  test('the account lookup orders by pulled_on desc, then range_key, so the answer is the freshest and deterministic', async () => {
    marts({ rows: [] })
    await accountReach('linkedin', '503368877', '2026-01-01', '2026-11-23')
    expect(lookups()[0]).toMatch(/order by pulled_on desc, range_key limit 1$/)
  })
  test("the per-ad lookup keeps an ad's OLDEST pull (min), so any stale copy reads as delayed, never hidden by a fresh one", async () => {
    marts({ rows: [] })
    await adReach('1480350426850960', '2026-01-01', '2026-11-23')
    expect(lookups()[0]).toContain('min(cast(pulled_on as string)) as pulled_on')
    expect(lookups()[0]).not.toMatch(/max\(cast\(pulled_on/)
  })
})
