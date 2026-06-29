// lib/dashboard/nl/types.test.ts
// Run: npx tsx lib/dashboard/nl/types.test.ts
import { strict as assert } from 'node:assert'
import { MIN_CONFIDENCE, type ResolutionResult, type ResolveInput } from './types'

assert.equal(typeof MIN_CONFIDENCE, 'number')
assert.ok(MIN_CONFIDENCE > 0 && MIN_CONFIDENCE < 1)
const input: ResolveInput = { source: 'supermetrics', prompt: 'facebook spend last 30 days', actAsEmail: 'a@b.com' }
assert.equal(input.source, 'supermetrics')
const r: ResolutionResult = { kind: 'clarify', question: 'which metric?' }
assert.equal(r.kind, 'clarify')
console.log('ok')
