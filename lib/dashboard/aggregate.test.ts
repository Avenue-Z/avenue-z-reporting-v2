// lib/dashboard/aggregate.test.ts
// Run: npx tsx lib/dashboard/aggregate.test.ts
import { strict as assert } from 'node:assert'
import { resolveAggregate, type AttemptLeaf } from './aggregate'
import type { AggregateBinding, LeafBinding } from './types'

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
  console.log('ok')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
