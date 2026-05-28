/**
 * Verifies the CACHE_DISABLE=1 bypass path of lib/cache.ts.
 * Run with: CACHE_DISABLE=1 PERF_LOG=1 npx tsx scripts/cache-test-disabled.ts
 */
import { strict as assert } from 'node:assert'
import { cached } from '../lib/cache'

async function main() {
  assert.equal(process.env.CACHE_DISABLE, '1', 'this script must run with CACHE_DISABLE=1')
  assert.equal(process.env.PERF_LOG, '1', 'this script must run with PERF_LOG=1')

  const logs: string[] = []
  const origLog = console.log
  console.log = (msg: string) => { logs.push(msg) }

  try {
    let calls = 0
    const impl = async (x: number) => { calls++; return x * 2 }
    const wrapped = cached('test', 'doubler', impl, {
      extractTags: ([x]) => ({ client: `c${x}` }),
    })

    // Two calls with same args. With CACHE_DISABLED, impl runs each time.
    assert.equal(await wrapped(3), 6)
    assert.equal(await wrapped(3), 6)
    assert.equal(calls, 2, 'CACHE_DISABLE: impl must run every call (no cache)')

    // PERF emission should still happen (delegated to timed())
    assert.ok(logs.length >= 2, `expected at least 2 PERF lines, got ${logs.length}`)
    assert.ok(logs[0].startsWith('PERF '))
    const payload = JSON.parse(logs[0].slice(5))
    assert.equal(payload.vendor, 'test')
    assert.equal(payload.fn, 'doubler')
    assert.equal(payload.ok, true)
    assert.equal(payload.client, 'c3')

    // Error path: rethrows, emits ok:false
    logs.length = 0
    const boom = async () => { throw new Error('kaboom') }
    const wrappedBoom = cached('test', 'boom', boom)
    await assert.rejects(() => wrappedBoom(), /kaboom/)
    assert.equal(logs.length, 1)
    const errPayload = JSON.parse(logs[0].slice(5))
    assert.equal(errPayload.ok, false)
    assert.equal(errPayload.err, 'kaboom')
  } finally {
    console.log = origLog
  }

  console.log('cache-test-disabled: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
