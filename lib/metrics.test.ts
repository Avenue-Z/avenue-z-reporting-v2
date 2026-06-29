// lib/metrics.test.ts
// Run: npx tsx lib/metrics.test.ts
import { strict as assert } from 'node:assert'
import { computeDelta } from './metrics'

assert.equal(computeDelta(150, 100), 50)        // +50%
assert.equal(computeDelta(50, 100), -50)        // -50%
assert.equal(computeDelta(100, 0), undefined)   // zero prev → undefined (no divide-by-zero)
assert.equal(computeDelta(100, undefined), undefined)
assert.equal(computeDelta(100, null), undefined)
console.log('ok')
