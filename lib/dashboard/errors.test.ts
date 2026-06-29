// lib/dashboard/errors.test.ts
// Run: npx tsx lib/dashboard/errors.test.ts
import { strict as assert } from 'node:assert'
import { SmQueryError, SmTimeoutError } from '@/lib/supermetrics/types'
import { TwQueryError, TwRateLimitError } from '@/lib/triplewhale/client'
import { ShopifyQlError } from '@/lib/shopify/client'
import { mapError, worseError, DisconnectedError, NoDataError, DriftError } from './errors'

// mapError: each known cause → its BlockError
assert.equal(mapError(new DisconnectedError()), 'disconnected')
assert.equal(mapError(new DriftError()), 'invalid-metric')
assert.equal(mapError(new NoDataError()), 'no-data')
assert.equal(mapError(new SmTimeoutError('slow')), 'rate-limited')
// Data-source query errors → 'unavailable' (valid metric, not provided for this account),
// distinct from 'invalid-metric' (our binding is malformed).
assert.equal(mapError(new SmQueryError('GA4 Ads metric without link')), 'unavailable')
assert.equal(mapError(new Error('unknown')), 'error')

// worseError: precedence disconnected > invalid-metric > unavailable > rate-limited > no-data > error
assert.equal(worseError('no-data', 'disconnected'), 'disconnected')
assert.equal(worseError('error', 'no-data'), 'no-data')
assert.equal(worseError('rate-limited', 'invalid-metric'), 'invalid-metric')
assert.equal(worseError('unavailable', 'invalid-metric'), 'invalid-metric')
assert.equal(worseError('rate-limited', 'unavailable'), 'unavailable')
assert.equal(worseError('disconnected', 'disconnected'), 'disconnected')
// order-independent
assert.equal(worseError('invalid-metric', 'rate-limited'), worseError('rate-limited', 'invalid-metric'))

// TripleWhale error mapping
assert.equal(mapError(new TwRateLimitError(5)), 'rate-limited')
assert.equal(mapError(new TwQueryError('bad')), 'unavailable')

// Shopify error mapping
assert.equal(mapError(new ShopifyQlError('bad ShopifyQL')), 'unavailable')

console.log('ok')
