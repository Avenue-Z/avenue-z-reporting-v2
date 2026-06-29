// components/dashboard/config-mutations.test.ts
// Run: npx tsx components/dashboard/config-mutations.test.ts
import { strict as assert } from 'node:assert'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
import {
  reorderBlocks,
  removeBlock,
  setBlockRange,
  resetBlockRange,
  addBlock,
  updateBlock,
  setBlockText,
  setLabelOverride,
} from './config-mutations'

const block = (id: string, range: PersistedBlock['range'] = null): PersistedBlock => ({
  id,
  name: `Block ${id}`,
  format: 'number',
  binding: { source: 'triplewhale', metric: 'fake' },
  range,
})

const base: DashboardConfig = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [block('a'), block('b'), block('c')],
}

// reorderBlocks: move 'a' (index 0) to index 2 → [b, c, a]
{
  const next = reorderBlocks(base, 0, 2)
  assert.deepEqual(next.blocks.map((b) => b.id), ['b', 'c', 'a'])
  assert.notEqual(next, base, 'must return a new object (immutable)')
  assert.notEqual(next.blocks, base.blocks, 'must return a new blocks array')
  assert.deepEqual(base.blocks.map((b) => b.id), ['a', 'b', 'c'], 'input must be unchanged')
}

// reorderBlocks: same index is a no-op identity-shape (still a new array, same order)
{
  const next = reorderBlocks(base, 1, 1)
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'b', 'c'])
}

// removeBlock: drops the matching id, leaves others in order
{
  const next = removeBlock(base, 'b')
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'c'])
  assert.deepEqual(base.blocks.map((b) => b.id), ['a', 'b', 'c'], 'input must be unchanged')
}

// removeBlock: unknown id is a no-op (returns identical-shape config)
{
  const next = removeBlock(base, 'zzz')
  assert.deepEqual(next.blocks.map((b) => b.id), ['a', 'b', 'c'])
}

// setBlockRange: writes the range on the matching block, leaves others alone
{
  const next = setBlockRange(base, 'b', { dateRange: 'last_7_days', compareRange: 'previous_year' })
  assert.equal(next.blocks[0].range, null)
  assert.deepEqual(next.blocks[1].range, { dateRange: 'last_7_days', compareRange: 'previous_year' })
  assert.equal(next.blocks[2].range, null)
}

// resetBlockRange: sets the matching block back to null
{
  const overridden = setBlockRange(base, 'a', { dateRange: 'last_7_days', compareRange: null })
  const next = resetBlockRange(overridden, 'a')
  assert.equal(next.blocks[0].range, null)
}

// addBlock: appends a new block to the end of the blocks array
{
  const base = { defaultRange: { dateRange: 'last_30_days', compareRange: null }, blocks: [] as PersistedBlock[] }
  const block = { id: 'n1', name: 'New', format: 'number' as const, range: null, binding: { source: 'triplewhale' as const, metric: 'sessions' } }
  const next = addBlock(base, block)
  assert.equal(next.blocks.length, 1)
  assert.equal(next.blocks[0].id, 'n1')
  assert.notEqual(next.blocks, base.blocks, 'new array')
  assert.equal(base.blocks.length, 0, 'input unchanged')
}

// updateBlock: updates name/format/binding; preserves id, range, layout; leaves other blocks intact
{
  const cfg: DashboardConfig = {
    defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
    blocks: [
      { id: 'a', name: 'Old', format: 'number', range: { dateRange: 'last_7_days', compareRange: null }, layout: { x: 0, y: 0, w: 2, h: 1 },
        binding: { source: 'triplewhale', metric: 'ad_spend' } },
      { id: 'b', name: 'Other', format: 'currency', range: null, binding: { source: 'triplewhale', metric: 'revenue' } },
    ],
  }
  const next = updateBlock(cfg, 'a', { name: 'New', format: 'currency', range: null, binding: { source: 'triplewhale', metric: 'revenue' } })
  const a = next.blocks.find((x) => x.id === 'a')!
  assert.equal(a.name, 'New')
  assert.equal(a.format, 'currency')
  assert.equal(a.binding.source === 'triplewhale' && a.binding.metric, 'revenue')
  assert.deepEqual(a.range, { dateRange: 'last_7_days', compareRange: null }) // preserved
  assert.deepEqual(a.layout, { x: 0, y: 0, w: 2, h: 1 })                       // preserved
  assert.equal(next.blocks.find((x) => x.id === 'b')!.name, 'Other')         // untouched
}

// setBlockText: patches name on the target block only.
{
  const cfg: DashboardConfig = {
    defaultRange: { dateRange: 'last_30_days', compareRange: null },
    blocks: [
      { id: 'a', name: 'Old', format: 'number', range: null, binding: { source: 'triplewhale', metric: 'sessions' } },
      { id: 'b', name: 'Keep', format: 'number', range: null, binding: { source: 'triplewhale', metric: 'revenue' } },
    ] as PersistedBlock[],
  }
  const next = setBlockText(cfg, 'a', 'name', 'New Title')
  assert.equal(next.blocks.find((x) => x.id === 'a')!.name, 'New Title')
  assert.equal(next.blocks.find((x) => x.id === 'b')!.name, 'Keep')   // untouched
  assert.equal(cfg.blocks.find((x) => x.id === 'a')!.name, 'Old')     // input not mutated
}

// setBlockText: patches narrativeBody; unknown id is a no-op.
{
  const cfg: DashboardConfig = {
    defaultRange: { dateRange: 'last_30_days', compareRange: null },
    blocks: [{ id: 'n', name: 'Note', format: 'number', range: null, kind: 'narrative', binding: { source: 'triplewhale', metric: 'x' } }] as PersistedBlock[],
  }
  assert.equal(setBlockText(cfg, 'n', 'narrativeBody', '# Hi').blocks[0].narrativeBody, '# Hi')
  assert.deepEqual(setBlockText(cfg, 'missing', 'name', 'X'), cfg)
}

// setLabelOverride: set/clear value and dim overrides; prune empty objects; drop labelOverrides when empty
{
  const base: DashboardConfig = { defaultRange: { dateRange: 'last_30_days', compareRange: null }, blocks: [] }
  // set a value override
  const a = setLabelOverride(base, { kind: 'labelValue', dimKey: 'channel', rawValue: 'facebook-ads' }, 'Facebook Ads')
  assert.deepEqual(a.labelOverrides, { values: { channel: { 'facebook-ads': 'Facebook Ads' } } })
  // set a dim header override (on top)
  const b = setLabelOverride(a, { kind: 'labelDim', dimKey: 'channel' }, 'Channel')
  assert.deepEqual(b.labelOverrides, { values: { channel: { 'facebook-ads': 'Facebook Ads' } }, dims: { channel: 'Channel' } })
  // clear the value override (empty) → removed; pruned nested + values key
  const c = setLabelOverride(b, { kind: 'labelValue', dimKey: 'channel', rawValue: 'facebook-ads' }, '  ')
  assert.deepEqual(c.labelOverrides, { dims: { channel: 'Channel' } })
  // clear the last override → labelOverrides dropped entirely
  const d = setLabelOverride(c, { kind: 'labelDim', dimKey: 'channel' }, '')
  assert.equal(d.labelOverrides, undefined)
  assert.equal(base.labelOverrides, undefined) // input not mutated
}

console.log('ok')
