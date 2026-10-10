import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/aeo-outbound/store', () => ({ getLiveByToken: vi.fn(), recordOpenQuery: vi.fn() }))

import { auth } from '@/auth'
import * as store from '@/lib/aeo-outbound/store'
import { GET, HEAD } from './route'

// Every token, id, email and page is invented.
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA'
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
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
  vi.useFakeTimers()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(store.getLiveByToken).mockResolvedValue({ id: ID, html: HTML })
  vi.mocked(store.recordOpenQuery).mockResolvedValue(undefined as never)
})
afterEach(() => { vi.useRealTimers(); warn.mockRestore() })

const settle = async (p: Promise<Response>, ms = 0) => { const done = p; await vi.advanceTimersByTimeAsync(ms); return done }

test('unknown, malformed, revoked and discarded tokens get the identical 404', async () => {
  const bodies: string[] = []
  for (const [token, live] of [['short', true], [TOKEN, false], ['bad token with spaces!!', true]] as const) {
    vi.mocked(store.getLiveByToken).mockResolvedValue(live ? { id: ID, html: HTML } : undefined)
    const r = await settle(GET(req(), ctx(token)))
    expect(r.status).toBe(404)
    expect(r.headers.get('cache-control')).toBe('no-store')
    bodies.push(await r.text())
  }
  expect(new Set(bodies).size).toBe(1)
  expect(store.recordOpenQuery).not.toHaveBeenCalled()
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
  expect(store.recordOpenQuery).not.toHaveBeenCalled()
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
  expect(r.headers.get('content-security-policy')).toBe('sandbox allow-scripts')
  expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(r.headers.has('set-cookie')).toBe(false)
})

test('a GET with no cookie is counted without reading the session', async () => {
  const r = await settle(GET(req(), ctx()))
  expect(r.status).toBe(200)
  expect(authMock).not.toHaveBeenCalled()
  expect(store.recordOpenQuery).toHaveBeenCalledWith(ID, expect.any(Date))
  expect(warn).not.toHaveBeenCalled()
})

test('HEAD gives the GET status and headers with no body, and never reads the session or records', async () => {
  const g = await settle(GET(req(), ctx()))
  vi.mocked(store.recordOpenQuery).mockClear()
  const h = await settle(HEAD(req({ method: 'HEAD', cookie: SESSION_COOKIE }), ctx()))
  expect(h.status).toBe(g.status)
  expect([...h.headers].sort()).toEqual([...g.headers].sort())
  expect(await h.text()).toBe('')
  expect(authMock).not.toHaveBeenCalled()
  expect(store.recordOpenQuery).not.toHaveBeenCalled()
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
  expect(store.recordOpenQuery).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
})

test('a client-portal session IS counted', async () => {
  authMock.mockResolvedValue({ user: { role: 'CLIENT_VIEWER', email: 'someone@client.example' } })
  await settle(GET(req({ cookie: SESSION_COOKIE }), ctx()))
  expect(store.recordOpenQuery).toHaveBeenCalledTimes(1)
})

test('a session read that resolves after the cap is not counted: one timeout line, same bytes', async () => {
  authMock.mockImplementation(() => new Promise((res) => setTimeout(() => res({ user: { role: 'CLIENT_VIEWER', email: 'someone@client.example' } }), 2000)))
  const p = GET(req({ cookie: SESSION_COOKIE }), ctx())
  await vi.advanceTimersByTimeAsync(2100)
  const r = await p
  expect(await r.text()).toBe(HTML)
  expect(store.recordOpenQuery).not.toHaveBeenCalled()
  expect(logged(warn)).toEqual([`[aeo-outbound] open not recorded id=${ID} reason=timeout`])
})

async function failure(arrange: () => void, cookie?: string) {
  arrange()
  const r = await settle(GET(req({ cookie }), ctx()), 1600)
  expect(r.status).toBe(200)
  expect(await r.text()).toBe(HTML)
  expect(r.headers.get('content-security-policy')).toBe('sandbox allow-scripts')
  return logged(warn)
}
const never = () => new Promise<never>(() => {})

test.each([
  ['session', () => authMock.mockRejectedValue(new Error('boom')), SESSION_COOKIE],
  ['error', () => vi.mocked(store.recordOpenQuery).mockRejectedValue(new Error('boom with ' + TOKEN)), undefined],
  ['timeout', () => authMock.mockImplementation(never), SESSION_COOKIE],
  ['timeout', () => vi.mocked(store.recordOpenQuery).mockImplementation(never as never), undefined],
])('not counted, one log line with reason=%s, same bytes', async (reason, arrange, cookie) => {
  const lines = await failure(arrange, cookie)
  expect(lines).toEqual([`[aeo-outbound] open not recorded id=${ID} reason=${reason}`])
  expect(lines[0]).not.toContain(TOKEN)
})

test('the timer is cleared when the race settles', async () => {
  await settle(GET(req(), ctx()))
  expect(vi.getTimerCount()).toBe(0)
})
