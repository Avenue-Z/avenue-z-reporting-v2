// @vitest-environment node
// The theme trend actions (spec sections 7, 8 and 10). The store is replaced; its SQL, including the approve-what-you-saw
// check, is proven on real Postgres in lib/organic-social/social-listening/store.pglite.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const h = vi.hoisted(() => ({
  client: (cfg: Record<string, unknown> = {}) => ({
    id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
    dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand' }, ...cfg },
  }),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => h.client()) }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({
  saveTrendsDraft: vi.fn(async () => {}), approveTrends: vi.fn(async () => true),
}))

import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { approveTrends, saveTrendsDraft } from '@/lib/organic-social/social-listening/store'
import { approveTrendsAction, saveTrendsAction } from './social-listening'

const as = (role: string, email: string) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, email } })
const OCT = 'custom:2026-10-01,2026-10-31'
const TEXT = { emerging: 'made up theme +5.1K%', decreasing: 'other theme -77%', newThemes: 'new theme' }
const LISTS = {
  emerging: [{ theme: 'made up theme', change: '+5.1K%' }],
  decreasing: [{ theme: 'other theme', change: '-77%' }],
  newThemes: [{ theme: 'new theme', change: null }],
}
const FORBIDDEN = { ok: false, error: 'forbidden' }

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com'
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); delete process.env.COMMENTARY_APPROVERS; error.mockRestore() })

describe('saveTrendsAction', () => {
  test('staff save the three lists as a draft for the served finished month', async () => {
    as('INTERNAL_ANALYST', 'writer@avenuez.com')
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: OCT, ...TEXT })).toEqual({ ok: true })
    expect(vi.mocked(saveTrendsDraft).mock.calls[0][0]).toEqual({ clientId: 'client-uuid', month: '2026-10', lists: LISTS, by: 'writer@avenuez.com' })
  })
  test('a client role is refused; nothing is read or written', async () => {
    as('CLIENT_ADMIN', 'writer@avenuez.com')
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: OCT, ...TEXT })).toEqual(FORBIDDEN)
    expect(getClientBySlug).not.toHaveBeenCalled()
    expect(saveTrendsDraft).not.toHaveBeenCalled()
  })
  test('the client and setting are re-checked, and the month comes from the range like uploads', async () => {
    as('INTERNAL_ANALYST', 'writer@avenuez.com')
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({ socialListening: undefined }) as never)
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: OCT, ...TEXT })).toEqual({ ok: false, error: 'Social listening is not on for this client.' })
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: 'custom:2026-11-01,2026-11-18', ...TEXT })).toEqual({ ok: false, error: 'Upload opens when November 2026 ends.' })
    expect(saveTrendsDraft).not.toHaveBeenCalled()
  })
  test('the lists are bounded', async () => {
    as('INTERNAL_ANALYST', 'writer@avenuez.com')
    const many = Array.from({ length: 26 }, (_, i) => `t${i}`).join('\n')
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: OCT, ...TEXT, emerging: many })).toEqual({ ok: false, error: 'Emerging has more than 25 themes.' })
  })
  test('a failed write says so and logs the code only', async () => {
    as('INTERNAL_ANALYST', 'writer@avenuez.com')
    vi.mocked(saveTrendsDraft).mockRejectedValueOnce(Object.assign(new Error('private'), { code: '08006' }))
    expect(await saveTrendsAction({ clientSlug: 'a-client', range: OCT, ...TEXT })).toEqual({ ok: false, error: 'Could not save. Try again.' })
    expect(error.mock.calls.map((c) => c.join(' ')).join('\n')).toBe('[social-listening] save trends failed slug=a-client code=08006')
  })
})

describe('approveTrendsAction', () => {
  test('only an approver, and only the lists they were shown', async () => {
    as('INTERNAL_ADMIN', 'approver@avenuez.com')
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: LISTS })).toEqual({ ok: true })
    expect(vi.mocked(approveTrends).mock.calls[0][0]).toEqual({ clientId: 'client-uuid', month: '2026-10', by: 'approver@avenuez.com', seen: LISTS })
  })
  test('extra keys from the browser are dropped, so the comparison is on the stored shape', async () => {
    as('INTERNAL_ADMIN', 'approver@avenuez.com')
    const extra = { ...LISTS, emerging: [{ theme: 'made up theme', change: '+5.1K%', key: 1 }] }
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: extra as never })).toEqual({ ok: true })
    expect(vi.mocked(approveTrends).mock.calls[0][0].seen).toEqual(LISTS)
  })
  test('staff who are not approvers are refused', async () => {
    as('INTERNAL_ANALYST', 'writer@avenuez.com')
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: LISTS })).toEqual(FORBIDDEN)
    expect(approveTrends).not.toHaveBeenCalled()
  })
  test('nothing to approve, or changed since the page opened', async () => {
    as('INTERNAL_ADMIN', 'approver@avenuez.com')
    vi.mocked(approveTrends).mockResolvedValueOnce(false)
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: LISTS })).toEqual({ ok: false, error: 'The trends changed since you opened the page, or are already approved. Reload to see them.' })
  })
  test('what was seen must be three lists of themes', async () => {
    as('INTERNAL_ADMIN', 'approver@avenuez.com')
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: { emerging: 'x' } as never })).toEqual({ ok: false, error: 'invalid trends' })
    expect(await approveTrendsAction({ clientSlug: 'a-client', range: OCT, seen: { ...LISTS, newThemes: [{ theme: 5, change: null }] } as never })).toEqual({ ok: false, error: 'invalid trends' })
    expect(approveTrends).not.toHaveBeenCalled()
  })
})
