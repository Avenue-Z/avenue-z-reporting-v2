'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { CalculatedBuilder } from './calculated-builder'
import { BarBuilder } from './bar-builder'
import { LineBuilder } from './line-builder'
import { HeaderBuilder } from './header-builder'
import { NarrativeBuilder } from './narrative-builder'
import { PillsBuilder } from './pills-builder'
import { TableBuilder } from './table-builder'
import {
  buildBlockConfig, isDraftComplete,
  type LeafDraft, type ManualDraft, type CalculatedDraft, type OperandDraft,
  type BarDraft, type LineDraft, type HeaderDraft, type NarrativeDraft, type PillsDraft, type TableDraft,
} from './build-config'
import type { BlockConfig, BlockKind, Granularity, MetricFormat } from '@/lib/dashboard/types'

type LeafSource = 'supermetrics' | 'triplewhale'
type Op = '+' | '-' | '*' | '/'
type FormSource = 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']
const OPS: { value: Op; label: string }[] = [
  { value: '/', label: '÷ divide' },
  { value: '*', label: '× multiply' },
  { value: '+', label: '+ add' },
  { value: '-', label: '− subtract' },
]
const emptyLeaf = (source: LeafSource): LeafDraft =>
  source === 'supermetrics' ? { source, dsId: '', metricField: '', account: '' } : { source, metric: '' }

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function ManualBlockForm({
  kind,
  source,
  slug,
  pending,
  initial,
  onConfirm,
  onBack,
}: {
  kind: BlockKind
  source: FormSource
  slug: string
  pending: boolean
  initial?: ManualDraft
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => emptyLeaf(source === 'aggregate' || source === 'calculated' ? 'supermetrics' : source as LeafSource))
  const [calc, setCalc] = useState<CalculatedDraft>(() => ({ source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] }))
  const [op, setOp] = useState<Op>('/')
  const [left, setLeft] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('triplewhale') }))
  const [right, setRight] = useState<OperandDraft>(() => ({ kind: 'leaf', leaf: emptyLeaf('supermetrics') }))
  const [bar, setBar] = useState<BarDraft>(() => ({ source: 'bar', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), dimension: '' }))
  const [line, setLine] = useState<LineDraft>(() => ({ source: 'line', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), granularity: 'day' as Granularity }))
  const [header, setHeader] = useState<HeaderDraft>(() =>
    initial?.kind === 'header' ? initial.header : { source: 'header', level: 2 })
  const [narrative, setNarrative] = useState<NarrativeDraft>(() =>
    initial?.kind === 'narrative' ? initial.narrative : { source: 'narrative', body: '' })
  const [pills, setPills] = useState<PillsDraft>(() => ({ source: 'pills', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics') }))
  const [table, setTable] = useState<TableDraft>(() => ({ source: 'table', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), dimension: '' }))

  const draft: ManualDraft =
    kind === 'bar'
      ? { kind: 'bar', name, format, bar }
      : kind === 'line'
        ? { kind: 'line', name, format, line }
        : kind === 'pills'
          ? { kind: 'pills', name, format, pills }
          : kind === 'table'
            ? { kind: 'table', name, format, table }
            : kind === 'header'
              ? { kind: 'header', name, format, header }
              : kind === 'narrative'
                ? { kind: 'narrative', name, format, narrative }
                : source === 'aggregate'
                  ? { kind: 'aggregate', name, format, op, left, right }
                  : source === 'calculated'
                    ? { kind: 'calculated', name, format, calc }
                    : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {kind} · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {kind === 'kpi' && source !== 'aggregate' && source !== 'calculated' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {kind === 'kpi' && source === 'calculated' && (
        <CalculatedBuilder value={calc} onChange={setCalc} slug={slug} />
      )}

      {kind === 'kpi' && source === 'aggregate' && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Operator</span>
            <select className={ctrl} value={op} onChange={(e) => setOp(e.target.value as Op)}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Operand title="Left" value={left} onChange={setLeft} slug={slug} />
          <Operand title="Right" value={right} onChange={setRight} slug={slug} />
        </>
      )}

      {kind === 'bar' && <BarBuilder value={bar} onChange={setBar} slug={slug} />}
      {kind === 'line' && <LineBuilder value={line} onChange={setLine} slug={slug} />}
      {kind === 'pills' && <PillsBuilder value={pills} onChange={setPills} slug={slug} />}
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
          {pending ? 'Adding…' : 'Add block'}
        </button>
      </div>
    </div>
  )
}

function Operand({
  title, value, onChange, slug,
}: {
  title: string
  value: OperandDraft
  onChange: (v: OperandDraft) => void
  slug: string
}) {
  const kindOp = value.kind === 'calculated' ? 'calculated' : value.leaf.source
  const onKind = (k: string) => {
    if (k === 'calculated') onChange({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] } })
    else onChange({ kind: 'leaf', leaf: emptyLeaf(k as 'supermetrics' | 'triplewhale') })
  }
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={labelCls}>{title}</span>
        <select className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white" value={kindOp} onChange={(e) => onKind(e.target.value)}>
          <option value="supermetrics">Supermetrics</option>
          <option value="triplewhale">TripleWhale</option>
          <option value="calculated">Calculated (weighted sum)</option>
        </select>
      </div>
      {value.kind === 'calculated' ? (
        <CalculatedBuilder value={value.calc} onChange={(calc) => onChange({ kind: 'calculated', calc })} slug={slug} />
      ) : (
        <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={(leaf) => onChange({ kind: 'leaf', leaf })} slug={slug} />
      )}
    </div>
  )
}
