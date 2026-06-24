'use client'

import { LeafBuilder } from './leaf-builder'
import type { CalculatedDraft, LeafDraft } from './build-config'

type LeafSource = 'supermetrics' | 'triplewhale'
const emptyLeaf = (s: LeafSource): LeafDraft =>
  s === 'supermetrics' ? { source: s, dsId: '', metricField: '', account: '' } : { source: s, metric: '' }

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

/** Weighted-sum editor: rows of [coefficient] × [leaf]. value = Σ coefficient × leaf. */
export function CalculatedBuilder({
  value,
  onChange,
  slug,
}: {
  value: CalculatedDraft
  onChange: (v: CalculatedDraft) => void
  slug: string
}) {
  const terms = value.terms
  const setTerm = (i: number, patch: Partial<CalculatedDraft['terms'][number]>) =>
    onChange({ source: 'calculated', terms: terms.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const addTerm = () => onChange({ source: 'calculated', terms: [...terms, { coefficient: '1', leaf: emptyLeaf('supermetrics') }] })
  const removeTerm = (i: number) => onChange({ source: 'calculated', terms: terms.filter((_, j) => j !== i) })

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Weighted sum · Σ (coefficient × metric)</p>
      {terms.map((t, i) => (
        <div key={i} className="rounded-md border border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              className="w-20 rounded-md border border-white/10 bg-bg-surface px-2 py-1.5 text-sm text-white"
              value={t.coefficient}
              onChange={(e) => setTerm(i, { coefficient: e.target.value })}
              placeholder="× 1"
              aria-label="Coefficient"
            />
            <select
              className="rounded-md border border-white/10 bg-bg-surface px-2 py-1.5 text-xs text-white"
              value={t.leaf.source}
              onChange={(e) => setTerm(i, { leaf: emptyLeaf(e.target.value as LeafSource) })}
            >
              <option value="supermetrics">Supermetrics</option>
              <option value="triplewhale">TripleWhale</option>
            </select>
            <button type="button" onClick={() => removeTerm(i)} className="ml-auto text-text-muted hover:text-white" aria-label="Remove term">✕</button>
          </div>
          <LeafBuilder source={t.leaf.source} value={t.leaf} onChange={(leaf) => setTerm(i, { leaf })} slug={slug} />
        </div>
      ))}
      <button
        type="button"
        onClick={addTerm}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
      >
        + Add term
      </button>
    </div>
  )
}
