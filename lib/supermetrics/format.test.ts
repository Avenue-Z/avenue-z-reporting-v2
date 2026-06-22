// Run: npx tsx lib/supermetrics/format.test.ts
import { strict as assert } from 'node:assert'
import { usd, num, pct } from './format'

assert.equal(usd(1234.7), '$1,235')
assert.equal(num(12345), '12,345')
assert.equal(pct(12.34), '12.3%')
console.log('ok')
