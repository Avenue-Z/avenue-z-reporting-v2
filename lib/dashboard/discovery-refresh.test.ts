// Run: npx tsx lib/dashboard/discovery-refresh.test.ts
import { strict as assert } from 'node:assert'
import { isValidCronAuth, SM_DIM_CACHE_TTL_MS } from './discovery-refresh'

// valid only when secret is set AND header matches exactly
assert.equal(isValidCronAuth('Bearer s3cret', 's3cret'), true)
assert.equal(isValidCronAuth('Bearer wrong', 's3cret'), false)
assert.equal(isValidCronAuth('s3cret', 's3cret'), false)            // missing "Bearer "
assert.equal(isValidCronAuth(null, 's3cret'), false)
assert.equal(isValidCronAuth('Bearer s3cret', undefined), false)    // no secret configured
assert.equal(isValidCronAuth('Bearer ', ''), false)                 // empty secret never valid
assert.equal(SM_DIM_CACHE_TTL_MS, 24 * 60 * 60 * 1000)
console.log('ok')
