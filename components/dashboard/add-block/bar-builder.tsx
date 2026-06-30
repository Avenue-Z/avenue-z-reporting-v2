'use client'

import { LeafBuilder } from './leaf-builder'
import { DimensionPicker } from './dimension-picker'
import type { BarDraft, LeafDraft } from './build-config'

export function BarBuilder({
  value,
  onChange,
  slug,
}: {
  value: BarDraft
  onChange: (v: BarDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  const setDim = (dimension: string) => onChange({ ...value, dimension })
  const setTopN = (topN: number | undefined) => onChange({ ...value, topN })
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <DimensionPicker leaf={value.leaf} slug={slug} value={value.dimension} onChange={setDim} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-muted">Show top N categories (rest grouped as “Other”)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={value.topN ?? ''}
          placeholder="All categories"
          onChange={(e) => {
            const n = e.target.value === '' ? undefined : Math.max(1, Math.floor(Number(e.target.value)))
            setTopN(n !== undefined && Number.isFinite(n) ? n : undefined)
          }}
          className="block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white"
        />
      </label>
    </div>
  )
}
