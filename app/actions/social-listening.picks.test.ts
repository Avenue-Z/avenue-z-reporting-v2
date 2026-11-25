// @vitest-environment node
// The Show / Hide action for authors and overview cards (plan 2026-11-24, Unit F). The store is replaced; the store's SQL is
// proven on real Postgres in lib/organic-social/social-listening/store.pglite.test.ts. Made-up names and ids only.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const h = vi.hoisted(() => ({
  client: () => ({
    id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
    dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand' } },
  }),
  upload: (month: string, topic = 'brand') => ({
    id: `u-${month}`, month, topic, beforeOpen: true, uploadedAt: new Date('2026-11-02T00:00:00Z'),
    data: {
      version: 1, topic, month, results: 1, daily: [], sentiment: { pos: 1, neu: 0, neg: 0 }, sentimentByMedia: [], themes: [],
      influencers: [{ authorId: 'id-1', name: 'Author 1', network: 'SOCIALMEDIA_INSTAGRAM', posts: 3, pos: 3, neu: 0, neg: 0, reach: 1, engagement: 1 }],
      overview: [{ label: 'Most active author', who: 'Author 1', network: 'Instagram', value: 3, unit: 'Posts' }],
    },
  }),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => h.client()) }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({
  insertPick: vi.fn(async () => {}),
  getSlMonth: vi.fn(async () => ({ uploads: [h.upload('2026-10')], history: [], posts: [], trends: null })),
}))

import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import * as store from '@/lib/organic-social/social-listening/store'
import { pickSlItemAction } from './social-listening'

const as = (role: string, email: string | null) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, email } })
const OCT = 'custom:2026-10-01,2026-10-31'
const HIDE = { clientSlug: 'a-client', range: OCT, kind: 'author', key: 'id-1', state: 'hidden' }

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  as('INTERNAL_ANALYST', 'writer@avenuez.com')
})
afterEach(() => { vi.useRealTimers(); error.mockRestore() })

test("hiding an author in the served month's upload stores a new pick by the signed-in editor", async () => {
  expect(await pickSlItemAction(HIDE)).toEqual({ ok: true })
  expect(store.getSlMonth).toHaveBeenCalledWith('client-uuid', ['2026-10'])
  expect(store.insertPick).toHaveBeenCalledWith({ clientId: 'client-uuid', month: '2026-10', kind: 'author', key: 'id-1', state: 'hidden', by: 'writer@avenuez.com' })
})

test('a card is picked by its label', async () => {
  expect(await pickSlItemAction({ ...HIDE, kind: 'card', key: 'Most active author', state: 'shown' })).toEqual({ ok: true })
  expect(store.insertPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'card', key: 'Most active author', state: 'shown' }))
})

test('a client role, or staff without an @avenuez.com email, is refused, with nothing read or written', async () => {
  as('CLIENT_ADMIN', 'writer@avenuez.com')
  expect(await pickSlItemAction(HIDE)).toEqual({ ok: false, error: 'forbidden' })
  as('INTERNAL_ADMIN', 'someone@example.com')
  expect(await pickSlItemAction(HIDE)).toEqual({ ok: false, error: 'forbidden' })
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(store.insertPick).not.toHaveBeenCalled()
})

test.each([
  [{ ...HIDE, kind: 'post' }],
  [{ ...HIDE, state: 'maybe' }],
  [{ ...HIDE, key: '' }],
  [{ ...HIDE, key: 'x'.repeat(501) }],
  [{ ...HIDE, key: 5 }],
])('a malformed pick is refused before any read: %j', async (input) => {
  expect(await pickSlItemAction(input as never)).toEqual({ ok: false, error: 'invalid pick' })
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(store.insertPick).not.toHaveBeenCalled()
})

test("an author or card that is not in the month's brand upload is refused", async () => {
  expect(await pickSlItemAction({ ...HIDE, key: 'id-9' })).toEqual({ ok: false, error: 'That author is not in this month\'s export. Reload to see it.' })
  expect(await pickSlItemAction({ ...HIDE, kind: 'card', key: 'Most active site' })).toEqual({ ok: false, error: 'That card is not in this month\'s export. Reload to see it.' })
  expect(store.insertPick).not.toHaveBeenCalled()
})

test('a month without a brand upload, or a month that has not ended, is refused', async () => {
  vi.mocked(store.getSlMonth).mockResolvedValueOnce({ uploads: [], history: [], posts: [], trends: null })
  expect(await pickSlItemAction(HIDE)).toEqual({ ok: false, error: 'That author is not in this month\'s export. Reload to see it.' })
  expect(await pickSlItemAction({ ...HIDE, range: 'custom:2026-11-01,2026-11-30' })).toEqual({ ok: false, error: 'Upload opens when November 2026 ends.' })
  expect(store.insertPick).not.toHaveBeenCalled()
})

test('a failed write logs the client, month and key, and returns a plain message', async () => {
  vi.mocked(store.insertPick).mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '08006' }))
  expect(await pickSlItemAction(HIDE)).toEqual({ ok: false, error: 'Could not save. Try again.' })
  expect(error).toHaveBeenCalledWith('[social-listening] pick failed slug=a-client month=2026-10 kind=author key=id-1 code=08006')
})
