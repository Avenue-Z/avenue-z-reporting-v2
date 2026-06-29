'use client'

import { LeafBuilder } from './leaf-builder'
import { GranularityRadio } from './granularity-radio'
import type { LineDraft, LeafDraft } from './build-config'
import type { Granularity } from '@/lib/dashboard/types'

export function LineBuilder({
  value,
  onChange,
  slug,
}: {
  value: LineDraft
  onChange: (v: LineDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  const setG = (granularity: Granularity) => onChange({ ...value, granularity })
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <GranularityRadio value={value.granularity} onChange={setG} />
    </div>
  )
}
