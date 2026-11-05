import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/aeo-outbound/store', () => ({ getLiveByToken: vi.fn(), recordOpen: vi.fn() }))
// `after` (spec v1.1 §18.5) is captured, not run: a test runs the scheduled work itself, after the Response exists.
const scheduled: Array<() => unknown> = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (cb: () => unknown) => { scheduled.push(cb) },
}))

import { auth } from '@/auth'
import * as store from '@/lib/aeo-outbound/store'
import { GET, HEAD } from './route'
import { LINK_FRESH_MS } from '@/lib/aeo-outbound/opens'

// Every token, id, email and page is invented.
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA'
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const APPROVED = new Date('2026-01-01T00:00:00Z')
const HTML = '<!DOCTYPE html><html><body>Snapshot é <script>1</script></body></html>'
const SESSION_COOKIE = 'authjs.session-token=abc'
const authMock = auth as unknown as ReturnType<typeof vi.fn>
const ctx = (token = TOKEN) => ({ params: Promise.resolve({ token }) })
const req = (init: { method?: string; cookie?: string; ua?: string } = {}) =>
  new Request('https://app.example/snapshot/' + TOKEN, {
    method: init.method ?? 'GET',
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.ua ? { 'user-agent': init.ua } : {}) },
  })
const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c.map(String).join(' '))
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  scheduled.length = 0
  vi.useFakeTimers()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML, approvedAt: APPROVED })
  vi.mocked(store.recordOpen).mockResolvedValue(undefined as never)
})
afterEach(() => { vi.useRealTimers(); warn.mockRestore() })

/** The Response, then the work `after` scheduled, run to the end (advancing fake time by `ms` while it runs). */
const settle = async (p: Promise<Response>, ms = 0) => {
  const r = await p
  const work = Promise.all(scheduled.splice(0).map((cb) => cb()))
  await vi.advanceTimersByTimeAsync(ms)
  await work
  return r
}

test('unknown, malformed, revoked and discarded tokens get the identical 404', async () => {
  const bodies: string[] = []
  for (const [token, live] of [['short', true], [TOKEN, false], ['bad token with spaces!!', true]] as const) {
    vi.mocked(store.getLiveByToken).mockResolvedValue(live ? { id: ID, html: HTML, approvedAt: APPROVED } : undefined)
    const r = await settle(GET(req(), ctx(token)))
    expect(r.status).toBe(404)
    expect(r.headers.get('cache-control')).toBe('no-store')
    bodies.push(await r.text())
  }
  expect(new Set(bodies).size).toBe(1)
  expect(store.recordOpen).not.toHaveBeenCalled()
  expect(authMock).not.toHaveBeenCalled()
})

test('a failed lookup gives the same 404 bytes and headers as an unknown token, with one log line and no token', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(store.getLiveByToken).mockResolvedValue(undefined)
  const unknown = await settle(GET(req(), ctx()))
  const unknownHead = await settle(HEAD(req({ method: 'HEAD' }), ctx()))
  expect(error).not.toHaveBeenCalled()
  vi.mocked(store.getLiveByToken).mockRejectedValue(Object.assign(new Error(`Failed query params: ${TOKEN}`), { cause: { code: '57P01' } }))
  const failed = await settle(GET(req(), ctx()))
  expect(failed.status).toBe(404)
  expect(await failed.text()).toBe(await unknown.text())
  expect([...failed.headers].sort()).toEqual([...unknown.headers].sort())
  const failedHead = await settle(HEAD(req({ method: 'HEAD' }), ctx()))
  expect(failedHead.status).toBe(unknownHead.status)
  expect([...failedHead.headers].sort()).toEqual([...unknownHead.headers].sort())
  const lines = logged(error)
  expect(lines).toEqual(['[aeo-outbound] snapshot lookup failed reason=57P01', '[aeo-outbound] snapshot lookup failed reason=57P01'])
  for (const l of lines) expect(l).not.toContain(TOKEN)
  expect(store.recordOpen).not.toHaveBeenCalled()
  error.mockRestore()
})

test('a live token serves the stored HTML byte for byte with the headers, and no Set-Cookie', async () => {
  authMock.mockResolvedValue(null)
  const r = await settle(GET(req({ cookie: SESSION_COOKIE }), ctx()))
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(HTML)
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  expect(r.headers.get('referrer-policy')).toBe('no-referrer')
  expect(r.headers.get('x-frame-options')).toBe('DENY')
  expect(r.headers.get('content-security-policy')).toBe('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox')
  expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(r.headers.has('set-cookie')).toBe(false)
})

test('a GET with no cookie is counted without reading the session', async () => {
  const r = await settle(GET(req(), ctx()))
  expect(r.status).toBe(200)
  expect(authMock).not.toHaveBeenCalled()
  expect(store.recordOpen).toHaveBeenCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: false })
  expect(warn).not.toHaveBeenCalled()
})

