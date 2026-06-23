// lib/dash-social/client.test.ts
// Run: npx tsx lib/dash-social/client.test.ts
import { strict as assert } from 'node:assert'
import { DashSocialClient, DashAuthError, DashRateLimitError, DashTimeoutError } from './client'

// Fake fetch: returns scripted responses by call index.
// Optionally captures init objects for assertion.
function fakeFetch(responses: Array<{ status: number; headers?: Record<string,string>; body?: unknown }>, captured?: RequestInit[]) {
  let i = 0
  return async (_url: string | URL | Request, init?: RequestInit) => {
    if (captured && init) captured.push(init)
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body == null ? '' : JSON.stringify(r.body), {
      status: r.status, headers: r.headers,
    }) as unknown as Response
  }
}

(async () => {
  // 1. happy path passes Bearer + parses JSON
  {
    const inits: RequestInit[] = []
    const c = new DashSocialClient({ token: 't', fetchImpl: fakeFetch([{ status: 200, body: { data: {} } }], inits) })
    const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['IMPRESSIONS'], startDate: '2026-05-01', endDate: '2026-05-31' })
    assert.deepEqual(out, { data: {} })
    assert.equal((inits[0]?.headers as Record<string, string>)?.Authorization, 'Bearer t')
  }
  // 2. 401 -> DashAuthError
  {
    const c = new DashSocialClient({ token: 't', fetchImpl: fakeFetch([{ status: 401, body: { error: 'nope' } }]) })
    await assert.rejects(() => c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['IMPRESSIONS'], startDate: 'a', endDate: 'b' }), DashAuthError)
  }
  // 3. 429 then 200 -> retried (maxRetries small, no real sleep)
  {
    const c = new DashSocialClient({ token: 't', maxRetries: 2, fetchImpl: fakeFetch([{ status: 429, headers: { 'Retry-After': '0' } }, { status: 200, body: { data: {} } }]) })
    const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' })
    assert.deepEqual(out, { data: {} })
  }
  // 4. persistent 429 -> DashRateLimitError
  {
    const c = new DashSocialClient({ token: 't', maxRetries: 1, fetchImpl: fakeFetch([{ status: 429, headers: { 'Retry-After': '0' } }]) })
    await assert.rejects(() => c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' }), DashRateLimitError)
  }
  // 5. 500 then 200 -> retried and resolves
  {
    const c = new DashSocialClient({ token: 't', maxRetries: 2, fetchImpl: fakeFetch([{ status: 500 }, { status: 200, body: { data: {} } }]) })
    const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' })
    assert.deepEqual(out, { data: {} })
  }
  // 6. AbortError -> DashTimeoutError
  {
    const abortFetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e }
    const c = new DashSocialClient({ token: 't', fetchImpl: abortFetch as unknown as typeof fetch })
    await assert.rejects(() => c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['X'], startDate: 'a', endDate: 'b' }), DashTimeoutError)
  }
  console.log('dash-social client: all assertions passed')
})()

