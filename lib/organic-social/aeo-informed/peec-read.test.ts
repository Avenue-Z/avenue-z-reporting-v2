// lib/organic-social/aeo-informed/peec-read.test.ts
import { describe, it, expect } from 'vitest'
import { createPeecReader, PeecRefusedError, PeecHttpError } from './peec-read'

type Call = { url: string; init: RequestInit }
type Reply = { status: number; body?: string; headers?: Record<string, string> } | 'network-error'

function harness(replies: Reply[], extra: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const sleeps: number[] = []
  const retries: { path: string; label?: string; status: number; attempt: number }[] = []
  const clock = { t: 1_000 }
  let i = 0
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = replies[Math.min(i++, replies.length - 1)]
    if (r === 'network-error') throw new TypeError('fetch failed')
    return { status: r.status, headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null }, text: async () => r.body ?? '{}' }
  }) as unknown as typeof fetch
  const reader = createPeecReader({
    apiKey: 'skc-SECRET-KEY-VALUE', projectId: 'or_proj', fetchImpl,
    sleep: async (ms) => { sleeps.push(ms); clock.t += ms }, now: () => clock.t, minGapMs: 450, timeoutMs: 5_000, onRetry: (i) => retries.push(i), ...extra,
  })
  return { reader, calls, sleeps, clock, retries }
}

describe('allowlist: read only, enforced before any network call', () => {
  it.each([
    ['PUT', '/source-tags/url-assignments'], ['POST', '/source-tags'], ['GET', '/projects'], ['DELETE', '/brands/b1'],
    ['PATCH', '/brands/b1'], ['PUT', '/brands/b1/social-channels'], ['POST', '/classifications/domains'], ['POST', '/reports/links'],
    ['GET', '/chats'], ['POST', '/brands'],
  ])('refuses %s %s', async (method, path) => {
    const h = harness([{ status: 200 }])
    const r = h.reader as unknown as Record<string, (p: string, b?: object) => Promise<unknown>>
    const fn = method === 'GET' ? r.get : r.post
    await expect(fn.call(h.reader, path, {})).rejects.toBeInstanceOf(PeecRefusedError)
    expect(h.calls).toHaveLength(0)
  })
  it('has no method that can send PUT, PATCH or DELETE', () => {
    const h = harness([{ status: 200 }])
    expect(Object.keys(h.reader).sort()).toEqual(['get', 'post'])
  })
  it('allows the six read calls', async () => {
    const h = harness([{ status: 200, body: '{"data":[]}' }])
    for (const p of ['/brands', '/brands/social-channels', '/source-tags', '/classifications/domains']) await h.reader.get(p)
    for (const p of ['/reports/urls', '/reports/brands']) await h.reader.post(p, { start_date: '2026-01-01' })
    expect(h.calls).toHaveLength(6)
  })
})

describe('request shape', () => {
  it('GET puts project_id and the query in the URL, sends the key, and no body', async () => {
    const h = harness([{ status: 200, body: '{"data":[]}' }])
    await h.reader.get('/brands', { limit: '1000' })
    const u = new URL(h.calls[0].url)
    expect(u.origin + u.pathname).toBe('https://api.peec.ai/customer/v1/brands')
    expect(u.searchParams.get('project_id')).toBe('or_proj')
    expect(u.searchParams.get('limit')).toBe('1000')
    expect(h.calls[0].init.method).toBe('GET')
    expect(h.calls[0].init.body).toBeUndefined()
    expect((h.calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('skc-SECRET-KEY-VALUE')
  })
  it('POST sends project_id and the caller body as JSON', async () => {
    const h = harness([{ status: 200, body: '{"data":[]}' }])
    await h.reader.post('/reports/urls', { start_date: '2026-10-07', end_date: '2026-11-05' })
    expect(JSON.parse(h.calls[0].init.body as string)).toEqual({ project_id: 'or_proj', start_date: '2026-10-07', end_date: '2026-11-05' })
    expect(h.calls[0].init.method).toBe('POST')
  })
  it('spaces consecutive requests at least minGapMs apart', async () => {
    const h = harness([{ status: 200, body: '{}' }])
    await h.reader.get('/brands'); await h.reader.get('/brands')
    expect(h.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(450)
  })
})

describe('retries and errors', () => {
  it('on 429 waits Retry-After seconds, then succeeds', async () => {
    const h = harness([{ status: 429, headers: { 'retry-after': '2' } }, { status: 200, body: '{"ok":1}' }])
    expect(await h.reader.get('/brands')).toEqual({ ok: 1 })
    expect(h.sleeps).toContain(2000)
    expect(h.calls).toHaveLength(2)
  })
  it('on 429 without Retry-After waits 5 s times the attempt', async () => {
    const h = harness([{ status: 429 }, { status: 429 }, { status: 200, body: '{}' }])
    await h.reader.get('/brands')
    expect(h.sleeps).toEqual(expect.arrayContaining([5000, 10000]))
  })
  it('gives up after 4 retries on 429 with a PeecHttpError', async () => {
    const h = harness([{ status: 429 }])
    await expect(h.reader.get('/brands')).rejects.toMatchObject({ name: 'PeecHttpError', status: 429 })
    expect(h.calls).toHaveLength(5)
  })
  it('does not retry a 401, and the error never contains the key', async () => {
    const h = harness([{ status: 401, body: '{"message":"Invalid API Key"}' }])
    const e = await h.reader.get('/brands').catch((x) => x as PeecHttpError)
    expect(e).toBeInstanceOf(PeecHttpError)
    expect((e as PeecHttpError).status).toBe(401)
    expect(String((e as Error).message)).not.toContain('SECRET')
    expect(String((e as Error).message)).toContain('/brands')
    expect(h.calls).toHaveLength(1)
  })
  it('retries a 5xx twice, then throws', async () => {
    const h = harness([{ status: 503 }])
    await expect(h.reader.get('/brands')).rejects.toMatchObject({ status: 503 })
    expect(h.calls).toHaveLength(3)
  })
  it('recovers when a 5xx is followed by a 200', async () => {
    const h = harness([{ status: 500 }, { status: 200, body: '{"data":[]}' }])
    expect(await h.reader.get('/brands')).toEqual({ data: [] })
  })
  it('truncates a long error body to 160 characters', async () => {
    const h = harness([{ status: 400, body: 'x'.repeat(1000) }])
    const e = (await h.reader.get('/brands').catch((x) => x)) as Error
    expect(e.message.length).toBeLessThan(260)
  })
  it('throws on a 200 that is not JSON', async () => {
    const h = harness([{ status: 200, body: '<html>oops</html>' }])
    await expect(h.reader.get('/brands')).rejects.toMatchObject({ name: 'PeecHttpError', status: 200 })
  })
  it('retries a network failure twice, then throws status 0', async () => {
    const h = harness(['network-error'])
    await expect(h.reader.get('/brands')).rejects.toMatchObject({ name: 'PeecHttpError', status: 0 })
    expect(h.calls).toHaveLength(3)
  })
  it('aborts a request that hangs past the timeout', async () => {
    const hang = (async (_u: string, init: RequestInit) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))) })) as unknown as typeof fetch
    const reader = createPeecReader({ apiKey: 'k', projectId: 'p', fetchImpl: hang, sleep: async () => {}, timeoutMs: 20, minGapMs: 0 })
    await expect(reader.get('/brands')).rejects.toMatchObject({ name: 'PeecHttpError', status: 0 })
  })
})

