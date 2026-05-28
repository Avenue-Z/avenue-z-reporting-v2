import { strict as assert } from 'node:assert'
import { timed } from '../lib/perf'

async function main() {
  assert.equal(process.env.PERF_LOG, '1', 'this script must run with PERF_LOG=1')

  const logs: string[] = []
  const origLog = console.log
  console.log = (msg: string) => { logs.push(msg) }

  try {
    // success path
    const slow = async (x: number) => {
      await new Promise((r) => setTimeout(r, 20))
      return x * 2
    }
    const wrappedOn = timed('test', 'slow', slow, ([x]) => ({ client: `c${x}` }))
    const result = await wrappedOn(5)
    assert.equal(result, 10)
    assert.equal(logs.length, 1)
    assert.ok(logs[0].startsWith('PERF '), 'log line should start with PERF')
    const payload = JSON.parse(logs[0].slice(5))
    assert.equal(payload.vendor, 'test')
    assert.equal(payload.fn, 'slow')
    assert.equal(payload.ok, true)
    assert.equal(payload.client, 'c5')
    assert.ok(typeof payload.ms === 'number' && payload.ms >= 15, `ms should be >=15, got ${payload.ms}`)
    assert.ok(typeof payload.ts === 'string')

    // failure path, re-throws original error
    logs.length = 0
    const boom = async () => { throw new Error('kaboom') }
    const wrappedBoom = timed('test', 'boom', boom)
    await assert.rejects(() => wrappedBoom(), /kaboom/)
    assert.equal(logs.length, 1)
    const errPayload = JSON.parse(logs[0].slice(5))
    assert.equal(errPayload.ok, false)
    assert.equal(errPayload.err, 'kaboom')

    // extractor that throws does not break the call
    logs.length = 0
    const wrappedBadTags = timed('test', 'ok', async () => 'fine', () => { throw new Error('tag fail') })
    assert.equal(await wrappedBadTags(), 'fine')
    assert.equal(logs.length, 1)
    const okPayload = JSON.parse(logs[0].slice(5))
    assert.equal(okPayload.ok, true)
  } finally {
    console.log = origLog
  }

  console.log('perf-test-on: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
