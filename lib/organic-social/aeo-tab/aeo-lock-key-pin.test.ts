import { beforeEach, expect, test, vi } from 'vitest'

// The AEO Informed Social lock keys, pinned the way lib/organic-social/lock-key-pin.test.ts pins the Dash ones (Paul, PR 256): this records
// the keys getAeoTabData HANDS the lock store for fixed requests, not keys recomputed here.
//
// If a hash below changes, the key's inputs changed (a field, its name, the contract version). That is never free: every lock already stored
// under the old key becomes unreachable, and those months silently recapture from live Peec, the only signal a `late lock` warning. Decide
// deliberately, then update the pin: recapture is fine for a month no client has seen; otherwise map the old keys forward first.
//
// 2026-11-13, issue 451: the key gained `compare` (only MoM compares; in January MoM and YTD are the same window). Re-pinned deliberately: a
// read-only check that day found no AEO lock row in production, staging or dev (no client has the tab on), so no stored lock was orphaned.

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
    '5354edc46713671812db4cdcde55978ff1fdf6e47554941476b8ef30efa096a6', // Month, min 2
    'bdbb6a4201788834c9ba860548e08fe0487c13864eb7c18b18be35b7c3181bf4', // YTD, min 2
    '1b2a5f69a59c38b0495028e63c67f3f67a89faa8b41797e029ee530a8c02bb14', // All time, min 2
    'fb4cdfa2f2233747bd21052e4007b4c0a75781f847da44a8e6b6313cb6ad90d0', // Month, min 1
  ])
})
