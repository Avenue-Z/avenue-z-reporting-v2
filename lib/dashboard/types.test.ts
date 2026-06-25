// lib/dashboard/types.test.ts
// Run: npx tsx lib/dashboard/types.test.ts
// AggregateBinding round-trip and DashboardConfig.blocks[0].layout coverage lives in
// lib/dashboard/resolve.test.ts (aggregate path) and lib/dashboard/persistence.test.ts (layout round-trip).
import { strict as assert } from 'node:assert'
import type { BlockKind, BlockConfig } from './types'
import { DEFAULT_LAYOUT } from '../../components/dashboard/block-grid-defaults'

// Type-level: 'pills' is assignable to BlockKind
const k: BlockKind = 'pills'
assert.equal(k, 'pills')

// Type-level: BlockConfig accepts new annotations
const h: BlockConfig = {
  id: 'h', name: 'Q3 Performance', kind: 'header', format: 'number', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
  headerLevel: 2,
}
assert.equal(h.headerLevel, 2)

const n: BlockConfig = {
  id: 'n', name: 'Notes', kind: 'narrative', format: 'number', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
  narrativeBody: '## Highlights\n- Cost down 12%',
}
assert.equal(n.narrativeBody?.startsWith('## '), true)

// Runtime: pills layout default exists
assert.equal(DEFAULT_LAYOUT.pills.w, 4)
assert.equal(DEFAULT_LAYOUT.pills.h, 1)
assert.equal(DEFAULT_LAYOUT.pills.minW, 2)
assert.equal(DEFAULT_LAYOUT.pills.minH, 1)

console.log('ok')
