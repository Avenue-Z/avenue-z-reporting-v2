import { strict as assert } from 'node:assert'
import { runWithCollector, recordFetch, getCollected } from './collector'

// records inside a synchronous collector scope
runWithCollector(() => {
  recordFetch({ vendor: 'ga4', fn: 'getX', ok: true })
  recordFetch({ vendor: 'hubspot', fn: 'getY', ok: false, error: 'boom' })
  const got = getCollected()
  assert.equal(got.length, 2)
  assert.equal(got[1].ok, false)
  assert.equal(got[1].error, 'boom')
})

// context survives awaits inside the scope
await runWithCollector(async () => {
  await Promise.resolve()
  recordFetch({ vendor: 'a', fn: 'b', ok: true })
  assert.equal(getCollected().length, 1)
})

// no-op outside any scope: never throws, returns empty
recordFetch({ vendor: 'x', fn: 'y', ok: true })
assert.deepEqual(getCollected(), [])

console.log('collector.test.ts: all assertions passed')
