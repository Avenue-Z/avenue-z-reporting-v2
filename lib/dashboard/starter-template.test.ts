// lib/dashboard/starter-template.test.ts
// Run: npx tsx lib/dashboard/starter-template.test.ts
import { strict as assert } from 'node:assert'
import { buildStarterTemplate } from './starter-template'
import { parseDashboardConfig } from './persistence'

const cfg = buildStarterTemplate()

const parsed = parseDashboardConfig(cfg)
assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)

const dataBlocks = cfg.blocks.filter((b) => b.kind !== 'header')
assert.ok(dataBlocks.length >= 10, 'expect the full KPI + bar + table set')
for (const b of dataBlocks) {
  assert.equal(b.binding.source, 'triplewhale', `${b.name} must be triplewhale`)
}

const headers = cfg.blocks.filter((b) => b.kind === 'header')
assert.equal(headers.length, 3)
for (const h of headers) {
  assert.equal(h.binding.source, 'supermetrics')
  if (h.binding.source === 'supermetrics') assert.equal(h.binding.dsId, '__static__')
}

const bar = cfg.blocks.find((b) => b.kind === 'bar')!
const table = cfg.blocks.find((b) => b.kind === 'table')!
assert.deepEqual((bar.binding as { dimensions?: string[] }).dimensions, ['channel'])
assert.deepEqual((table.binding as { dimensions?: string[] }).dimensions, ['channel'])

console.log('ok')
