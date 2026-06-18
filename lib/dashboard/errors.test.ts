// lib/dashboard/errors.test.ts
// Run: npx tsx lib/dashboard/errors.test.ts
import { strict as assert } from 'node:assert'
import { SmQueryError, SmTimeoutError } from '@/lib/supermetrics/types'
import { mapError, worseError, DisconnectedError, NoDataError, DriftError } from './errors'

// mapError: each known cause → its BlockError
assert.equal(mapError(new DisconnectedError()), 'disconnected')
assert.equal(mapError(new DriftError()), 'invalid-metric')
assert.equal(mapError(new NoDataError()), 'no-data')
assert.equal(mapError(new SmTimeoutError('slow')), 'rate-limited')
assert.equal(mapError(new SmQueryError('bad field')), 'invalid-metric')
assert.equal(mapError(new Error('unknown')), 'error')

// worseError: precedence disconnected > invalid-metric > rate-limited > no-data > error
assert.equal(worseError('no-data', 'disconnected'), 'disconnected')
assert.equal(worseError('error', 'no-data'), 'no-data')
assert.equal(worseError('rate-limited', 'invalid-metric'), 'invalid-metric')
assert.equal(worseError('disconnected', 'disconnected'), 'disconnected')
// order-independent
assert.equal(worseError('invalid-metric', 'rate-limited'), worseError('rate-limited', 'invalid-metric'))
console.log('ok')
