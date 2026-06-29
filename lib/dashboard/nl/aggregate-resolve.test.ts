// lib/dashboard/nl/aggregate-resolve.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveAggregateNL } from './aggregate-resolve'
import type { GleanChatFn, GleanMessage } from './types'

const aiJson = (obj: unknown): GleanMessage[] => [
  { author: 'GLEAN_AI', fragments: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] },
]
const tw = { source: 'triplewhale', metric: 'revenue' }
const sm = { source: 'supermetrics', dsId: 'AW', metricField: 'cost', account: 'act_1' }
const good = {
  config: { name: 'Blended ROAS', binding: { source: 'aggregate', op: '/', left: tw, right: sm }, format: 'number', range: null },
  confidence: 0.9,
  alternatives: {},
}
const input = { formula: 'TW revenue / SM spend', actAsEmail: 'a@b.com' }

async function run() {
  // proposal
  {
    const chat: GleanChatFn = async () => aiJson(good)
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'proposal')
    if (r.kind === 'proposal') assert.equal(r.proposal.config.binding.source, 'aggregate')
  }
  // clarify
  {
    const chat: GleanChatFn = async () => aiJson({ clarify: 'Revenue ÷ what?' })
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'clarify')
  }
  // network throw → error
  {
    const chat: GleanChatFn = async () => { throw new Error('boom') }
    const r = await resolveAggregateNL(input, { chat })
    assert.equal(r.kind, 'error')
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
