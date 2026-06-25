'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { FormulaBuilder } from './formula-builder'
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft, type FormulaDraft } from './build-config'
import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']
const emptyLeaf = (source: 'supermetrics' | 'triplewhale'): LeafDraft =>
  source === 'supermetrics' ? { source, dsId: '', metricField: '', account: '' } : { source, metric: '' }

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function ManualBlockForm({
  source,
  slug,
  pending,
  existingBlocks,
  initial,
  onConfirm,
  onBack,
}: {
  source: 'supermetrics' | 'triplewhale' | 'formula'
  slug: string
  pending: boolean
  existingBlocks: { id: string; name: string }[]
  initial?: ManualDraft
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
  const [leaf, setLeaf] = useState<LeafDraft>(() =>
    initial?.kind === 'leaf' ? initial.leaf : (source === 'formula' ? { source: 'supermetrics', dsId: '', metricField: '', account: '' } : emptyLeaf(source)),
  )
  const [formula, setFormula] = useState<FormulaDraft>(() =>
    initial?.kind === 'formula' ? initial.formula : { source: 'formula', expr: '', operands: {} },
  )

  const draft: ManualDraft =
    source === 'formula'
      ? { kind: 'formula', name, format, formula }
      : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {source !== 'formula' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {source === 'formula' && (
        <FormulaBuilder value={formula} onChange={setFormula} slug={slug} existingBlocks={existingBlocks} />
      )}

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Format</span>
        <select className={ctrl} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <div className="mt-2 flex justify-between">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onBack} disabled={pending}>Back</button>
        <button
          className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={() => onConfirm(buildBlockConfig(draft))}
          disabled={pending || !isDraftComplete(draft)}
        >
          {pending ? 'Adding…' : 'Add block'}
        </button>
      </div>
    </div>
  )
}
