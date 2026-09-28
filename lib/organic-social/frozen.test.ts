import { afterEach, describe, expect, test, vi } from 'vitest'
// The default responseLocked dependency reads the client row: keep every existing test database free.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => null) }))
import { isPeriodOpen, fetchTopContentFrozen, freezeToday } from './frozen'
import { resolveDateRange } from '@/lib/date-range'
import type { TopContentPost } from './content-types'

const p = (id: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'x',
  url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 }, sourceType: 'organic',
})

test('isPeriodOpen: today/future/yesterday is open; ≥2 days past is closed', () => {
  expect(isPeriodOpen('2026-07-31', '2026-07-23')).toBe(true)  // future end → open
  expect(isPeriodOpen('2026-07-23', '2026-07-23')).toBe(true)  // straddles today → open
  expect(isPeriodOpen('2026-07-22', '2026-07-23')).toBe(true)  // ends yesterday (last_N_days) → open
  expect(isPeriodOpen('2026-06-30', '2026-07-23')).toBe(false) // settled past → closed
  expect(isPeriodOpen('2026-07-01', '2026-07-01')).toBe(true)  // month rollover, end today → open
})

test('OPEN period fetches live and does NOT touch the snapshot (rolling → never frozen)', async () => {
  const live = [p(1)]
  const deps = {
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-23', end: '2026-07-22' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(), readSnapshot: vi.fn(async () => ({ frozen: true, posts: snap })), writeSnapshot: vi.fn(),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(snap)
  expect(deps.fetchLive).not.toHaveBeenCalled()
})

test('CLOSED period frozen while EMPTY returns [] and does NOT re-query live', async () => {
  const deps = {
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
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
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1', fetchLive: async () => [p(9)],
    readSnapshot: vi.fn() as never, writeSnapshot: writeSnapshot as never,
    responseLocked: async () => { throw new Error('client read failed') },
  })).rejects.toThrow('client read failed')
  expect(writeSnapshot).not.toHaveBeenCalled()
})

// #278: the freeze judges "is this range over?" on the same clock resolveDateRange used to end the range
// (lib/date-range.ts:44-45: the machine's local midnight). Before, it used the UTC date, so on a machine
// behind UTC in the evening a rolling range read as closed and was frozen early.
describe('freezeToday and the rolling range agree on the clock (#278)', () => {
  const realTz = process.env.TZ
  afterEach(() => { process.env.TZ = realTz; vi.useRealTimers() })
  const at = (tz: string, iso: string) => { process.env.TZ = tz; vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }

  test('New York at 9:30 pm: last_30_days is still open, as the range itself is still rolling', () => {
    at('America/New_York', '2026-09-24T01:30:00Z') // 9:30 pm on 9/23 in New York
    const { endDate } = resolveDateRange('last_30_days')
    expect(endDate).toBe('2026-09-22')
    expect(isPeriodOpen(endDate, freezeToday())).toBe(true)
  })

  test.each([
    ['UTC', '2026-09-24T01:30:00Z'], ['UTC', '2026-09-23T23:59:00Z'], ['UTC', '2026-09-24T00:01:00Z'],
    ['America/New_York', '2026-09-24T03:59:00Z'], ['America/New_York', '2026-09-24T04:01:00Z'], ['America/New_York', '2026-12-24T04:30:00Z'],
    ['America/Los_Angeles', '2026-09-24T06:59:00Z'], ['America/Los_Angeles', '2026-09-24T07:01:00Z'],
    ['Asia/Tokyo', '2026-09-23T14:59:00Z'], ['Asia/Tokyo', '2026-09-23T15:01:00Z'],
  ])('%s at %s: every rolling preset stays open', (tz, iso) => {
    at(tz, iso)
    for (const n of [7, 30, 90]) expect(isPeriodOpen(resolveDateRange(`last_${n}_days`).endDate, freezeToday())).toBe(true)
  })

  test('on a machine set to UTC, today is exactly the UTC date it used before', () => {
    for (const iso of ['2026-09-24T00:00:00Z', '2026-09-24T03:59:59Z', '2026-09-24T23:59:59Z', '2027-01-01T00:30:00Z']) {
      at('UTC', iso)
      expect(freezeToday()).toBe(new Date().toISOString().slice(0, 10))
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
