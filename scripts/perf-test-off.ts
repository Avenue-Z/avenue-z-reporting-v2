import { strict as assert } from 'node:assert'
import { timed } from '../lib/perf'

async function main() {
  assert.equal(process.env.PERF_LOG, undefined, 'this script must run without PERF_LOG set')
  const plain = async (x: number) => x + 1
  const wrapped = timed('test', 'plain', plain)
  assert.equal(wrapped, plain, 'PERF_LOG off: should return original impl')
  assert.equal(await wrapped(1), 2)
  console.log('perf-test-off: passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
