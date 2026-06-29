// lib/dashboard/nl/aggregate-parse.test.ts
// Run: npx tsx lib/dashboard/nl/aggregate-parse.test.ts
import { strict as assert } from 'node:assert'
import { parseAggregateProposal } from './aggregate-parse'

const tw = { source: 'triplewhale', metric: 'revenue' }
const sm = { source: 'supermetrics', dsId: 'AW', metricField: 'cost', account: 'act_1' }
const aggConfig = {
  name: 'Blended ROAS',
  binding: { source: 'aggregate', op: '/', left: tw, right: sm },
  format: 'number',
  range: null,
}

// valid cross-source aggregate
{
  const r = parseAggregateProposal({ config: aggConfig, confidence: 0.9, alternatives: {} })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.config.binding.source, 'aggregate')
    assert.equal(r.proposal.config.id, '__pending__')
  }
}

// explicit clarify wins
assert.equal(parseAggregateProposal({ clarify: 'Revenue ÷ what — spend or impressions?' }).kind, 'clarify')

// below threshold → clarify
assert.equal(parseAggregateProposal({ config: aggConfig, confidence: 0.3 }).kind, 'clarify')

// non-aggregate (single leaf) → error
assert.equal(parseAggregateProposal({ config: { name: 'x', binding: sm, format: 'currency', range: null }, confidence: 0.9 }).kind, 'error')

// invalid operand → error
{
  const bad = { ...aggConfig, binding: { source: 'aggregate', op: '/', left: { source: 'supermetrics', dsId: 'AW' }, right: sm } }
  assert.equal(parseAggregateProposal({ config: bad, confidence: 0.9 }).kind, 'error')
}

// bad op → error
{
  const bad = { ...aggConfig, binding: { source: 'aggregate', op: '%', left: tw, right: sm } }
  assert.equal(parseAggregateProposal({ config: bad, confidence: 0.9 }).kind, 'error')
}

// nested per-operand alternatives parsed
{
  const alts = {
    left: { metric: [{ value: 'rev_net', label: 'Net Revenue' }] },
    right: { account: [{ value: 'act_2', label: 'Brand Account' }] },
  }
  const r = parseAggregateProposal({ config: aggConfig, confidence: 0.9, alternatives: alts })
  assert.equal(r.kind, 'proposal')
  if (r.kind === 'proposal') {
    assert.equal(r.proposal.alternatives.left?.metric?.[0].value, 'rev_net')
    assert.equal(r.proposal.alternatives.right?.account?.[0].value, 'act_2')
  }
}

// non-object → error
assert.equal(parseAggregateProposal(42).kind, 'error')
console.log('ok')
