// lib/dashboard/format.test.ts
// Run: npx tsx lib/dashboard/format.test.ts
import { strict as assert } from 'node:assert'
import { formatMetric } from './format'

assert.equal(formatMetric(1234.6, 'currency'), '$1,235')  // rounded, thousands sep
assert.equal(formatMetric(12.34, 'percent'), '12.3%')     // one decimal
assert.equal(formatMetric(1234, 'count'), '1,234')
assert.equal(formatMetric(1234.6, 'number'), '1,235')
console.log('ok')
