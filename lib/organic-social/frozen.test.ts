import { expect, test, vi } from 'vitest'
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
    fetchLive: vi.fn(), readSnapshot: vi.fn(async () => snap), writeSnapshot: vi.fn(),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(snap)
  expect(deps.fetchLive).not.toHaveBeenCalled()
})

test('CLOSED period never viewed while open fetches once and inserts', async () => {
  const live = [p(3)]
  const deps = {
    today: '2026-07-23', isoRange: () => ({ start: '2026-06-01', end: '2026-06-30' }),
    clientId: async () => 'c1',
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(async () => []), writeSnapshot: vi.fn(async () => {}),
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
    fetchLive: vi.fn(async () => live), readSnapshot: vi.fn(async () => []), // closed + absent → writes
    writeSnapshot: vi.fn(async () => { throw new Error('relation does not exist') }),
  }
  const out = await fetchTopContentFrozen('renaissance', 'june', 'INSTAGRAM', deps)
  expect(out).toBe(live) // section renders live despite the write throwing
  expect(deps.writeSnapshot).toHaveBeenCalled()
})

test('a snapshot READ failure on a closed period falls through to live', async () => {
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
