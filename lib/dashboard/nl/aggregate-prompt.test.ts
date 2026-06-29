// lib/dashboard/nl/aggregate-prompt.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-prompt.test.ts
import { strict as assert } from 'node:assert'
import { buildAggregatePrompt } from './aggregate-prompt'

const p = buildAggregatePrompt('blended ROAS = TripleWhale revenue / Supermetrics ad spend')
assert.ok(p.includes('blended ROAS = TripleWhale revenue / Supermetrics ad spend')) // embeds the formula
assert.ok(/json/i.test(p))            // strict JSON instruction
assert.ok(p.includes('aggregate'))    // aggregate binding
assert.ok(p.includes('"op"'))         // operator field
assert.ok(p.includes('"left"') && p.includes('"right"')) // two operands
assert.ok(p.includes('supermetrics') && p.includes('triplewhale')) // both leaf source shapes
assert.ok(p.includes('confidence') && p.includes('clarify'))
console.log('ok')
