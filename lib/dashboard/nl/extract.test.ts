// lib/dashboard/nl/extract.test.ts
// Run: npx tsx lib/dashboard/nl/extract.test.ts
import { strict as assert } from 'node:assert'
import { extractJson } from './extract'
import type { GleanMessage } from './types'

const msg = (author: string, text: string): GleanMessage => ({ author, fragments: [{ text }] })

// realistic multi-message reply: thinking + tool call + final fenced json
const messages: GleanMessage[] = [
  msg('GLEAN_AI', 'Let me check the Supermetrics fields...'),
  msg('GLEAN_AI', 'Found candidates.'),
  msg('GLEAN_AI', 'Here is the result:\n```json\n{"config":{"name":"X"},"confidence":0.9}\n```'),
]
const out = extractJson(messages) as { confidence: number }
assert.equal(out.confidence, 0.9)

// ignores USER messages, picks the LAST json block when several appear
const multi: GleanMessage[] = [
  msg('USER', '```json\n{"ignored":true}\n```'),
  msg('GLEAN_AI', '```json\n{"n":1}\n```'),
  msg('GLEAN_AI', '```json\n{"n":2}\n```'),
]
assert.equal((extractJson(multi) as { n: number }).n, 2)

// fallback: bare object with no fence
assert.equal((extractJson([msg('GLEAN_AI', 'answer: {"k":5} done')]) as { k: number }).k, 5)

// no json → null
assert.equal(extractJson([msg('GLEAN_AI', 'no json here')]), null)
// malformed json → null
assert.equal(extractJson([msg('GLEAN_AI', '```json\n{bad}\n```')]), null)
console.log('ok')
