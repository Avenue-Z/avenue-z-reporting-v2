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
//
// 2026-11-13, later (spec 2026-11-13-aeo-tag-selector-design.md, C4): the key gained `via` (AEO_TAB_SELECTOR_VIA, the source tag), so every
// stored month is one pulled through Jasmine's tag. Re-pinned deliberately after a read-only check at 20:03 UTC: production and dev had no
// AEO lock row; staging had 5 (Renaissance, from that day's review: September MoM; October MoM, YTD, All time and MoM at min 3). Those
// become unreachable and recapture through the tag on their next view. The tag and the old classification gave identical results in every
// pull and view that day, so only Peec's late citations can move a recaptured number, and each recapture logs a `late lock` line.

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
    'd1ee275c168267377198a698632a7d3aa4cf1963c23b4d42c7356e70729afadb', // Month, min 2
    '4403bb37349bf97364875df8a358d9051fc0b3573d4b4a48303009711d301203', // YTD, min 2
    'e8a2ea8ef4b44692fa29275f7e0e33befabddf1f613b3eedc5be7ac4b2b74ce6', // All time, min 2
    '45fd830215f0ee45e8c56eb0ce0aadf7e2814bb357605bdbe9aebbeb20b9b2e4', // Month, min 1
  ])
})
