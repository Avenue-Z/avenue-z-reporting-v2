// Helpers for the public dashboard share: grouping blocks into sections (for the
// Share dialog's component tree) and producing the shared subset (filter selected
// blocks, drop empty sections, repack the layout so the subset has no gaps).
import { DEFAULT_LAYOUT, GRID_COLS_LG as COLS } from '@/components/dashboard/block-grid-defaults'
import type { BlockKind, PersistedBlock } from './types'

const isHeader = (b: PersistedBlock) => (b.kind ?? 'kpi') === 'header'

export interface ShareSection {
  /** The header block leading this section, or null for blocks before the first header. */
  header: PersistedBlock | null
  /** Non-header data blocks under this header (the selectable subcomponents). */
  blocks: PersistedBlock[]
}

/** Group blocks into sections delimited by header blocks, in display order. A run of
 *  data blocks before the first header forms a leading section with header=null. */
export function groupSections(blocks: PersistedBlock[]): ShareSection[] {
  const sections: ShareSection[] = []
  let current: ShareSection | null = null
  for (const b of blocks) {
    if (isHeader(b)) {
      current = { header: b, blocks: [] }
      sections.push(current)
    } else {
      if (!current) {
        current = { header: null, blocks: [] }
        sections.push(current)
      }
      current.blocks.push(b)
    }
  }
  return sections
}

/** The shared subset: keep selected data blocks, keep a section's header only if at
 *  least one of its blocks is selected (drops empty sections + their headers).
 *  Preserves display order. */
export function filterSharedBlocks(blocks: PersistedBlock[], selected: Set<string>): PersistedBlock[] {
  const out: PersistedBlock[] = []
  for (const section of groupSections(blocks)) {
    const kept = section.blocks.filter((b) => selected.has(b.id))
    if (kept.length === 0) continue
    if (section.header) out.push(section.header)
    out.push(...kept)
  }
  return out
}

/** Repack blocks into a gap-free 12-col grid, preserving order and each block's size
 *  (falling back to per-kind defaults). Headers span the full width on their own row.
 *  Used by the shared view so an arbitrary subset still looks clean. */
export function reflowBlocks(blocks: PersistedBlock[]): PersistedBlock[] {
  let x = 0
  let y = 0
  let rowH = 0
  return blocks.map((b) => {
    const kind: BlockKind = b.kind ?? 'kpi'
    const def = DEFAULT_LAYOUT[kind]
    const h = b.layout?.h ?? def.h
    if (kind === 'header') {
      if (x > 0) { y += rowH; x = 0; rowH = 0 } // close the open row
      const placed = { ...b, layout: { x: 0, y, w: COLS, h } }
      y += h
      return placed
    }
    const w = Math.min(b.layout?.w ?? def.w, COLS)
    if (x + w > COLS) { y += rowH; x = 0; rowH = 0 } // wrap to next row
    const placed = { ...b, layout: { x, y, w, h } }
    x += w
    rowH = Math.max(rowH, h)
    return placed
  })
}
