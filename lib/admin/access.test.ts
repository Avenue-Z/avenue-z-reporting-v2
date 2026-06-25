/** Run with: npx tsx lib/admin/access.test.ts */
import { strict as assert } from 'node:assert'
import { normalizeEmail, isValidEmail, isClientRole, seatsRemaining } from './access'

assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com')
assert.equal(isValidEmail('foo@bar.com'), true)
assert.equal(isValidEmail('nope'), false)
assert.equal(isValidEmail(''), false)
assert.equal(isClientRole('CLIENT_VIEWER'), true)
assert.equal(isClientRole('CLIENT_ADMIN'), true)
assert.equal(isClientRole('INTERNAL_ADMIN'), false)
assert.equal(seatsRemaining(5, 5), 0)
assert.equal(seatsRemaining(3, 5), 2)
assert.equal(seatsRemaining(6, 5), 0, 'never negative')
console.log('access.test.ts PASS')
