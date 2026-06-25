// lib/dashboard/aggregate.test.ts
// Run: npx tsx lib/dashboard/aggregate.test.ts
import { strict as assert } from 'node:assert'
import { resolveAggregate, resolveCalculated, type AttemptLeaf } from './aggregate'
import type { AggregateBinding, CalculatedBinding, LeafBinding } from './types'

const TW: LeafBinding = { source: 'triplewhale', metric: 'revenue' }
const SM: LeafBinding = { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }

// fake attemptLeaf: returns a fixed result per source
const fake = (map: Record<string, Awaited<ReturnType<AttemptLeaf>>>): AttemptLeaf =>
  async (b) => map[b.source]

const ratio: AggregateBinding = { source: 'aggregate', op: '/', left: TW, right: SM }

async function run() {
  // ratio: 1000 / 250 = 4; prev 800 / 200 = 4
  {
    const r = await resolveAggregate(ratio, fake({
      triplewhale: { ok: true, value: 1000, prevValue: 800 },
      supermetrics: { ok: true, value: 250, prevValue: 200 },
    }), { slug: 'ren' }, 'last_30_days', 'previous_period')
    assert.equal(r.ok, true)
    if (r.ok) { assert.equal(r.value, 4); assert.equal(r.prevValue, 4) }
  }

  // sum, no comparison: prevValue undefined when operands lack prev
  {
    const r = await resolveAggregate({ ...ratio, op: '+' }, fake({
      triplewhale: { ok: true, value: 10 },
      supermetrics: { ok: true, value: 5 },
    }), { slug: 'ren' }, 'last_30_days', null)
    assert.equal(r.ok && r.value, 15)
    assert.equal(r.ok && r.prevValue, undefined)
  }

  // divide-by-zero → no-data
  {
    const r = await resolveAggregate(ratio, fake({
      triplewhale: { ok: true, value: 100 },
      supermetrics: { ok: true, value: 0 },
    }), { slug: 'ren' }, 'last_30_days', null)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.error, 'no-data')
  }

  // one operand fails → that error
  {
    const r = await resolveAggregate(ratio, fake({
      triplewhale: { ok: true, value: 100 },
      supermetrics: { ok: false, error: 'invalid-metric' },
    }), { slug: 'ren' }, 'last_30_days', null)
    assert.equal(!r.ok && r.error, 'invalid-metric')
  }

  // both fail → precedence (disconnected beats no-data) regardless of side
  {
    const r = await resolveAggregate(ratio, fake({
      triplewhale: { ok: false, error: 'no-data' },
      supermetrics: { ok: false, error: 'disconnected' },
    }), { slug: 'ren' }, 'last_30_days', null)
    assert.equal(!r.ok && r.error, 'disconnected')
  }
  // resolveCalculated: signed weighted sum (rev - tax)
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] }
    const byField: AttemptLeaf = async (b) =>
      b.source === 'supermetrics' && b.metricField === 'total_sales' ? { ok: true, value: 1000, prevValue: 800 }
        : { ok: true, value: 200, prevValue: 150 }
    const r = await resolveCalculated(calc, byField, { slug: 'k' }, 'last_30_days', 'previous_period')
    assert.equal(r.ok && r.value, 800)      // 1000 - 200
    assert.equal(r.ok && r.prevValue, 650)  // 800 - 150
  }

  // resolveCalculated: prev present iff EVERY term has prev
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 2, leaf: { source: 'triplewhale', metric: 'a' } },
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'b', account: '1' } },
    ] }
    const r = await resolveCalculated(calc, fake({
      triplewhale: { ok: true, value: 3 },                 // no prev
      supermetrics: { ok: true, value: 4, prevValue: 9 },
    }), { slug: 'k' }, 'last_30_days', 'previous_period')
    assert.equal(r.ok && r.value, 10)        // 2*3 + 4
    assert.equal(r.ok && r.prevValue, undefined)
  }

  // resolveCalculated: one term fails → worst error (disconnected beats no-data)
  {
    const calc: CalculatedBinding = { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'triplewhale', metric: 'a' } },
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'X', metricField: 'b', account: '1' } },
    ] }
    const r = await resolveCalculated(calc, fake({
      triplewhale: { ok: false, error: 'no-data' },
      supermetrics: { ok: false, error: 'disconnected' },
    }), { slug: 'k' }, 'last_30_days', null)
    assert.equal(!r.ok && r.error, 'disconnected')
  }

  // calculated as aggregate operand: (rev - tax) / spend = (1000-200)/200 = 4
  {
    const agg: AggregateBinding = { source: 'aggregate', op: '/',
      left: { source: 'calculated', terms: [
        { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
        { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
      ] },
      right: { source: 'triplewhale', metric: 'ad_spend' } }
    const at: AttemptLeaf = async (b) =>
      b.source === 'triplewhale' ? { ok: true, value: 200 }
        : b.source === 'supermetrics' && b.metricField === 'total_sales' ? { ok: true, value: 1000 } : { ok: true, value: 200 }
    const r = await resolveAggregate(agg, at, { slug: 'k' }, 'last_30_days', null)
    assert.equal(r.ok && r.value, 4)
  }
  console.log('ok')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
