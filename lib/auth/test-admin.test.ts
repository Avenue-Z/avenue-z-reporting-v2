/** Run with: npx tsx lib/auth/test-admin.test.ts */
import { strict as assert } from 'node:assert'
import { evaluateTestAdminLogin } from './test-admin'

const env = { email: 'qa@avenuez.com', password: 's3cret', vercelEnv: 'preview' }

;(async () => {
  // happy path -> INTERNAL_ADMIN
  assert.deepEqual(
    evaluateTestAdminLogin({ email: 'qa@avenuez.com', password: 's3cret' }, env),
    { id: 'qa@avenuez.com', email: 'qa@avenuez.com', name: 'Test Admin', role: 'INTERNAL_ADMIN', clientSlug: 'avenue-z' },
  )
  // case-insensitive email match
  assert.equal(evaluateTestAdminLogin({ email: 'QA@Avenuez.com', password: 's3cret' }, env)?.role, 'INTERNAL_ADMIN')
  // wrong password
  assert.equal(evaluateTestAdminLogin({ email: 'qa@avenuez.com', password: 'x' }, env), null)
  // wrong email
  assert.equal(evaluateTestAdminLogin({ email: 'someone@avenuez.com', password: 's3cret' }, env), null)
  // disabled when env vars unset
  assert.equal(evaluateTestAdminLogin({ email: 'qa@avenuez.com', password: 's3cret' }, { vercelEnv: 'preview' }), null)
  // hard-gated off in production even if vars are set
  assert.equal(evaluateTestAdminLogin({ email: 'qa@avenuez.com', password: 's3cret' }, { ...env, vercelEnv: 'production' }), null)
  // missing inputs
  assert.equal(evaluateTestAdminLogin({ email: '', password: 's3cret' }, env), null)
  assert.equal(evaluateTestAdminLogin({ email: 'qa@avenuez.com', password: '' }, env), null)
  console.log('test-admin.test.ts PASS')
})()
