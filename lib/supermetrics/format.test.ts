// Run: npx tsx lib/supermetrics/format.test.ts
import { strict as assert } from 'node:assert'
import { usd, num, pct, pctCompact } from './format'

assert.equal(usd(1234.7), '$1,235')
assert.equal(num(12345), '12,345')
assert.equal(pct(12.34), '12.3%')
assert.equal(pctCompact(3.47), '3%')   // >=1% -> whole
assert.equal(pctCompact(12.6), '13%')  // half-up
assert.equal(pctCompact(1), '1%')      // boundary is whole
assert.equal(pctCompact(0.4), '0.4%')  // <1% -> one decimal, not "0%"
assert.equal(pctCompact(0), '0.0%')
console.log('ok')
