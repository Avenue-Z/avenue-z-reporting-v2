// Run: npx tsx lib/dashboard/share.test.ts
import { strict as assert } from 'node:assert'
import { groupSections, filterSharedBlocks, reflowBlocks } from './share'
import type { PersistedBlock } from './types'

const b = (id: string, kind: PersistedBlock['kind'], layout?: PersistedBlock['layout']): PersistedBlock =>
  ({ id, name: id, kind, format: 'number', range: null, binding: { source: 'triplewhale', metric: 'x' }, ...(layout ? { layout } : {}) }) as PersistedBlock

const blocks = [
  b('h1', 'header'), b('k1', 'kpi'), b('k2', 'kpi'),
  b('h2', 'header'), b('bar1', 'bar'),
  b('h3', 'header'), b('k3', 'kpi'),
]

// groupSections: header-delimited sections in order
{
  const s = groupSections(blocks)
  assert.equal(s.length, 3)
  assert.deepEqual(s[0].header?.id, 'h1')
  assert.deepEqual(s[0].blocks.map((x) => x.id), ['k1', 'k2'])
  assert.deepEqual(s[1].blocks.map((x) => x.id), ['bar1'])
}

// leading blocks before any header → header:null section
{
  const s = groupSections([b('x', 'kpi'), b('h', 'header'), b('y', 'kpi')])
  assert.equal(s[0].header, null)
  assert.deepEqual(s[0].blocks.map((x) => x.id), ['x'])
}

// filterSharedBlocks: keep selected blocks + their header; drop empty sections (h3)
{
  const out = filterSharedBlocks(blocks, new Set(['k1', 'bar1']))
  assert.deepEqual(out.map((x) => x.id), ['h1', 'k1', 'h2', 'bar1']) // h3 section dropped (k3 not selected)
}

// reflowBlocks: gap-free packing; headers full-width on their own row
{
  const out = reflowBlocks([b('h', 'header'), b('k1', 'kpi'), b('k2', 'kpi'), b('bar', 'bar')])
  const L = Object.fromEntries(out.map((x) => [x.id, x.layout!]))
  assert.deepEqual(L.h, { x: 0, y: 0, w: 12, h: 1 })   // header full row at top
  assert.deepEqual(L.k1, { x: 0, y: 1, w: 3, h: 2 })   // kpis pack left-to-right under it
  assert.deepEqual(L.k2, { x: 3, y: 1, w: 3, h: 2 })
  assert.deepEqual(L.bar, { x: 6, y: 1, w: 6, h: 4 })  // bar fits same row (3+3+6=12)
}

// reflow wraps when a row overflows
{
  const out = reflowBlocks([b('bar1', 'bar'), b('bar2', 'bar'), b('bar3', 'bar')]) // each w6 → 2 per row
  const L = Object.fromEntries(out.map((x) => [x.id, x.layout!]))
  assert.equal(L.bar1.y, 0); assert.equal(L.bar2.y, 0)
  assert.equal(L.bar3.x, 0); assert.equal(L.bar3.y, 4) // wrapped to next row
}

console.log('ok')
