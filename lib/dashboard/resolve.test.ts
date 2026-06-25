// lib/dashboard/resolve.test.ts
// Run: npx tsx lib/dashboard/resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveBlock, resolveGroupedBlock, resolveSeriesBlock, type LeafResolver, type GroupedResolver, type SeriesResolver } from './resolve'
import type { BlockConfig, GroupedRow, SeriesPoint } from './types'
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

  // resolveGroupedBlock: aggregate binding → invalid-metric.
  {
    const agg: BlockConfig = {
      id: 'ga', name: 'X', format: 'number', range: null,
      binding: { source: 'aggregate', op: '/',
        left:  { source: 'triplewhale', metric: 'revenue' },
        right: { source: 'triplewhale', metric: 'ad_spend' } },
    }
    const r = await resolveGroupedBlock(agg, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveGroupedBlock: calculated binding → invalid-metric.
  {
    const calc: BlockConfig = {
      id: 'gc', name: 'X', format: 'number', range: null,
      binding: { source: 'calculated', terms: [{ coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } }] },
    }
    const r = await resolveGroupedBlock(calc, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveGroupedBlock: leaf binding + mock resolver → ok with rows + format.
  {
    const cfg: BlockConfig = {
      id: 'g', name: 'Spend by Channel', format: 'currency', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel'] },
    }
    const mock: GroupedResolver = async () => [{ dim: { Channel: 'Google' }, value: 1000 } as GroupedRow]
    const r = await resolveGroupedBlock(cfg, GLOBAL, { slug: 'k' }, { resolveGrouped: mock })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.rows.length, 1)
      assert.equal(r.format, 'currency')
    }
  }

  // resolveSeriesBlock: missing granularity → invalid-metric.
  {
    const cfg: BlockConfig = {
      id: 's', name: 'X', format: 'number', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
    }
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'invalid-metric')
  }

  // resolveSeriesBlock: leaf binding + granularity + mock → ok with points + granularity + format.
  {
    const cfg: BlockConfig = {
      id: 's2', name: 'Cost over time', format: 'currency', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'day' },
    }
    const mock: SeriesResolver = async () => [
      { bucket: '2026-06-22', value: 10 } as SeriesPoint,
      { bucket: '2026-06-23', value: 20 } as SeriesPoint,
    ]
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' }, { resolveSeries: mock })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.points.length, 2)
      assert.equal(r.granularity, 'day')
      assert.equal(r.format, 'currency')
    }
  }

  // resolveSeriesBlock: mock throws NoDataError → result-level error mapped.
  {
    const cfg: BlockConfig = {
      id: 's3', name: 'X', format: 'number', range: null,
      binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'day' },
    }
    const mock: SeriesResolver = async () => { throw new NoDataError('empty') }
    const r = await resolveSeriesBlock(cfg, GLOBAL, { slug: 'k' }, { resolveSeries: mock })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'no-data')
  }

  console.log('ok')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
