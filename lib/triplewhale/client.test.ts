// lib/triplewhale/client.test.ts
// Run: npx tsx lib/triplewhale/client.test.ts
import { strict as assert } from 'node:assert'
import { twSql, twValue, TwQueryError, TwRateLimitError } from './client'

const ok = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { status: 200, ...init })

async function run() {
  // request shape: x-api-key header + period + shopId in body
  {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchImpl = (async (url: string, init: RequestInit) => { captured = { url, init }; return ok([{ value: 5 }]) }) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 'shop.myshopify.com', query: 'SELECT 1 AS value', startDate: '2026-06-01', endDate: '2026-06-07' }, { fetchImpl })
    assert.equal((rows[0] as { value: number }).value, 5)
    assert.ok(captured!.url.endsWith('/orcabase/api/sql'))
    assert.equal((captured!.init.headers as Record<string, string>)['x-api-key'], 'k')
    const body = JSON.parse(captured!.init.body as string)
    assert.equal(body.shopId, 'shop.myshopify.com')
    assert.deepEqual(body.period, { startDate: '2026-06-01', endDate: '2026-06-07' })
  }
  // envelope {data}
  {
    const fetchImpl = (async () => ok({ success: true, data: [{ value: 9 }] })) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl })
    assert.equal((rows[0] as { value: number }).value, 9)
  }
  // success:false → TwQueryError
  {
    const fetchImpl = (async () => ok({ success: false, message: 'bad sql' })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }), (e: unknown) => e instanceof TwQueryError)
  }
  // 429 then 200 → retries, returns
  {
    let n = 0
    const fetchImpl = (async () => { n++; return n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '0' } }) : ok([{ value: 1 }]) }) as unknown as typeof fetch
    const rows = await twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl, retryDelayMs: 0 })
    assert.equal((rows[0] as { value: number }).value, 1)
    assert.equal(n, 2)
  }
  // 429 exhausted → TwRateLimitError
  {
    const fetchImpl = (async () => new Response('', { status: 429, headers: { 'Retry-After': '0' } })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl, retryDelayMs: 0, maxRetries: 1 }), (e: unknown) => e instanceof TwRateLimitError)
  }
  // 4xx → TwQueryError (no retry)
  {
    const fetchImpl = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch
    await assert.rejects(twSql({ apiKey: 'k', shopId: 's', query: 'q', startDate: 'a', endDate: 'b' }, { fetchImpl }), (e: unknown) => e instanceof TwQueryError)
  }
  // twValue
  assert.equal(twValue([{ value: '12.5' }]), 12.5)
  assert.equal(twValue([]), null)
  assert.equal(twValue([{ value: null }]), null)
  assert.equal(twValue([{ value: 'x' }]), null)
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
