import { strict as assert } from 'node:assert'
import { resolveValueLabel, resolveDimLabel } from './labels'

const o = { values: { channel: { 'facebook-ads': 'Facebook Ads' } }, dims: { channel: 'Channel' } }
assert.equal(resolveValueLabel(o, 'channel', 'facebook-ads'), 'Facebook Ads')
assert.equal(resolveValueLabel(o, 'channel', 'google-ads'), 'google-ads')   // no override → raw
assert.equal(resolveValueLabel(undefined, 'channel', 'x'), 'x')             // no map → raw
assert.equal(resolveDimLabel(o, 'channel'), 'Channel')
assert.equal(resolveDimLabel(o, 'source'), 'source')                       // no override → raw
assert.equal(resolveDimLabel(undefined, 'channel'), 'channel')
console.log('ok')
