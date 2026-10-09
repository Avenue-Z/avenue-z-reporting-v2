import { expect, test, vi } from 'vitest'
import { PeecClient, PeecError, retryDelayMs, rowsOf } from './peec'

const KEY = 'skc-test-key-123'
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

test('sends the key as x-api-key, never in the URL', async () => {
  const fetch = vi.fn(async () => json({ data: [] }))
  await new PeecClient(KEY, { fetch }).call('GET', '/projects', { params: { limit: 1 } })
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.peec.ai/customer/v1/projects?limit=1')
  expect(url).not.toContain(KEY)
  expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
})

test('retries a 429 up to 3 attempts, waiting the clamped reset', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': '999' }))
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': 'soon' }))
    .mockResolvedValueOnce(json({ data: [1] }))
  const sleep = vi.fn(async (_ms: number) => {})
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [1] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([20_000, 20_000])
})

test('a third 429 fails', async () => {
  const fetch = vi.fn(async () => json({}, 429, { 'X-RateLimit-Reset': '1' }))
  await expect(new PeecClient(KEY, { fetch, sleep: async () => {} }).call('GET', '/x')).rejects.toThrow('rate limited after 3 attempts')
  expect(fetch).toHaveBeenCalledTimes(3)
})

test('a wait that would pass the deadline fails instead of sleeping', async () => {
  const fetch = vi.fn(async () => json({}, 429, { 'X-RateLimit-Reset': '20' }))
  const sleep = vi.fn(async (_ms: number) => {})
  const c = new PeecClient(KEY, { fetch, sleep, now: () => 0, deadline: 10_000 })
  await expect(c.call('GET', '/x')).rejects.toThrow('waiting would pass the deadline')
  expect(sleep).not.toHaveBeenCalled()
})

test('no call starts after the deadline', async () => {
  const fetch = vi.fn()
  await expect(new PeecClient(KEY, { fetch, now: () => 5, deadline: 5 }).call('GET', '/x')).rejects.toThrow('deadline reached')
  expect(fetch).not.toHaveBeenCalled()
})

test('errors never carry the key', async () => {
  const fetch = vi.fn(async () => new Response(`bad key ${KEY} and again ${KEY}`, { status: 401 }))
  const err = (await new PeecClient(KEY, { fetch }).call('GET', '/x').catch((e) => e)) as PeecError
  expect(err).toBeInstanceOf(PeecError)
  expect(String(err.message)).toContain('HTTP 401')
  expect(String(err.message)).not.toContain(KEY)
})

test('non-JSON body is a named error', async () => {
  const fetch = vi.fn(async () => new Response('<html>', { status: 200 }))
  await expect(new PeecClient(KEY, { fetch }).call('GET', '/x')).rejects.toThrow('response was not JSON')
})

test('paging stops on the first empty page, not a short one', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []]
  const fetch = vi.fn(async () => json({ data: pages.shift() }))
  const rows = await new PeecClient(KEY, { fetch }).all<{ id: string }>('POST', '/reports/brands', { project_id: 'p' }, (r) => r.id, 2)
  expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  expect(fetch).toHaveBeenCalledTimes(3)
  const bodies = fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))
  expect(bodies.map((b) => b.offset)).toEqual([0, 2, 3])
})

test('a row repeated on a later page aborts the pull', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]]
  const fetch = vi.fn(async () => json({ data: pages.shift() ?? [] }))
  await expect(new PeecClient(KEY, { fetch }).all<{ id: string }>('GET', '/brands', {}, (r) => r.id, 2)).rejects.toThrow('repeats a row')
})

test('helpers', () => {
  expect(retryDelayMs(null)).toBe(20_000)
  expect(retryDelayMs('-5')).toBe(0)
  expect(retryDelayMs('7')).toBe(7_000)
  expect(rowsOf({ data: [1] })).toEqual([1])
  expect(rowsOf([2])).toEqual([2])
  expect(rowsOf({ nope: 1 })).toEqual([])
})

test('a call that hits its timeout is a named error', async () => {
  const fetch = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
  await expect(new PeecClient(KEY, { fetch }).call('GET', '/x')).rejects.toThrow('timed out after 45000ms')
})

test('paging past the row cap aborts', async () => {
  let n = 0
  const fetch = vi.fn(async () => json({ data: [{ id: `r${n++}` }, { id: `r${n++}` }] }))
  await expect(new PeecClient(KEY, { fetch, maxRows: 3 }).all<{ id: string }>('GET', '/x', {}, (r) => r.id, 2)).rejects.toThrow('more than 3 rows')
})

