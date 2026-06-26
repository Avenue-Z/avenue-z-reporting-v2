// Run: npx tsx lib/dashboard/formula-resolve.test.ts
import { strict as assert } from 'node:assert'
import { resolveFormula, type FormulaDeps } from './formula-resolve'
import type { AttemptLeaf } from './aggregate'
import type { BlockConfig, FormulaBinding, LeafAttempt } from './types'

const ctx = { slug: 'k' }
// attemptLeaf keyed by leaf identity: triplewhale.metric, supermetrics.metricField, or shopify.query
const attemptLeaf: AttemptLeaf = async (b) => {
  const id = b.source === 'triplewhale' ? b.metric : b.source === 'shopify' ? b.query : b.metricField
  const map: Record<string, LeafAttempt> = {
    spend: { ok: true, value: 200, prevValue: 100 },
    sales: { ok: true, value: 1000, prevValue: 800 },
    tax: { ok: true, value: 200, prevValue: 150 },
  }
  return map[id] ?? { ok: false, error: 'no-data' }
}
// minimal resolveBindingValue stub: only leaf bindings appear as ref targets here
const resolveBindingValue: FormulaDeps['resolveBindingValue'] = async (binding, c, dr, cr, deps) =>
  binding.source === 'supermetrics' || binding.source === 'triplewhale'
    ? attemptLeaf(binding, c, dr, cr)
    : binding.source === 'formula'
      ? resolveFormula(binding, c, dr, cr, deps)
      : { ok: false, error: 'error' }

const baseDeps = (blocks: BlockConfig[] = []): FormulaDeps => ({
  attemptLeaf,
  resolveBindingValue,
  blocksById: new Map(blocks.map((b) => [b.id, b])),
  visited: new Set<string>(),
})

const f = (expr: string, operands: FormulaBinding['operands']): FormulaBinding => ({ source: 'formula', expr, operands })

async function run() {
  // metric operands + constant: (sales - tax) * 1 = 800; prev (800-150)=650
  {
    const b = f('(@s - @t) * 1', { s: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'sales', account: 'a' } }, t: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', 'previous_period', baseDeps())
    assert.equal(r.ok && r.value, 800)
    assert.equal(r.ok && r.prevValue, 650)
  }
  // ref operand: ROAS-ish = @rev / @spend where @rev refs a block
  {
    const revBlock: BlockConfig = { id: 'rev', name: 'Rev', format: 'currency', range: null, binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'sales', account: 'a' } }
    const b = f('@rev / @spend', { rev: { kind: 'ref', blockId: 'rev' }, spend: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'spend' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps([revBlock]))
    assert.equal(r.ok && r.value, 5) // 1000 / 200
  }
  // dangling ref -> invalid-metric
  {
    const b = f('@x + 1', { x: { kind: 'ref', blockId: 'missing' } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps())
    assert.equal(!r.ok && r.error, 'invalid-metric')
  }
  // div by zero -> no-data
  {
    const b = f('@s / 0', { s: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'spend' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', null, baseDeps())
    assert.equal(!r.ok && r.error, 'no-data')
  }
  // self / circular reference -> error
  {
    const selfBlock: BlockConfig = { id: 'self', name: 'Self', format: 'number', range: null, binding: f('@me + 1', { me: { kind: 'ref', blockId: 'self' } }) }
    const deps = baseDeps([selfBlock]); deps.visited.add('self')
    const r = await resolveFormula(selfBlock.binding as FormulaBinding, ctx, 'last_30_days', null, deps)
    assert.equal(!r.ok && r.error, 'error')
  }
  // prev present iff every operand has prev (spend has prev; a constant has none-effect) — here mix with a leaf lacking prev
  {
    const attemptNoPrev: AttemptLeaf = async () => ({ ok: true, value: 5 }) // no prevValue
    const deps: FormulaDeps = { ...baseDeps(), attemptLeaf: attemptNoPrev, resolveBindingValue: async (bnd, c, dr, cr) => attemptNoPrev(bnd as never, c, dr, cr) }
    const b = f('@x + 1', { x: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'whatever' } } })
    const r = await resolveFormula(b, ctx, 'last_30_days', 'previous_period', deps)
    assert.equal(r.ok && r.value, 6)
    assert.equal(r.ok && r.prevValue, undefined)
  }
  console.log('ok')
}
run().catch((e) => { console.error(e); process.exit(1) })
