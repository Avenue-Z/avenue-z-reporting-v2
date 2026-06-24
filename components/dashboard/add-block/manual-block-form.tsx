'use client'

import { useState } from 'react'
import { LeafBuilder } from './leaf-builder'
import { CalculatedBuilder } from './calculated-builder'
import { buildBlockConfig, isDraftComplete, type LeafDraft, type ManualDraft, type CalculatedDraft } from './build-config'
import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'

type LeafSource = 'supermetrics' | 'triplewhale'
type Op = '+' | '-' | '*' | '/'

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
  source,
  slug,
  pending,
  onConfirm,
  onBack,
}: {
  source: 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'
  slug: string
  pending: boolean
  onConfirm: (cfg: Omit<BlockConfig, 'id'>) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<MetricFormat>('number')
  const [leaf, setLeaf] = useState<LeafDraft>(() => emptyLeaf(source === 'aggregate' || source === 'calculated' ? 'supermetrics' : source))
  const [calc, setCalc] = useState<CalculatedDraft>(() => ({ source: 'calculated', terms: [{ coefficient: '1', leaf: emptyLeaf('supermetrics') }] }))
  const [op, setOp] = useState<Op>('/')
  const [leftSource, setLeftSource] = useState<LeafSource>('triplewhale')
  const [rightSource, setRightSource] = useState<LeafSource>('supermetrics')
  const [left, setLeft] = useState<LeafDraft>(() => emptyLeaf('triplewhale'))
  const [right, setRight] = useState<LeafDraft>(() => emptyLeaf('supermetrics'))

  const draft: ManualDraft =
    source === 'aggregate'
      ? { kind: 'aggregate', name, format, op, left, right }
      : source === 'calculated'
        ? { kind: 'calculated', name, format, calc }
        : { kind: 'leaf', name, format, leaf }

  return (
    <div className="flex flex-col gap-3">
      <p className={labelCls}>Build manually · {source}</p>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>Name</span>
        <input className={ctrl} value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" />
      </label>

      {source !== 'aggregate' && source !== 'calculated' && (
        <LeafBuilder source={source} value={leaf} onChange={setLeaf} slug={slug} onSuggestFormat={setFormat} />
      )}

      {source === 'calculated' && (
        <CalculatedBuilder value={calc} onChange={setCalc} slug={slug} />
      )}

      {source === 'aggregate' && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Operator</span>
            <select className={ctrl} value={op} onChange={(e) => setOp(e.target.value as Op)}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <Operand title="Left" src={leftSource} onSrc={(s) => { setLeftSource(s); setLeft(emptyLeaf(s)) }} value={left} onChange={setLeft} slug={slug} />
          <Operand title="Right" src={rightSource} onSrc={(s) => { setRightSource(s); setRight(emptyLeaf(s)) }} value={right} onChange={setRight} slug={slug} />
        </>
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

function Operand({
  title,
  src,
  onSrc,
  value,
  onChange,
  slug,
}: {
  title: string
  src: LeafSource
  onSrc: (s: LeafSource) => void
  value: LeafDraft
  onChange: (v: LeafDraft) => void
  slug: string
}) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={labelCls}>{title}</span>
        <select
          className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white"
          value={src}
          onChange={(e) => onSrc(e.target.value as LeafSource)}
        >
          <option value="supermetrics">Supermetrics</option>
          <option value="triplewhale">TripleWhale</option>
        </select>
      </div>
      <LeafBuilder source={src} value={value} onChange={onChange} slug={slug} />
    </div>
  )
}