test('an empty key is refused up front', () => {
  expect(() => new PeecClient('')).toThrow('PEEC_AI_CUSTOMER_TOKEN is not set')
})

test('a success body that stalls past the timeout is a named error', async () => {
  const fetch = vi.fn(async () => new Response(new ReadableStream({ start() {} }), { status: 200 }))
  const c = new PeecClient(KEY, { fetch, now: () => 0, deadline: 50 })
  await expect(c.call('GET', '/x')).rejects.toThrow('timed out after 50ms')
})

test('an error body that stalls past the timeout is a named error', async () => {
  const fetch = vi.fn(async () => new Response(new ReadableStream({ start() {} }), { status: 500 }))
  const c = new PeecClient(KEY, { fetch, now: () => 0, deadline: 50 })
  await expect(c.call('GET', '/x')).rejects.toThrow('timed out after 50ms')
})

test('the default fetch is not called as a method of the client', async () => {
  vi.stubGlobal('fetch', function (this: unknown) {
    if (this !== globalThis) throw new TypeError('Illegal invocation')
    return Promise.resolve(json({ data: [] }))
  })
  try {
    await expect(new PeecClient(KEY).call('GET', '/x')).resolves.toEqual({ data: [] })
  } finally {
    vi.unstubAllGlobals()
  }
})

const retryable = () => {
  const sleep = vi.fn(async (_ms: number) => {})
  return { sleep }
}

test('a 502 then a 200 succeeds after one 1000ms sleep', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('bad gateway', { status: 502 })).mockResolvedValueOnce(json({ data: [1] }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [1] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('two 502s throw HTTP 502 after one retry', async () => {
  const fetch = vi.fn(async () => new Response('bad gateway', { status: 502 }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).rejects.toThrow('HTTP 502')
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a fetch TypeError then a 200 succeeds', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json({ data: [2] }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [2] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000])
})

test('a body-read TypeError then a 200 succeeds', async () => {
  const broken = { status: 200, headers: new Headers(), json: async () => { throw new TypeError('terminated') } } as unknown as Response
  const fetch = vi.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(json({ data: [3] }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [3] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000])
})

test('a SyntaxError body is not JSON and is not retried', async () => {
  const fetch = vi.fn(async () => new Response('<html>', { status: 200 }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).rejects.toThrow('response was not JSON')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(sleep).not.toHaveBeenCalled()
})

test('a timeout is not retried', async () => {
  const fetch = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) })
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).rejects.toThrow('timed out')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(sleep).not.toHaveBeenCalled()
})

test('a 400 is not retried', async () => {
  const fetch = vi.fn(async () => new Response('nope', { status: 400 }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).rejects.toThrow('HTTP 400')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(sleep).not.toHaveBeenCalled()
})

test('a 502 with 5s left throws without sleeping', async () => {
  const fetch = vi.fn(async () => new Response('bad gateway', { status: 502 }))
  const { sleep } = retryable()
  const c = new PeecClient(KEY, { fetch, sleep, now: () => 0, deadline: 5000 })
  await expect(c.call('GET', '/x')).rejects.toThrow('HTTP 502')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(sleep).not.toHaveBeenCalled()
})

test('429, 502, 429, 200 succeeds: the transient retry spends no 429 attempt', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': '1' }))
    .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    .mockResolvedValueOnce(json({}, 429, { 'X-RateLimit-Reset': '1' }))
    .mockResolvedValueOnce(json({ data: [4] }))
  const { sleep } = retryable()
  await expect(new PeecClient(KEY, { fetch, sleep }).call('GET', '/x')).resolves.toEqual({ data: [4] })
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1000, 1000])
})

test('a key repeated within one page throws naming the key', async () => {
  const fetch = vi.fn(async () => json({ data: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }))
  await expect(new PeecClient(KEY, { fetch }).all<{ id: string }>('GET', '/brands', {}, (r) => r.id, 3)).rejects.toThrow(/repeats a row.*\(a\)/)
})

test('a retried network error message never carries the key', async () => {
  const fetch = vi.fn(async () => { throw new TypeError(`connect failed for ${KEY}`) })
  const err = (await new PeecClient(KEY, { fetch, sleep: async () => {} }).call('GET', '/x').catch((e) => e)) as PeecError
  expect(err.message).toContain('request failed')
  expect(err.message).not.toContain(KEY)
})
