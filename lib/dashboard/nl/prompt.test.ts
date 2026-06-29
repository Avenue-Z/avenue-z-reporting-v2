// lib/dashboard/nl/prompt.test.ts
// Run: npx tsx lib/dashboard/nl/prompt.test.ts
import { strict as assert } from 'node:assert'
import { buildResolutionPrompt } from './prompt'

const sm = buildResolutionPrompt('supermetrics', 'facebook ad spend last 30 days')
// embeds the user request and instructs strict JSON
assert.ok(sm.includes('facebook ad spend last 30 days'))
assert.ok(/json/i.test(sm))
assert.ok(sm.includes('confidence'))
assert.ok(sm.includes('clarify'))
assert.ok(sm.includes('metricField')) // supermetrics schema field
// source-specific: triplewhale prompt names the metric field, not metricField
const tw = buildResolutionPrompt('triplewhale', 'blended roas')
assert.ok(tw.includes('blended roas'))
assert.ok(tw.includes('"metric"'))
assert.ok(!tw.includes('metricField'))
console.log('ok')
