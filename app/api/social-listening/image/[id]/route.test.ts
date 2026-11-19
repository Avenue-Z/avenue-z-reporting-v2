// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/organic-social/social-listening/store', () => ({ findImage: vi.fn() }))

import { auth } from '@/auth'
import { findImage } from '@/lib/organic-social/social-listening/store'
import { GET } from './route'

// Made-up ids and client. October 2026 opened to clients on 2026-11-12.
const ID = '7f1c2e3a-1111-4111-8111-111111111111'
const SCREEN = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])
const PRINT = new Uint8Array([0xff, 0xd8, 0xff, 9])
const CLIENT = {
  id: 'c1', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
  dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand' } },
}
const POST = { id: 'p1', clientId: 'c1', month: '2026-10', status: 'approved' as const, replacedAt: null, deletedAt: null }
const session = (user: unknown) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(user ? { user } : null)
const get = (id = ID, query = '') => GET(new NextRequest(`https://reports.example.test/api/social-listening/image/${id}${query}`), { params: Promise.resolve({ id }) })

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(findImage).mockImplementation(async (_id, print) => ({ bytes: print ? PRINT : SCREEN, post: POST, client: CLIENT }) as never)
})
afterEach(() => { vi.useRealTimers(); error.mockRestore() })

describe('the image route', () => {
  test('serves the screen copy as a JPEG that never changes, private to the viewer', async () => {
    session({ role: 'CLIENT_VIEWER', clientSlug: 'a-client' })
    const r = await get()
    expect(r.status).toBe(200)
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(SCREEN)
    expect(r.headers.get('content-type')).toBe('image/jpeg')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(vi.mocked(findImage).mock.calls[0]).toEqual([ID, false])
  })

  test('?print=1 serves the print copy', async () => {
    session({ role: 'INTERNAL_ADMIN' })
    const r = await get(ID, '?print=1')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(PRINT)
    expect(vi.mocked(findImage).mock.calls[0]).toEqual([ID, true])
  })

  test('404 with no session, before any read', async () => {
    session(null)
    expect((await get()).status).toBe(404)
    expect(findImage).not.toHaveBeenCalled()
  })

  test('404 for an id that is not a uuid, before any read', async () => {
    session({ role: 'INTERNAL_ADMIN' })
    expect((await get('../../etc')).status).toBe(404)
    expect((await get('1 OR 1=1')).status).toBe(404)
    expect(findImage).not.toHaveBeenCalled()
  })

  test('404 for an unknown image', async () => {
    session({ role: 'INTERNAL_ADMIN' })
    vi.mocked(findImage).mockResolvedValueOnce(undefined)
    expect((await get()).status).toBe(404)
  })

  test('404, never 403, for what a client may not see: another client, a draft, a replaced or deleted post, a month not open, the tab off', async () => {
    const cases: [unknown, Record<string, unknown>, Record<string, unknown>][] = [
      [{ role: 'CLIENT_VIEWER', clientSlug: 'other-client' }, {}, {}],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, { status: 'draft' }, {}],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, { replacedAt: new Date() }, {}],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, { status: 'draft', deletedAt: new Date() }, {}],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, { month: '2026-11' }, {}],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, {}, { hiddenReports: ['organic-social-listening'] }],
      [{ role: 'CLIENT_VIEWER', clientSlug: 'a-client' }, {}, { dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }],
    ]
    for (const [who, post, client] of cases) {
      session(who)
      vi.mocked(findImage).mockResolvedValueOnce({ bytes: SCREEN, post: { ...POST, ...post }, client: { ...CLIENT, ...client } } as never)
      const r = await get()
      expect(r.status).toBe(404)
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('a failed read is a 503 that logs the id and the database code only', async () => {
    session({ role: 'INTERNAL_ADMIN' })
    vi.mocked(findImage).mockRejectedValueOnce(Object.assign(new Error('private detail'), { code: '57014' }))
    const r = await get()
    expect(r.status).toBe(503)
    const line = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(line).toBe(`[social-listening] image read failed id=${ID} code=57014`)
  })
})
