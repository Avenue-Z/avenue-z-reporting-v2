'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { FormulaBuilder } from './formula-builder'
import { BarBuilder } from './bar-builder'
import { LineBuilder } from './line-builder'
import { HeaderBuilder } from './header-builder'
import { NarrativeBuilder } from './narrative-builder'
import { TableBuilder } from './table-builder'
import {
  buildBlockConfig, isDraftComplete,
  type LeafDraft, type ManualDraft, type FormulaDraft,
  type BarDraft, type LineDraft, type HeaderDraft, type NarrativeDraft, type TableDraft,
} from './build-config'
import type { BlockConfig, BlockKind, Granularity, MetricFormat } from '@/lib/dashboard/types'

type LeafSource = 'supermetrics' | 'triplewhale' | 'shopify'
type FormSource = 'supermetrics' | 'triplewhale' | 'shopify' | 'formula'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number', 'multiple']
const emptyLeaf = (source: LeafSource): LeafDraft =>
  source === 'supermetrics' ? { source, dsId: '', metricField: '', account: '' }
    : source === 'shopify' ? { source, query: '' }
      : { source, metric: '' }

/** Leaf source to seed chart/leaf builders with: 'formula' isn't a leaf, fall back to supermetrics. */
const leafSourceFor = (source: FormSource): LeafSource => (source === 'formula' ? 'supermetrics' : source)

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function ManualBlockForm({
  kind,
  source,
  slug,
  pending,
  existingBlocks,
  initial,
  onConfirm,
  onBack,
}: {
  kind: BlockKind
  source: FormSource
  slug: string
  pending: boolean
  existingBlocks: { id: string; name: string }[]
  initial?: ManualDraft
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const seedLeaf = emptyLeaf(leafSourceFor(source))
  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => (initial?.kind === 'leaf' ? initial.leaf : seedLeaf))
  const [formula, setFormula] = useState<FormulaDraft>(() =>
    initial?.kind === 'formula' ? initial.formula : { source: 'formula', expr: '', operands: {} })
  const [bar, setBar] = useState<BarDraft>(() =>
    initial?.kind === 'bar' ? initial.bar : { source: 'bar', leaf: seedLeaf, dimension: '', topN: 12 })
  const [line, setLine] = useState<LineDraft>(() =>
    initial?.kind === 'line' ? initial.line : { source: 'line', leaf: seedLeaf, granularity: 'day' as Granularity })
  const [header, setHeader] = useState<HeaderDraft>(() =>
    initial?.kind === 'header' ? initial.header : { source: 'header', level: 2 })
  const [narrative, setNarrative] = useState<NarrativeDraft>(() =>
    initial?.kind === 'narrative' ? initial.narrative : { source: 'narrative', body: '' })
  const [table, setTable] = useState<TableDraft>(() =>
    initial?.kind === 'table' ? initial.table : { source: 'table', leaf: seedLeaf, dimension: '' })

  const draft: ManualDraft =
    kind === 'bar'
      ? { kind: 'bar', name, format, bar }
      : kind === 'line'
        ? { kind: 'line', name, format, line }
        : kind === 'table'
          ? { kind: 'table', name, format, table }
          : kind === 'header'
            ? { kind: 'header', name, format, header }
            : kind === 'narrative'
              ? { kind: 'narrative', name, format, narrative }
              : source === 'formula'
                ? { kind: 'formula', name, format, formula }
                : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {kind} · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {kind === 'kpi' && source !== 'formula' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {kind === 'kpi' && source === 'formula' && (
        <FormulaBuilder value={formula} onChange={setFormula} slug={slug} existingBlocks={existingBlocks} />
      )}

      {kind === 'bar' && <BarBuilder value={bar} onChange={setBar} slug={slug} />}
      {kind === 'line' && <LineBuilder value={line} onChange={setLine} slug={slug} />}
      {kind === 'table' && <TableBuilder value={table} onChange={setTable} slug={slug} />}
      {kind === 'header' && <HeaderBuilder value={header} onChange={setHeader} />}
      {kind === 'narrative' && <NarrativeBuilder value={narrative} onChange={setNarrative} />}

      {kind !== 'header' && kind !== 'narrative' && (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Format</span>
          <select className={ctrl} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}

      <div className="mt-2 flex justify-between">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onBack} disabled={pending}>Back</button>
        <button
          className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={() => onConfirm(buildBlockConfig(draft))}
          disabled={pending || !isDraftComplete(draft)}
        >
          {pending ? (initial ? 'Saving…' : 'Adding…') : (initial ? 'Save' : 'Add block')}
        </button>
      </div>
    </div>
  )
}
