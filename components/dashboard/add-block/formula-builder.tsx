'use client'

import { useMemo } from 'react'
import { LeafBuilder } from './leaf-builder'
import { parse, operandKeys } from '@/lib/dashboard/formula/parse'
import type { FormulaDraft, FormulaOperandDraft, LeafDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'
const emptyLeaf = (): LeafDraft => ({ source: 'supermetrics', dsId: '', metricField: '', account: '' })

export function FormulaBuilder({
  value,
  onChange,
  slug,
  existingBlocks,
}: {
  value: FormulaDraft
  onChange: (v: FormulaDraft) => void
  slug: string
  existingBlocks: { id: string; name: string }[]
}) {
  const { keys, error } = useMemo(() => {
    try { parse(value.expr); return { keys: operandKeys(value.expr), error: null as string | null } }
    catch (e) { return { keys: [] as string[], error: e instanceof Error ? e.message : 'invalid formula' } }
  }, [value.expr])

  const setExpr = (expr: string) => onChange({ ...value, expr })
  const setOperand = (key: string, op: FormulaOperandDraft) => onChange({ ...value, operands: { ...value.operands, [key]: op } })

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Formula</span>
        <input className={ctrl} value={value.expr} onChange={(e) => setExpr(e.target.value)}
          placeholder="(@rev - @tax) / @spend" />
        <span className="text-[11px] text-text-muted">
          Reference operands as <code>@name</code>; use <code>+ - * /</code>, parentheses, and numbers (e.g. <code>0.8 * @row</code>).
        </span>
      </label>

      {value.expr.trim() !== '' && error && <p className="text-xs text-[#FF6666]">Invalid formula: {error}</p>}

      {keys.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className={labelCls}>Operands</p>
          {keys.map((key) => {
            const op = value.operands[key]
            const kind = op?.kind ?? 'ref'
            return (
              <div key={key} className="rounded-md border border-white/10 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-brand-cyan">@{key}</span>
                  <select className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-xs text-white"
                    value={kind}
                    onChange={(e) => setOperand(key, e.target.value === 'metric' ? { kind: 'metric', leaf: emptyLeaf() } : { kind: 'ref', blockId: '' })}>
                    <option value="ref">Existing metric</option>
                    <option value="metric">New metric</option>
                  </select>
                </div>
                {(!op || op.kind === 'ref') ? (
                  <select className={ctrl} value={op?.kind === 'ref' ? op.blockId : ''}
                    onChange={(e) => setOperand(key, { kind: 'ref', blockId: e.target.value })}>
                    <option value="">Select a block…</option>
                    {existingBlocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                ) : (
                  <LeafBuilder source={op.leaf.source} value={op.leaf} onChange={(leaf) => setOperand(key, { kind: 'metric', leaf })} slug={slug} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
