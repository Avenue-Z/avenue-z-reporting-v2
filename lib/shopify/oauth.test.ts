// Run: npx tsx lib/shopify/oauth.test.ts
import { strict as assert } from 'node:assert'
import crypto from 'node:crypto'
import { buildInstallUrl, isValidShop, verifyHmac } from './oauth'

// isValidShop — only real myshopify.com domains
assert.equal(isValidShop('bright-patches.myshopify.com'), true)
assert.equal(isValidShop('evil.com'), false)
assert.equal(isValidShop('a.myshopify.com.evil.com'), false)
assert.equal(isValidShop('UPPER.myshopify.com'), false)

// buildInstallUrl — wires client_id, scope, encoded redirect_uri, state
const url = buildInstallUrl({
  shop: 'bright-patches.myshopify.com',
  clientId: 'cid',
  scopes: 'read_reports',
  redirectUri: 'http://localhost:3000/api/shopify/callback',
  state: 'abc',
})
assert.ok(url.startsWith('https://bright-patches.myshopify.com/admin/oauth/authorize?'))
assert.ok(url.includes('client_id=cid'))
assert.ok(url.includes('scope=read_reports'))
assert.ok(url.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fshopify%2Fcallback'))
assert.ok(url.includes('state=abc'))

// verifyHmac — accepts a correct signature, rejects bad / missing
const secret = 'shh'
const base: Record<string, string> = { code: 'c', shop: 'bright-patches.myshopify.com', state: 'abc', timestamp: '123' }
const message = Object.keys(base).sort().map((k) => `${k}=${base[k]}`).join('&')
const good = crypto.createHmac('sha256', secret).update(message).digest('hex')
assert.equal(verifyHmac({ ...base, hmac: good }, secret), true)
assert.equal(verifyHmac({ ...base, hmac: 'deadbeef' }, secret), false)
assert.equal(verifyHmac({ ...base }, secret), false)

console.log('ok')
