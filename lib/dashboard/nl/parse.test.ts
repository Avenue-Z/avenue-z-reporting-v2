// lib/dashboard/nl/parse.test.ts
// Run: npx tsx lib/dashboard/nl/parse.test.ts
import { strict as assert } from 'node:assert'
import { parseProposal } from './parse'

const goodConfig = {
  name: 'FB Spend',
  binding: { source: 'supermetrics', dsId: 'FA', metricField: 'cost', account: 'act_1' },
  format: 'currency',
  range: null,
}

// high-confidence valid proposal
{
  const r = parseProposal({ config: goodConfig, confidence: 0.9, alternatives: {} })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.confidence, 0.9)
    assert.equal(r.proposal.config.binding.source, 'supermetrics')
    assert.equal(r.proposal.config.id, '__pending__') // placeholder id assigned
  }
}

// explicit clarify wins
assert.equal(parseProposal({ clarify: 'Which metric — spend, ROAS, or conversions?' }).kind, 'clarify')

// below threshold → clarify even with a config
assert.equal(parseProposal({ config: goodConfig, confidence: 0.3, alternatives: {} }).kind, 'clarify')

// invalid config → error
assert.equal(parseProposal({ config: { name: 'x', binding: { source: 'supermetrics' }, format: 'currency', range: null }, confidence: 0.9 }).kind, 'error')

// aggregate binding rejected (leaf-only in #4)
{
  const agg = { name: 'roas', binding: { source: 'aggregate', op: '/', left: goodConfig.binding, right: goodConfig.binding }, format: 'number', range: null }
  assert.equal(parseProposal({ config: agg, confidence: 0.9 }).kind, 'error')
}

// alternatives parsed, ranked, capped at 5
{
  const alts = Array.from({ length: 8 }, (_, i) => ({ value: `m${i}`, label: `M${i}`, confidence: 1 - i * 0.1 }))
  const r = parseProposal({ config: goodConfig, confidence: 0.9, alternatives: { metric: alts } })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.alternatives.metric!.length, 5)
    assert.equal(r.proposal.alternatives.metric![0].value, 'm0')
  }
}

// non-object → error
assert.equal(parseProposal('nope').kind, 'error')
console.log('ok')