describe('operator visibility', () => {
  it('puts the pull label in an HTTP error', async () => {
    const h = harness([{ status: 401 }])
    const e = (await h.reader.post('/reports/urls', {}, 'socials-by-day').catch((x) => x)) as Error
    expect(e.message).toContain('socials-by-day')
    expect(e.message).toContain('/reports/urls')
  })
  it('reports every retry through onRetry with the path, label, status and attempt number, and never the key', async () => {
    const h = harness([{ status: 429 }, { status: 503 }, { status: 200, body: '{}' }])
    await h.reader.get('/brands', {}, 'brands')
    expect(h.retries).toEqual([
      { path: '/brands', label: 'brands', status: 429, attempt: 1 },
      { path: '/brands', label: 'brands', status: 503, attempt: 1 },
    ])
    expect(JSON.stringify(h.retries)).not.toContain('SECRET')
  })
  it('a network failure message names the path and does not echo the key', async () => {
    const h = harness(['network-error'])
    const e = (await h.reader.get('/brands').catch((x) => x)) as Error
    expect(e.message).toContain('/brands')
    expect(e.message).not.toContain('SECRET')
  })
})

describe('fetch options, deadline and Retry-After', () => {
  it('never lets Next cache a response', async () => {
    const h = harness([{ status: 200, body: '{}' }])
    await h.reader.get('/brands'); await h.reader.post('/reports/urls', {})
    expect(h.calls.every((c) => (c.init as { cache?: string }).cache === 'no-store')).toBe(true)
  })
  it('a retry wait longer than the time left throws a deadline error at once instead of sleeping past it', async () => {
    const h = harness([{ status: 429, headers: { 'retry-after': '30' } }], { deadlineMs: 20_000 })
    const e = (await h.reader.get('/brands').catch((x) => x)) as PeecHttpError
    expect(e).toBeInstanceOf(PeecHttpError)
    expect(e.status).toBe(0)
    expect(e.message).toContain('deadline')
    expect(h.calls).toHaveLength(1)
  })
  it('caps the timeout of one attempt at the time left in the whole-call budget', async () => {
    const hang = (async (_u: string, init: RequestInit) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))) })) as unknown as typeof fetch
    const reader = createPeecReader({ apiKey: 'k', projectId: 'p', fetchImpl: hang, sleep: async () => {}, timeoutMs: 5_000, deadlineMs: 60, minGapMs: 0, onRetry: () => {} })
    const t0 = Date.now()
    await expect(reader.get('/brands')).rejects.toMatchObject({ name: 'PeecHttpError', status: 0 })
    expect(Date.now() - t0).toBeLessThan(1_500)
  })
  it('a Retry-After given as an HTTP date falls back to 5 s times the retry number', async () => {
    const h = harness([{ status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }, { status: 200, body: '{}' }])
    await h.reader.get('/brands')
    expect(h.sleeps).toContain(5000)
  })
  it('caps a huge Retry-After at 60 seconds', async () => {
    const h = harness([{ status: 429, headers: { 'retry-after': '86400' } }, { status: 200, body: '{}' }], { deadlineMs: 10_000_000 })
    await h.reader.get('/brands')
    expect(h.sleeps).toContain(60_000)
    expect(h.sleeps).not.toContain(86_400_000)
  })
})
