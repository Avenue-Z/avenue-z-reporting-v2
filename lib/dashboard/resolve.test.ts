// lib/dashboard/resolve.test.ts
// Run: npx tsx lib/dashboard/resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveBlock, type LeafResolver } from './resolve'
import type { BlockConfig } from './types'
import { NoDataError } from './errors'

const GLOBAL = { dateRange: 'last_30_days', compareRange: 'previous_period' as string | null }

// records the range a leaf was asked for, so we can assert override-vs-inherit
function spyResolver(value: number, prev?: number): { fn: LeafResolver; calls: string[] } {
  const calls: string[] = []
  const fn: LeafResolver = async (_b, _c, dateRange) => { calls.push(dateRange); return { value, prevValue: prev } }
  return { fn, calls }
}

const smBlock = (range: BlockConfig['range']): BlockConfig => ({
  id: 'b', name: 'Cost', format: 'currency', range,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
})

async function run() {
  // inherit: leaf asked for the GLOBAL range; delta + formatted populated
  {
    const { fn, calls } = spyResolver(150, 100)
    const r = await resolveBlock(smBlock(null), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
    assert.equal(calls[0], 'last_30_days')
    assert.equal(r.ok && r.value, 150)
    assert.equal(r.ok && r.delta, 50)
    assert.equal(r.ok && r.formatted, '$150')
  }

  // override: leaf asked for the BLOCK range, not global
  {
    const { fn, calls } = spyResolver(10)
    await resolveBlock(smBlock({ dateRange: 'last_7_days', compareRange: null }), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
    assert.equal(calls[0], 'last_7_days')
  }

  // no comparison → delta hidden (undefined), even though prevValue absent
  {
    const { fn } = spyResolver(10)
    const r = await resolveBlock(smBlock({ dateRange: 'last_7_days', compareRange: null }), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
    assert.equal(r.ok && r.prevValue, undefined)
    assert.equal(r.ok && r.delta, undefined)
  }

  // leaf throws → mapped error result, never throws out of resolveBlock
  {
    const fn: LeafResolver = async () => { throw new NoDataError('empty') }
    const r = await resolveBlock(smBlock(null), GLOBAL, { slug: 'ren' }, { resolveLeaf: fn })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'no-data')
  }

  // aggregate path: 1000 / 250 = 4, formatted as number
  {
    const fn: LeafResolver = async (b) => (b.source === 'triplewhale' ? { value: 1000 } : { value: 250 })
    const agg: BlockConfig = {
      id: 'a', name: 'ROAS', format: 'number', range: null,
      binding: { source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' } },
    }
    const r = await resolveBlock(agg, { dateRange: 'last_30_days', compareRange: null }, { slug: 'ren' }, { resolveLeaf: fn })
    assert.equal(r.ok && r.value, 4)
    assert.equal(r.ok && r.formatted, '4')
  }
  // calculated block path: weighted sum routed through resolveBlock (100 - 25 = 75)
  {
    const fn: LeafResolver = async (b) => (b.source === 'triplewhale' ? { value: 100 } : { value: 25 })
    const calc: BlockConfig = { id: 'c', name: 'Net', format: 'number', range: null,
      binding: { source: 'calculated', terms: [
        { coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } },
        { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'fee', account: '1' } },
      ] } }
    const r = await resolveBlock(calc, GLOBAL, { slug: 'k' }, { resolveLeaf: fn })
    assert.equal(r.ok && r.value, 75)
  }

  // formula self-reference: resolveBlock seeds visited with config.id → cycle error
  {
    const selfBlock: BlockConfig = {
      id: 'self', name: 'Self', format: 'number', range: null,
      binding: { source: 'formula', expr: '@me + 1', operands: { me: { kind: 'ref', blockId: 'self' } } },
    }
    const blocksById = new Map<string, BlockConfig>([['self', selfBlock]])
    const r = await resolveBlock(selfBlock, GLOBAL, { slug: 'k' }, { resolveLeaf: async () => ({ value: 0 }), blocksById })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'error')
  }

  console.log('ok')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
