'use client'

import { LeafBuilder } from './leaf-builder'
import type { PillsDraft, LeafDraft } from './build-config'

export function PillsBuilder({
  value, onChange, slug,
}: {
  value: PillsDraft
  onChange: (v: PillsDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  return <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
}
