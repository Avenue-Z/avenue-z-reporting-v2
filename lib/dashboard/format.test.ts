// lib/dashboard/format.test.ts
// Run: npx tsx lib/dashboard/format.test.ts
import { strict as assert } from 'node:assert'
import { formatMetric } from './format'

assert.equal(formatMetric(1234.6, 'currency'), '$1,235')  // rounded, thousands sep
assert.equal(formatMetric(12.34, 'percent'), '12.3%')     // one decimal
assert.equal(formatMetric(1234, 'count'), '1,234')             // count stays integer
assert.equal(formatMetric(1234.6, 'number'), '1,234.6')         // number: up to 2 decimals
assert.equal(formatMetric(2.3227353, 'number'), '2.32')         // capped at 2 decimals
assert.equal(formatMetric(1234567, 'number'), '1,234,567')      // integer number: no trailing decimals
console.log('ok')
