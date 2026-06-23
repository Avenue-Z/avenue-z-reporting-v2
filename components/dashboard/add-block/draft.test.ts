// components/dashboard/add-block/draft.test.ts
// Run: npx tsx components/dashboard/add-block/draft.test.ts
import { strict as assert } from 'node:assert'
import { applySelections, type BlockSelections } from './draft'
import type { BlockConfig } from '@/lib/dashboard/types'

const sm: BlockConfig = {
  id: '__pending__', name: 'X', format: 'currency', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: 'a1' },
}
// supermetrics: name/format/id set; metric+account swapped to chosen alternatives
{
  const sel: BlockSelections = { name: 'Spend', format: 'currency', metric: 'CostMicros', account: 'a2' }
  const b = applySelections(sm, sel, 'real-1')
  assert.equal(b.id, 'real-1'); assert.equal(b.name, 'Spend')
  assert.equal(b.binding.source, 'supermetrics')
  if (b.binding.source === 'supermetrics') { assert.equal(b.binding.metricField, 'CostMicros'); assert.equal(b.binding.account, 'a2') }
  assert.equal(b.range, null)
}
// supermetrics: no chosen alternatives → original binding fields preserved
{
  const b = applySelections(sm, { name: 'X', format: 'currency' }, 'real-2')
  if (b.binding.source === 'supermetrics') { assert.equal(b.binding.metricField, 'Cost'); assert.equal(b.binding.account, 'a1') }
}
// triplewhale: metric swapped; account selection ignored
{
  const tw: BlockConfig = { id: '__pending__', name: 'R', format: 'number', range: null, binding: { source: 'triplewhale', metric: 'revenue' } }
  const b = applySelections(tw, { name: 'Rev', format: 'currency', metric: 'blended_roas', account: 'ignored' }, 'real-3')
  if (b.binding.source === 'triplewhale') assert.equal(b.binding.metric, 'blended_roas')
  assert.equal(b.format, 'currency'); assert.equal(b.name, 'Rev')
}
// aggregate: binding untouched; only name/format/id applied
{
  const agg: BlockConfig = { id: '__pending__', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: 'a1' } } }
  const b = applySelections(agg, { name: 'Blended ROAS', format: 'number', metric: 'x' }, 'real-4')
  assert.equal(b.binding.source, 'aggregate'); assert.equal(b.name, 'Blended ROAS'); assert.equal(b.id, 'real-4')
}
console.log('ok')
