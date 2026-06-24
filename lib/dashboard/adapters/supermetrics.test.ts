// lib/dashboard/adapters/supermetrics.test.ts
// Run: npx tsx lib/dashboard/adapters/supermetrics.test.ts
import { strict as assert } from 'node:assert'
import { sumMetric, accountDrift, buildSmFilter } from './supermetrics'

// sumMetric: sums a field across rows, treating blanks/missing as 0.
const rows: Record<string, string>[] = [{ Cost: '8824.99' }, { Cost: '3283.43' }, { Cost: '' }, {}]
assert.equal(Math.round(sumMetric(rows, 'Cost')), 12108)
assert.equal(sumMetric([], 'Cost'), 0)

// accountDrift: returns accounts present in `returned` but absent from `expected`.
assert.deepEqual(accountDrift(['123', '999'], ['123']), ['999'])
assert.deepEqual(accountDrift(['123'], ['123', '456']), []) // subset → no drift
assert.deepEqual(accountDrift(['123'], undefined), [])       // no expectation → never drift

// resolveSmApiKey: per-client var wins; otherwise global SUPERMETRICS_API_KEY
import { resolveSmApiKey } from './supermetrics'

// per-client var present → use it
assert.equal(resolveSmApiKey('SM_X', { SM_X: 'perclient', SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'perclient')
// per-client var name set but value missing → fall back to global
assert.equal(resolveSmApiKey('SM_X', { SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'global')
// no per-client var name → global
assert.equal(resolveSmApiKey(null, { SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'global')
// neither → undefined
assert.equal(resolveSmApiKey(null, {} as unknown as NodeJS.ProcessEnv), undefined)

// buildSmFilter: OR within a row, AND across rows; unsafe/empty dropped
assert.equal(buildSmFilter(undefined), undefined)
assert.equal(buildSmFilter([]), undefined)
assert.equal(buildSmFilter([{ column: 'order_shipping_country', values: ['United States'] }]), 'order_shipping_country == United States')
assert.equal(
  buildSmFilter([{ column: 'channel', values: ['google-ads', 'facebook-ads'] }]),
  '(channel == google-ads OR channel == facebook-ads)',
)
assert.equal(
  buildSmFilter([
    { column: 'channel', values: ['google-ads', 'facebook-ads'] },
    { column: 'order_shipping_country', values: ['United States'] },
  ]),
  '(channel == google-ads OR channel == facebook-ads) AND order_shipping_country == United States',
)
// unsafe column or all-empty values dropped
assert.equal(buildSmFilter([{ column: 'bad col', values: ['x'] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: [''] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: ['', 'x'] }]), 'a == x')

console.log('ok')
