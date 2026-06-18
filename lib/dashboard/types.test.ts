// lib/dashboard/types.test.ts
// Run: npx tsx lib/dashboard/types.test.ts
import { strict as assert } from 'node:assert'
import type { BlockConfig, ResolveResult } from './types'

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
console.log('ok')
