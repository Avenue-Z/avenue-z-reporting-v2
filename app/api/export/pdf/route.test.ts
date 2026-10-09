import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getClientBySlug, renderPdf } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), renderPdf: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/export/render-pdf', async (orig) => ({ ...(await orig<object>()), renderPdf }))

import { POST } from './route'
import { auth } from '@/auth'
import { ExportNotReadyError, ExportRenderError } from '@/lib/export/render-pdf'

const PDF = new Uint8Array([37, 80, 68, 70, 45])
const RENAISSANCE = { name: 'Renaissance', slug: 'renaissance', enabledReports: ['organic-social'], hiddenReports: [], dashSocialConfig: { brandId: 1 } }
const body = { clientSlug: 'renaissance', subsection: null, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: null, tz: 'America/New_York' }
const post = (b: unknown, cookie = '__Secure-authjs.session-token=SESSION; other=1') =>
  POST(new NextRequest('https://app.example/api/export/pdf', { method: 'POST', body: JSON.stringify(b), headers: { cookie, 'content-type': 'application/json' } }))
const as = (role: string, clientSlug: string) => vi.mocked(auth).mockResolvedValue({ user: { role, clientSlug, email: 'x@example.com' } } as never)

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  getClientBySlug.mockImplementation(async (slug: string) => (slug === 'renaissance' ? RENAISSANCE : { ...RENAISSANCE, name: 'Other', slug }))
  renderPdf.mockResolvedValue(PDF)
  vi.stubEnv('VERCEL_URL', '')
  vi.stubEnv('APP_URL', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

test('no session is refused before anything renders', async () => {
  vi.mocked(auth).mockResolvedValue(null as never)
  const res = await post(body)
  expect(res.status).toBe(403)
  expect(renderPdf).not.toHaveBeenCalled()
})

test("a client can't export another client's page, whatever the body says", async () => {
  as('CLIENT_VIEWER', 'acme')
  for (const b of [body, { ...body, role: 'INTERNAL_ADMIN' }, { ...body, sessionClientSlug: 'renaissance' }]) {
    expect((await post(b)).status).toBe(403)
  }
  expect(renderPdf).not.toHaveBeenCalled()
})

test('a client exports its own page: a PDF named for the client, page and day', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  vi.setSystemTime(new Date('2026-10-07T02:30:00Z'))
  const res = await post(body)
  vi.useRealTimers()
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/pdf')
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Renaissance%20%E2%80%93%20Organic%20Social%20%E2%80%93%202026-10-06.pdf")
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
})

test('the server browser opens the export page as the requester, with only the session cookie', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  await post({ ...body, subsection: 'organic-linkedin' })
  expect(renderPdf).toHaveBeenCalledWith({
    url: 'https://app.example/export/renaissance/organic-social?dateRange=custom%3A2026-09-01%2C2026-09-30&subsection=organic-linkedin&tz=America%2FNew_York',
    cookies: [{ name: '__Secure-authjs.session-token', value: 'SESSION' }],
    // The route's own start, so time spent on auth and the client lookup comes out of the render budgets (Thomas, #332 round 2).
    startedAt: expect.any(Number),
  })
})

test('a chunked session cookie is forwarded whole', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  await post(body, 'authjs.session-token.0=A; authjs.session-token.1=B; theme=dark')
  expect(renderPdf.mock.calls[0][0].cookies).toEqual([
    { name: 'authjs.session-token.0', value: 'A' }, { name: 'authjs.session-token.1', value: 'B' },
  ])
})

test('the deployment URL is preferred for the self-load, as cache-warm does', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  vi.stubEnv('VERCEL_URL', 'proj-abc.vercel.app')
  await post(body)
  expect(renderPdf.mock.calls[0][0].url).toMatch(/^https:\/\/proj-abc\.vercel\.app\/export\/renaissance\/organic-social\?/)
})

test('staff can export any client', async () => {
  as('INTERNAL_ANALYST', 'avenue-z')
  expect((await post({ ...body, clientSlug: 'acme' })).status).toBe(200)
})

test('an invalid body is a bad request', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  expect((await post({ ...body, clientSlug: '../dashboard' })).status).toBe(400)
  expect((await POST(new NextRequest('https://app.example/api/export/pdf', { method: 'POST', body: 'not json' }))).status).toBe(400)
})

test('a client without Organic Social has nothing to export', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  getClientBySlug.mockResolvedValue({ ...RENAISSANCE, enabledReports: ['paid-media'] })
  expect((await post(body)).status).toBe(404)
  getClientBySlug.mockResolvedValue(null)
  expect((await post(body)).status).toBe(404)
})

