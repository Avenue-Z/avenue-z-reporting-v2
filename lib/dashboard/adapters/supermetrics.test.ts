// lib/dashboard/adapters/supermetrics.test.ts
// Run: npx tsx lib/dashboard/adapters/supermetrics.test.ts
import { strict as assert } from 'node:assert'
import { sumMetric, accountDrift } from './supermetrics'

// sumMetric: sums a field across rows, treating blanks/missing as 0.
const rows: Record<string, string>[] = [{ Cost: '8824.99' }, { Cost: '3283.43' }, { Cost: '' }, {}]
assert.equal(Math.round(sumMetric(rows, 'Cost')), 12108)
assert.equal(sumMetric([], 'Cost'), 0)

// accountDrift: returns accounts present in `returned` but absent from `expected`.
assert.deepEqual(accountDrift(['123', '999'], ['123']), ['999'])
assert.deepEqual(accountDrift(['123'], ['123', '456']), []) // subset → no drift
assert.deepEqual(accountDrift(['123'], undefined), [])       // no expectation → never drift
console.log('ok')
