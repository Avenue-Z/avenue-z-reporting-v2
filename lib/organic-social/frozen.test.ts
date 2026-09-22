import { expect, test, vi } from 'vitest'
// The default responseLocked dependency reads the client row: keep every existing test database free.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => null) }))
import { isPeriodOpen, fetchTopContentFrozen } from './frozen'
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