test('a page still loading is 504 still-loading, a render failure 500 render-failed, and each is logged by step', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  const info = vi.mocked(console.info)
  renderPdf.mockRejectedValueOnce(new ExportNotReadyError('ready'))
  let res = await post(body)
  expect(res.status).toBe(504)
  expect(await res.json()).toEqual({ error: 'still-loading' })
  renderPdf.mockRejectedValueOnce(new ExportRenderError('launch', new Error('spawn ENOENT')))
  res = await post(body)
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'render-failed' })
  const lines = info.mock.calls.map((c) => String(c[0]))
  expect(lines.some((l) => /\[export\] client=renaissance section=organic-social view=overview outcome=still-loading step=ready ms=\d+/.test(l))).toBe(true)
  expect(lines.some((l) => /outcome=render-failed step=launch/.test(l))).toBe(true)
  expect(lines.join('\n')).not.toContain('SESSION')
})

// Off Vercel, without APP_URL the self-load would trust the request's Host header. In production that is refused:
// the server's browser only ever loads this deployment (review of #332).
test('in production with no deployment URL configured, nothing is rendered', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  vi.stubEnv('NODE_ENV', 'production')
  const res = await post(body)
  expect(res.status).toBe(500)
  expect(renderPdf).not.toHaveBeenCalled()
  expect(vi.mocked(console.info).mock.calls.map((c) => String(c[0])).some((l) => /outcome=render-failed step=config/.test(l))).toBe(true)
})

// Vercel rejects a function response over 4.5 MB on its own, after the route has logged success. The route refuses a
// PDF that big itself, says why, and logs it as such (Thomas, #332 route.ts:69).
test('a PDF too big for the platform is a 413 too-large, never logged as ok', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  renderPdf.mockResolvedValueOnce(new Uint8Array(4_000_001))
  const res = await post(body)
  expect(res.status).toBe(413)
  expect(await res.json()).toEqual({ error: 'too-large' })
  const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0]))
  expect(lines.some((l) => /outcome=too-large/.test(l))).toBe(true)
  expect(lines.some((l) => /outcome=ok/.test(l))).toBe(false)
})

// A section the client has enabled but that isn't switched on for the export (lib/export/sections.ts) is
// refused before Chromium launches; the page's button still prints in the browser.
test('a section not switched on for the export is a 400 and nothing renders', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  getClientBySlug.mockResolvedValue({ ...RENAISSANCE, enabledReports: ['organic-social', 'peec-ai'] })
  const res = await post({ ...body, section: 'peec-ai' })
  expect(res.status).toBe(400)
  expect(renderPdf).not.toHaveBeenCalled()
})

// Thomas, #348 route.ts:36: after a rollback or deploy skew a page can post a section the route no longer accepts; the
// refusal's log line must say which section and client it turned away. Raw body values, so escaped and capped.
test('a refused body logs the section and client it named, escaped and capped', async () => {
  as('INTERNAL_ADMIN', 'avenue-z')
  getClientBySlug.mockResolvedValue({ ...RENAISSANCE, enabledReports: ['organic-social', 'peec-ai'] })
  await post({ ...body, section: 'peec-ai' })
  await post({ ...body, clientSlug: 'x'.repeat(200), section: 'evil\nline' })
  const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0])).filter((l) => /outcome=bad-request/.test(l))
  expect(lines[0]).toMatch(/^\[export\] client="renaissance" section="peec-ai" view=overview outcome=bad-request ms=\d+$/)
  expect(lines[1]).toContain(`client="${'x'.repeat(64)}" section="evil\\nline"`)
  expect(lines[1]).not.toContain('\n')
})

test('the server browser opens the section the request names, and the log line says which', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  await post({ ...body, section: 'organic-social', subsection: 'organic-linkedin' })
  expect(renderPdf.mock.calls[0][0].url).toMatch(/\/export\/renaissance\/organic-social\?/)
  const lines = vi.mocked(console.info).mock.calls.map((c) => String(c[0]))
  expect(lines.some((l) => /\[export\] client=renaissance section=organic-social view=organic-linkedin outcome=ok/.test(l))).toBe(true)
})

test('a page loaded before sections were added (no section in the body) still exports Organic Social', async () => {
  as('CLIENT_VIEWER', 'renaissance')
  const res = await post(body) // `body` has no section
  expect(res.status).toBe(200)
  expect(renderPdf.mock.calls[0][0].url).toMatch(/\/export\/renaissance\/organic-social\?/)
})
