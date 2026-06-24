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
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <DimensionPicker leaf={value.leaf} slug={slug} value={value.dimension} onChange={setDim} />
    </div>
  )
}