test('HEAD gives the GET status and headers with no body, and never reads the session or records', async () => {
  const g = await settle(GET(req(), ctx()))
  vi.mocked(store.recordOpen).mockClear()
  const h = await settle(HEAD(req({ method: 'HEAD', cookie: SESSION_COOKIE }), ctx()))
  expect(h.status).toBe(g.status)
  expect([...h.headers].sort()).toEqual([...g.headers].sort())
  expect(await h.text()).toBe('')
  expect(authMock).not.toHaveBeenCalled()
  expect(store.recordOpen).not.toHaveBeenCalled()
  vi.mocked(store.getLiveByToken).mockResolvedValue(undefined)
  const h404 = await settle(HEAD(req({ method: 'HEAD' }), ctx()))
  expect(h404.status).toBe(404)
  expect(await h404.text()).toBe('')
})

test('a link-preview bot, a staff session and a 404 are not counted', async () => {
  const bot = await settle(GET(req({ ua: 'Slackbot-LinkExpanding 1.0' }), ctx()))
  expect(bot.status).toBe(200)
  authMock.mockResolvedValue({ user: { role: 'INTERNAL_ANALYST', email: 'staff@avenuez.com' } })
  const staff = await settle(GET(req({ cookie: SESSION_COOKIE }), ctx()))
  expect(await staff.text()).toBe(HTML)
  vi.mocked(store.getLiveByToken).mockResolvedValue(undefined)
  await settle(GET(req(), ctx()))
  expect(store.recordOpen).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
})

test('a client-portal session IS counted', async () => {
  authMock.mockResolvedValue({ user: { role: 'CLIENT_VIEWER', email: 'someone@client.example' } })
  await settle(GET(req({ cookie: SESSION_COOKIE }), ctx()))
  expect(store.recordOpen).toHaveBeenCalledTimes(1)
})

test('§18.5: the Response is returned before the open work runs, and running it records the open', async () => {
  authMock.mockResolvedValue({ user: { role: 'CLIENT_VIEWER', email: 'someone@client.example' } })
  const r = await GET(req({ cookie: SESSION_COOKIE }), ctx())
  expect(await r.text()).toBe(HTML)
  expect(scheduled).toHaveLength(1)
  expect(authMock).not.toHaveBeenCalled()
  expect(store.recordOpen).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  await scheduled[0]()
  expect(authMock).toHaveBeenCalledTimes(1)
  expect(store.recordOpen).toHaveBeenCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: false })
  expect(warn).not.toHaveBeenCalled()
})

test('§18.5: a 404 and a HEAD schedule no open work', async () => {
  await HEAD(req({ method: 'HEAD' }), ctx())
  vi.mocked(store.getLiveByToken).mockResolvedValue(undefined)
  await GET(req(), ctx())
  expect(scheduled).toHaveLength(0)
})

test('§18.5: a session read that resolves after 2s is still counted, with no line (the 1.5s budget is gone)', async () => {
  authMock.mockImplementation(() => new Promise((res) => setTimeout(() => res({ user: { role: 'CLIENT_VIEWER', email: 'someone@client.example' } }), 2000)))
  const r = await settle(GET(req({ cookie: SESSION_COOKIE }), ctx()), 2100)
  expect(await r.text()).toBe(HTML)
  expect(store.recordOpen).toHaveBeenCalledTimes(1)
  expect(warn).not.toHaveBeenCalled()
})

test('§18.5: a write that takes 12s logs one open slow line at 10s and still records', async () => {
  vi.mocked(store.recordOpen).mockImplementation(() => new Promise((res) => setTimeout(() => res(undefined as never), 12_000)) as never)
  const r = await GET(req(), ctx())
  expect(await r.text()).toBe(HTML)
  const work = scheduled[0]()
  await vi.advanceTimersByTimeAsync(9_999)
  expect(warn).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(logged(warn)).toEqual([`[aeo-outbound] open slow id=${ID}`])
  await vi.advanceTimersByTimeAsync(2_000)
  await work
  expect(store.recordOpen).toHaveBeenCalledTimes(1)
  expect(logged(warn)).toEqual([`[aeo-outbound] open slow id=${ID}`])
  expect(vi.getTimerCount()).toBe(0)
})

async function failure(arrange: () => void, cookie?: string, ms = 0) {
  arrange()
  const r = await settle(GET(req({ cookie }), ctx()), ms)
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(HTML)
  expect(r.headers.get('content-security-policy')).toBe('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox')
  return logged(warn)
}
const never = () => new Promise<never>(() => {})

test.each([
  ['session', () => authMock.mockRejectedValue(new Error('boom')), SESSION_COOKIE],
  ['error', () => vi.mocked(store.recordOpen).mockRejectedValue(new Error('boom with ' + TOKEN)), undefined],
])('not counted, one log line with reason=%s, same bytes', async (reason, arrange, cookie) => {
  const lines = await failure(arrange, cookie)
  expect(lines).toEqual([`[aeo-outbound] open not recorded id=${ID} reason=${reason}`])
  expect(lines[0]).not.toContain(TOKEN)
})

