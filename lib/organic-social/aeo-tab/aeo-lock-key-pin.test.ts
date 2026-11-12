import { beforeEach, expect, test, vi } from 'vitest'

// The AEO Informed Social lock keys, pinned the way lib/organic-social/lock-key-pin.test.ts pins the Dash ones (Paul, PR 256): this records
// the keys getAeoTabData HANDS the lock store for fixed requests, not keys recomputed here.
//
// If a hash below changes, the key's inputs changed (a field, its name, the contract version). That is never free: every lock already stored
// under the old key becomes unreachable, and those months silently recapture from live Peec, the only signal a `late lock` warning. Decide
// deliberately, then update the pin: recapture is fine for a month no client has seen; otherwise map the old keys forward first.

const { readLock } = vi.hoisted(() => ({ readLock: vi.fn(async (): Promise<{ response: unknown } | null> => ({ response: { stored: true } })) }))
vi.mock('@/lib/organic-social/response-lock-store', () => ({ readLock, writeLock: vi.fn() }))

import { getAeoTabData } from './data'

const CLIENT = { id: 'c1', slug: 'client-a', dashSocialConfig: { brandId: 7, reportingMonths: { firstMonth: '2026-08' } } }
const SETTING = { allTimeFrom: '2026-01-22', selector: 'Organic Social', fourthGraph: 'instagram' as const }
const request = (range: 'month' | 'ytd' | 'all', start: string, min = 2) => ({
  client: CLIENT, projectId: 'or_fixed_project', setting: SETTING, window: { start, end: '2026-09-30' }, asOf: '2026-09-30', min, range, deadlineMs: 1000, today: '2026-10-12',
})

beforeEach(() => readLock.mockClear())

test('the lock keys a September view hands the store, per range and min, are pinned', async () => {
  const keys: string[] = []
  for (const r of [request('month', '2026-09-01'), request('ytd', '2026-01-01'), request('all', '2026-01-22'), request('month', '2026-09-01', 1)]) {
    readLock.mockClear()
    await getAeoTabData(r)
    keys.push(String((readLock.mock.calls[0] as unknown[])[1]))
  }
  expect(keys).toEqual([
    '60ef45181344f7696594181b6978286701502b122f503294414814ffa9fdd6ab', // Month, min 2
    'b9969d92287f804d616212c57c49a1659d8c34b4b9df80a42063153c8178ee4b', // YTD, min 2
    '08fc004279d1cc6664f9307c89dae1ae6a753b1afa82d60b1eb20cc53b55c55d', // All time, min 2
    'baf3f67ba69271c4dc262308ad5ac41687ca1547f29a966fdee1059ef33be8b6', // Month, min 1
  ])
})
