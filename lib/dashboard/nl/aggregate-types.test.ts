// lib/dashboard/nl/aggregate-types.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-types.test.ts
import { strict as assert } from 'node:assert'
import type { AggregateResolutionResult, AggregateResolveInput } from './aggregate-types'

const input: AggregateResolveInput = { formula: 'TW revenue / SM spend', actAsEmail: 'a@b.com' }
assert.equal(input.formula.length > 0, true)
const r: AggregateResolutionResult = { kind: 'clarify', question: 'restate?' }
assert.equal(r.kind, 'clarify')
console.log('ok')
