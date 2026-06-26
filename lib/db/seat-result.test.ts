/** Run with: npx tsx lib/db/seat-result.test.ts */
import { strict as assert } from 'node:assert'
import { interpretAddResult } from './seat-result'

// One row inserted -> success.
assert.deepEqual(interpretAddResult({ insertedRows: 1, duplicate: false }), { ok: true })
// Zero rows + the email already exists -> duplicate.
assert.deepEqual(interpretAddResult({ insertedRows: 0, duplicate: true }), { ok: false, reason: 'duplicate' })
// Zero rows, not a duplicate -> seat limit hit.
assert.deepEqual(interpretAddResult({ insertedRows: 0, duplicate: false }), { ok: false, reason: 'seat_limit' })
console.log('seat-result.test.ts PASS')