test.each([
  ['session read', () => authMock.mockImplementation(never), SESSION_COOKIE],
  ['write', () => vi.mocked(store.recordOpen).mockImplementation(never as never), undefined],
])('§18.5: a %s that never settles logs one open slow line and no timeout line, same bytes', async (_what, arrange, cookie) => {
  arrange()
  const r = await GET(req({ cookie }), ctx())
  expect(await r.text()).toBe(HTML)
  void scheduled[0]()
  await vi.advanceTimersByTimeAsync(60_000)
  const lines = logged(warn)
  expect(lines).toEqual([`[aeo-outbound] open slow id=${ID}`])
  expect(lines[0]).not.toContain(TOKEN)
  expect(lines.join(' ')).not.toContain('reason=timeout')
})

test('the slow timer is cleared when the open work settles', async () => {
  await settle(GET(req(), ctx()))
  expect(store.recordOpen).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('§18.5: the open work resolves and never rejects when the write throws synchronously', async () => {
  const r = await GET(new Request('https://app.example/snapshot/' + TOKEN, { headers: { 'user-agent': 'x' } }), ctx())
  expect(r.status).toBe(200)
  vi.mocked(store.recordOpen).mockImplementation(() => { throw new Error('sync boom') })
  await expect(Promise.resolve(scheduled[0]())).resolves.toBeUndefined()
  expect(logged(warn)).toEqual([`[aeo-outbound] open not recorded id=${ID} reason=error`])
})

test('a slugged segment resolves by its token for GET and HEAD; a bad slug shape is the same 404 (spec v1.1 §16.2)', async () => {
  const ok = await settle(GET(req(), ctx(`example-co-${TOKEN}`)))
  expect(ok.status).toBe(200)
  expect(await ok.text()).toBe(HTML)
  expect(store.getLiveByToken).toHaveBeenLastCalledWith(TOKEN)
  const head = await HEAD(req({ method: 'HEAD' }), ctx(`example-co-${TOKEN}`))
  expect(head.status).toBe(200)
  const unknown = await (await settle(GET(req(), ctx('short')))).text()
  vi.mocked(store.getLiveByToken).mockClear()
  for (const bad of [`Example-${TOKEN}`, `${'a'.repeat(41)}-${TOKEN}`, `example_co-${TOKEN}`]) {
    const r = await settle(GET(req(), ctx(bad)))
    expect(r.status).toBe(404)
    expect(await r.text()).toBe(unknown)
  }
  expect(store.getLiveByToken).not.toHaveBeenCalled()
})

test('an open is classified: its browser family, and whether it came within a minute of the link being created', async () => {
  vi.setSystemTime(new Date('2026-10-08T15:00:30Z'))
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML, approvedAt: new Date('2026-10-08T15:00:00Z') })
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
  await settle(GET(req({ ua }), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Chrome on Mac', linkFresh: true })
  vi.setSystemTime(new Date('2026-10-08T15:01:01Z'))
  await settle(GET(req({ ua }), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Chrome on Mac', linkFresh: false })
})

test('the stored event gets the family only: never the IP address or the full user agent', async () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
  await settle(GET(new Request('https://app.example/snapshot/' + TOKEN, { headers: { 'user-agent': ua, 'x-forwarded-for': '203.0.113.7' } }), ctx()))
  const args = JSON.stringify(vi.mocked(store.recordOpen).mock.calls)
  expect(args).toContain('Firefox on Linux')
  expect(args).not.toContain('203.0.113.7')
  expect(args).not.toContain('rv:131.0')
})

test('C5: an open from an iOS in-app browser more than 60 s after approval is recorded as that family, not as an unknown browser', async () => {
  vi.setSystemTime(new Date(APPROVED.getTime() + 61_000))
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30'
  await settle(GET(req({ ua }), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'In-app browser on iOS', linkFresh: false })
})

test('E11: a row with approvedAt null is not fresh, and the freshness edge is exclusive at LINK_FRESH_MS', async () => {
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML, approvedAt: null })
  await settle(GET(req(), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: false })
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML, approvedAt: APPROVED })
  vi.setSystemTime(new Date(APPROVED.getTime() + LINK_FRESH_MS))
  await settle(GET(req(), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: false })
  vi.setSystemTime(new Date(APPROVED.getTime() + LINK_FRESH_MS - 1))
  await settle(GET(req(), ctx()))
  expect(store.recordOpen).toHaveBeenLastCalledWith(ID, expect.any(Date), { uaFamily: 'Other', linkFresh: true })
})

test('E12: HEAD with a malformed slug segment answers the unknown-token 404 with no body and no lookup', async () => {
  const unknown = await HEAD(req({ method: 'HEAD' }), ctx('short'))
  vi.mocked(store.getLiveByToken).mockClear()
  const r = await HEAD(req({ method: 'HEAD' }), ctx(`Example-${TOKEN}`))
  expect(r.status).toBe(404)
  expect(await r.text()).toBe('')
  expect([...r.headers].sort()).toEqual([...unknown.headers].sort())
  expect(store.getLiveByToken).not.toHaveBeenCalled()
})
