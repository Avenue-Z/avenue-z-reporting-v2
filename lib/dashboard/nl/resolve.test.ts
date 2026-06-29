// lib/dashboard/nl/resolve.test.ts
// Run: npx tsx lib/dashboard/nl/resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveBlockNL } from './resolve'
import type { GleanChatFn, GleanMessage } from './types'

const aiJson = (obj: unknown): GleanMessage[] => [
  { author: 'GLEAN_AI', fragments: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] },
]
const good = {
  config: { name: 'FB Spend', binding: { source: 'supermetrics', dsId: 'FA', metricField: 'cost', account: 'act_1' }, format: 'currency', range: null },
  confidence: 0.9,
  alternatives: {},
}
const input = { source: 'supermetrics' as const, prompt: 'fb spend', actAsEmail: 'a@b.com' }

async function run() {
  // proposal path
  {
    const chat: GleanChatFn = async () => aiJson(good)
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'proposal')
  }
  // clarify path
  {
    const chat: GleanChatFn = async () => aiJson({ clarify: 'Which metric?' })
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'clarify')
  }
  // repair retry: garbage first, valid second → proposal, and chat called twice
  {
    let calls = 0
    const chat: GleanChatFn = async () => { calls++; return calls === 1 ? [{ author: 'GLEAN_AI', fragments: [{ text: 'no json' }] }] : aiJson(good) }
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'proposal')
    assert.equal(calls, 2)
  }
  // repair retry exhausted → error
  {
    const chat: GleanChatFn = async () => [{ author: 'GLEAN_AI', fragments: [{ text: 'never json' }] }]
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'error')
  }
  // network error → error (never throws)
  {
    const chat: GleanChatFn = async () => { throw new Error('boom') }
    const r = await resolveBlockNL(input, { chat })
    assert.equal(r.kind, 'error')
    if (r.kind === 'error') assert.ok(r.error.includes('boom'))
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
