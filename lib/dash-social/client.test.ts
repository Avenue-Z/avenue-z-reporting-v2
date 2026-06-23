// lib/dash-social/client.test.ts
// Run: npx tsx lib/dash-social/client.test.ts
import { strict as assert } from 'node:assert'
import { DashSocialClient, DashAuthError, DashRateLimitError } from './client'

// Fake fetch: returns scripted responses by call index.
function fakeFetch(responses: Array<{ status: number; headers?: Record<string,string>; body?: unknown }>) {
  let i = 0
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return new Response(r.body == null ? '' : JSON.stringify(r.body), {
      status: r.status, headers: r.headers,
    }) as unknown as Response
  }
}

(async () => {
  // 1. happy path passes Bearer + parses JSON
  {
    const c = new DashSocialClient({ token: 't', fetchImpl: fakeFetch([{ status: 200, body: { data: {} } }]) })
    const out = await c.getReportsData({ brandId: 1, channels: ['INSTAGRAM'], metrics: ['IMPRESSIONS'], startDate: '2026-05-01', endDate: '2026-05-31' })
    assert.deepEqual(out, { data: {} })
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
  console.log('dash-social client: all assertions passed')
})()

