'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MetricFormat } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'
import type { BlockSelections } from './draft'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']

export function BlockPreviewCard({
  proposal,
  pending,
  onConfirm,
  onCancel,
}: {
  proposal: BlockProposal | AggregateProposal
  pending: boolean
  onConfirm: (s: BlockSelections) => void
  onCancel: () => void
}) {
  const cfg = proposal.config
  const binding = cfg.binding
  const isLeaf = binding.source !== 'aggregate'
  // current best-guess metric/account values (leaf only)
  const currentMetric = binding.source === 'supermetrics' ? binding.metricField : binding.source === 'triplewhale' ? binding.metric : ''
  const currentAccount = binding.source === 'supermetrics' ? binding.account : ''
  // leaf alternatives (BlockProposal); aggregate has none in v1
  const leafAlts = isLeaf ? (proposal as BlockProposal).alternatives : undefined

  const [name, setName] = useState(cfg.name)
  const [format, setFormat] = useState<MetricFormat>(cfg.format)
  const [metric, setMetric] = useState(currentMetric)
  const [account, setAccount] = useState(currentAccount)

  const metricOptions = dedupe([{ value: currentMetric, label: currentMetric }, ...(leafAlts?.metric ?? []).map((c) => ({ value: c.value, label: c.label }))])
  const accountOptions = dedupe([{ value: currentAccount, label: currentAccount }, ...(leafAlts?.account ?? []).map((c) => ({ value: c.value, label: c.label }))])

  const label = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Preview</p>

      <Field label="Name">
        <input className={label} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Source"><span className="text-sm text-white/80">{binding.source}</span></Field>

      {isLeaf && (
        <>
          <Field label="Metric">
            {metricOptions.length > 1 ? (
              <select className={label} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {metricOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : <span className="text-sm text-white/80">{currentMetric}</span>}
          </Field>
          {currentAccount !== '' && (
            <Field label="Account">
              {accountOptions.length > 1 ? (
                <select className={label} value={account} onChange={(e) => setAccount(e.target.value)}>
                  {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : <span className="text-sm text-white/80">{currentAccount}</span>}
            </Field>
          )}
        </>
      )}

      {!isLeaf && (
        <Field label="Formula">
          <span className="text-sm text-white/80">{describeAggregate(proposal as AggregateProposal)}</span>
        </Field>
      )}

      <Field label="Format">
        <select className={label} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onCancel} disabled={pending}>Back</button>
        <button
          className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={() => onConfirm({ name, format, ...(isLeaf ? { metric, ...(currentAccount !== '' ? { account } : {}) } : {}) })}
          disabled={pending || name.trim() === ''}
        >
          {pending ? 'Adding…' : 'Add block'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={cn('text-[10px] font-extrabold uppercase tracking-widest text-text-muted')}>{label}</span>
      {children}
    </label>
  )
}

function dedupe(opts: { value: string; label: string }[]): { value: string; label: string }[] {
  const seen = new Set<string>()
  return opts.filter((o) => o.value !== '' && !seen.has(o.value) && (seen.add(o.value), true)).slice(0, 6)
}

function describeAggregate(p: AggregateProposal): string {
  const b = p.config.binding
  if (b.source !== 'aggregate') return p.config.name
  const leaf = (x: typeof b.left) => (x.source === 'supermetrics' ? x.metricField : x.source === 'triplewhale' ? x.metric : 'calc')
  return `${leaf(b.left)} ${b.op} ${leaf(b.right)}`
}
