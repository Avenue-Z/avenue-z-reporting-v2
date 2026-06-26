/** Run with: npx tsx lib/auth/credential-login.test.ts */
import { strict as assert } from 'node:assert'
import { evaluateCredentialLogin } from './credential-login'

const yes = async () => true
const no = async () => false

const viewer = {
  email: 'team@client.com', role: 'CLIENT_VIEWER' as const,
  clientId: 'c1', slug: 'client', sharedPasswordHash: '$2hash',
}

;(async () => {
  // happy path
  assert.deepEqual(
    await evaluateCredentialLogin({ email: 'team@client.com', password: 'pw', record: viewer, verify: yes }),
    { id: 'team@client.com', email: 'team@client.com', name: 'team' },
  )
  // wrong password
  assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: 'x', record: viewer, verify: no }), null)
  // unknown user
  assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: 'pw', record: null, verify: yes }), null)
  // client has no shared password set -> fail closed
  assert.equal(await evaluateCredentialLogin({ email: 'a@b.com', password: 'pw', record: { ...viewer, sharedPasswordHash: null }, verify: yes }), null)
  // internal role must NOT use credentials
  assert.equal(await evaluateCredentialLogin({ email: 'a@b.com', password: 'pw', record: { ...viewer, role: 'INTERNAL_ADMIN' as any }, verify: yes }), null)
  // missing inputs
  assert.equal(await evaluateCredentialLogin({ email: '', password: 'pw', record: viewer, verify: yes }), null)
  assert.equal(await evaluateCredentialLogin({ email: 'team@client.com', password: '', record: viewer, verify: yes }), null)
  console.log('credential-login.test.ts PASS')
})()
