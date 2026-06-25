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

// The async assertions run in an IIFE (not top-level await) so this stays a
// CJS .test.ts like every other test in the repo, while .catch(process.exit(1))
// keeps it fail-loud: an assertion error rejects the chain and exits non-zero.
void (async () => {
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
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
