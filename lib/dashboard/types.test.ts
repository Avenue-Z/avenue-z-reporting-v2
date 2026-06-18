// lib/dashboard/types.test.ts
// Run: npx tsx lib/dashboard/types.test.ts
import { strict as assert } from 'node:assert'
import type { BlockConfig, ResolveResult, DashboardConfig } from './types'

const block: BlockConfig = {
  id: 'b1',
  name: 'Blended ROAS',
  binding: {
    source: 'aggregate',
    op: '/',
    left: { source: 'triplewhale', metric: 'revenue' },
    right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '4136001852' },
  },
  format: 'number',
  range: null,
}
const ok: ResolveResult = { ok: true, value: 2, format: 'number', formatted: '2' }
assert.equal(block.binding.source, 'aggregate')
assert.equal(ok.ok, true)

const dash: DashboardConfig = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [
    { id: 'b1', name: 'Cost', format: 'currency', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
      layout: { w: 2 } },
  ],
}
assert.equal(dash.blocks.length, 1)
assert.equal(dash.blocks[0].layout?.w, 2)
console.log('ok')
