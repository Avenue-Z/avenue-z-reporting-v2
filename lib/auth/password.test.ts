/** Run with: npx tsx lib/auth/password.test.ts */
import { strict as assert } from 'node:assert'
import { hashPassword, verifyPassword } from './password'

;(async () => {
  const hash = await hashPassword('hunter2')
  assert.ok(hash.startsWith('$2'), 'bcrypt hash should start with $2')
  assert.notEqual(hash, 'hunter2', 'must not store plaintext')
  assert.equal(await verifyPassword('hunter2', hash), true, 'correct password verifies')
  assert.equal(await verifyPassword('wrong', hash), false, 'wrong password rejected')
  assert.equal(await verifyPassword('hunter2', ''), false, 'empty hash rejected')
  console.log('password.test.ts PASS')
})()
