import { afterEach, describe, expect, test, vi } from 'vitest'
// The default responseLocked dependency reads the client row: keep every existing test database free.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => null) }))
import { isPeriodOpen, fetchTopContentFrozen, rollingRangeEnd } from './frozen'
import { resolveDateRange } from '@/lib/date-range'
import type { TopContentPost } from './content-types'

const p = (id: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'x',
  url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

// isPeriodOpen compares a range's end with the newest end a rolling range can have (yesterday on the range
// clock), here 2026-07-22 for a 2026-07-23 today.
test('isPeriodOpen: ending on or after the rolling end (yesterday) is open; before it is closed', () => {
  expect(isPeriodOpen('2026-07-31', '2026-07-22')).toBe(true)  // future end → open
  expect(isPeriodOpen('2026-07-23', '2026-07-22')).toBe(true)  // straddles today → open
  expect(isPeriodOpen('2026-07-22', '2026-07-22')).toBe(true)  // ends yesterday (last_N_days) → open
  expect(isPeriodOpen('2026-06-30', '2026-07-22')).toBe(false) // settled past → closed
  expect(isPeriodOpen('2026-07-01', '2026-06-30')).toBe(true)  // month rollover: on 7/1 the rolling end is 6/30
})

test('OPEN period fetches live and does NOT touch the snapshot (rolling → never frozen)', async () => {
  const live = [p(1)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-23', end: '2026-07-22' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(), writeSnapshot: vi.fn(async () => {}),
  }
  const out = await fetchTopContentFrozen('renaissance', 'last_30_days', 'INSTAGRAM', deps)
  expect(out).toBe(live)
  expect(deps.fetchLive).toHaveBeenCalled()
  expect(deps.writeSnapshot).not.toHaveBeenCalled() // open windows are never persisted
  expect(deps.readSnapshot).not.toHaveBeenCalled()
})

test('CLOSED period with a snapshot reads it and does NOT query live data', async () => {
  const snap = [p(2)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(), readSnapshot: vi.fn(async () => ({ frozen: true, posts: snap })), writeSnapshot: vi.fn(),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(snap)
  expect(deps.fetchLive).not.toHaveBeenCalled()
})

test('CLOSED period frozen while EMPTY returns [] and does NOT re-query live', async () => {
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(), readSnapshot: vi.fn(async () => ({ frozen: true, posts: [] })), writeSnapshot: vi.fn(),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toEqual([])
  expect(deps.fetchLive).not.toHaveBeenCalled() // frozen-empty ≠ absent — no live re-hit
  expect(deps.writeSnapshot).not.toHaveBeenCalled()
})

test('CLOSED period never viewed while open fetches once and inserts', async () => {
  const live = [p(3)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(async () => ({ frozen: false, posts: [] })), writeSnapshot: vi.fn(async () => {}),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(live)
  expect(deps.writeSnapshot).toHaveBeenCalled()
})

test('a snapshot WRITE failure still returns live posts (best-effort persist)', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const live = [p(4)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(async () => ({ frozen: false, posts: [] })), // closed + absent → writes
    writeSnapshot: vi.fn(async () => { throw new Error('relation does not exist') }),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(live) // section renders live despite the write throwing
  expect(deps.writeSnapshot).toHaveBeenCalled()
})

test('a snapshot READ failure serves live but does NOT overwrite the frozen snapshot', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const live = [p(5)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(async () => live),
    readSnapshot: vi.fn(async () => { throw new Error('relation does not exist') }),
    writeSnapshot: vi.fn(async () => {}),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(live)
  expect(deps.fetchLive).toHaveBeenCalled()
  expect(deps.writeSnapshot).not.toHaveBeenCalled() // a transient read blip must not clobber frozen numbers
})

test('a failed client lookup skips the snapshot and serves live', async () => {
  const live = [p(6)]
  const deps = {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => { throw new Error('db down') },
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(), writeSnapshot: vi.fn(),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(live)
  expect(deps.readSnapshot).not.toHaveBeenCalled()
  expect(deps.writeSnapshot).not.toHaveBeenCalled()
})

// Lock every number (D27): a client on locked months locks Top Content with every other number, so
// it never reads or writes the older freeze table.
test('a locked-months client skips the freeze table entirely on a closed window', async () => {
  const live = [p(9)]
  const readSnapshot = vi.fn(); const writeSnapshot = vi.fn()
  const out = await fetchTopContentFrozen('client-a', 'june', 'INSTAGRAM', {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1', fetchLive: async () => live,
    readSnapshot: readSnapshot as never, writeSnapshot: writeSnapshot as never,
    responseLocked: async () => true,
  })
  expect(out).toEqual(live)
  expect(readSnapshot).not.toHaveBeenCalled()
  expect(writeSnapshot).not.toHaveBeenCalled()
})

test('fail closed: if the opt-in check fails, the error propagates rather than writing the old table', async () => {
  const writeSnapshot = vi.fn()
  await expect(fetchTopContentFrozen('client-a', 'june', 'INSTAGRAM', {
    rollingEnd: '2026-07-22', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1', fetchLive: async () => [p(9)],
    readSnapshot: vi.fn() as never, writeSnapshot: writeSnapshot as never,
    responseLocked: async () => { throw new Error('client read failed') },
  })).rejects.toThrow('client read failed')
  expect(writeSnapshot).not.toHaveBeenCalled()
})

// #278: the freeze judges "is this range over?" on the same clock resolveDateRange used to end the range
// (lib/date-range.ts:44-45: the machine's local midnight). Before, it used the UTC date, so on a machine
// behind UTC in the evening a rolling range read as closed and was frozen early.
describe('the freeze and the rolling range agree on the clock (#278)', () => {
  const realTz = process.env.TZ
  // Put TZ back exactly: assigning undefined would store the string "undefined", which Node reads as UTC.
  afterEach(() => { if (realTz === undefined) delete process.env.TZ; else process.env.TZ = realTz; vi.useRealTimers() })
  const at = (tz: string, iso: string) => {
    process.env.TZ = tz
    // Setting TZ takes effect only in a forked worker (Vitest's default pool), not in a worker thread: fail
    // loudly if the zone did not apply, rather than run the row in the host's zone (Paul, #282).
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz)
    vi.useFakeTimers(); vi.setSystemTime(new Date(iso))
  }

  test('New York at 9:30 pm: last_30_days is still open, as the range itself is still rolling', () => {
    at('America/New_York', '2026-09-24T01:30:00Z') // 9:30 pm on 9/23 in New York
    const { endDate } = resolveDateRange('last_30_days')
    expect(endDate).toBe('2026-09-22')
    expect(isPeriodOpen(endDate, rollingRangeEnd())).toBe(true)
  })

  test.each([
    ['UTC', '2026-09-24T01:30:00Z'], ['UTC', '2026-09-23T23:59:00Z'], ['UTC', '2026-09-24T00:01:00Z'],
    ['America/New_York', '2026-09-24T03:59:00Z'], ['America/New_York', '2026-09-24T04:01:00Z'], ['America/New_York', '2026-12-24T04:30:00Z'],
    ['America/Los_Angeles', '2026-09-24T06:59:00Z'], ['America/Los_Angeles', '2026-09-24T07:01:00Z'],
    ['Asia/Tokyo', '2026-09-23T14:59:00Z'], ['Asia/Tokyo', '2026-09-23T15:01:00Z'],
    // Paul, #282: the day after a UTC+0 zone leaves summer time, a UTC subtraction and the range's local one disagree.
    ['Europe/London', '2026-10-26T12:00:00Z'], ['Europe/Lisbon', '2026-10-26T12:00:00Z'], ['Europe/London', '2027-11-01T12:00:00Z'],
  ])('%s at %s: every rolling preset stays open', (tz, iso) => {
    at(tz, iso)
    for (const n of [7, 30, 90]) expect(isPeriodOpen(resolveDateRange(`last_${n}_days`).endDate, rollingRangeEnd())).toBe(true)
  })

  test('a finished month is never frozen before its last day is over on the machine; east of UTC it freezes a day late', () => {
    const august = '2026-08-31'
    at('America/New_York', '2026-09-02T01:30:00Z') // 9:30 pm on 9/1: August still settling, as before 8 pm
    expect(isPeriodOpen(august, rollingRangeEnd())).toBe(true)
    at('America/New_York', '2026-09-02T04:30:00Z') // 12:30 am on 9/2
    expect(isPeriodOpen(august, rollingRangeEnd())).toBe(false)
    at('Asia/Tokyo', '2026-09-01T16:00:00Z') // 1 am on 9/2 in Tokyo: a day late, never early
    expect(isPeriodOpen(august, rollingRangeEnd())).toBe(true)
    at('Asia/Tokyo', '2026-09-02T16:00:00Z') // 1 am on 9/3 in Tokyo
    expect(isPeriodOpen(august, rollingRangeEnd())).toBe(false)
  })

  test('on a machine set to UTC, the boundary is exactly the one it used before: the UTC date minus one day', () => {
    for (const iso of ['2026-09-24T00:00:00Z', '2026-09-24T03:59:59Z', '2026-09-24T23:59:59Z', '2027-01-01T00:30:00Z', '2026-10-26T12:00:00Z']) {
      at('UTC', iso)
      const y = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`); y.setUTCDate(y.getUTCDate() - 1)
      expect(rollingRangeEnd()).toBe(y.toISOString().slice(0, 10))
    }
  })

  test('the default the app uses: in New York at 9:30 pm a rolling range is served live, never read from or written to the freeze table', async () => {
    at('America/New_York', '2026-09-24T01:30:00Z')
    const readSnapshot = vi.fn(async () => ({ frozen: false, posts: [] as TopContentPost[] }))
    const writeSnapshot = vi.fn(async () => {})
    const posts = await fetchTopContentFrozen('some-client', 'last_30_days', 'INSTAGRAM', {
      clientId: async () => 'client-uuid', fetchLive: async () => [p(1)], readSnapshot, writeSnapshot, responseLocked: async () => false,
    })
    expect(posts.map((x) => x.id)).toEqual([1])
    expect(readSnapshot).not.toHaveBeenCalled()
    expect(writeSnapshot).not.toHaveBeenCalled()
  })
})
