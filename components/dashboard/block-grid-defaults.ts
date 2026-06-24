import type { BlockKind } from '@/lib/dashboard/types'

/** Per-kind default grid sizing on the 12-column desktop grid. `w`/`h` are the
 *  initial size assigned to a newly-placed (or auto-packed) block; `minW`/`minH`
 *  are the user-resize floors enforced by react-grid-layout. */
export const DEFAULT_LAYOUT: Record<BlockKind, { w: number; h: number; minW: number; minH: number }> = {
  kpi:       { w: 3,  h: 2, minW: 2, minH: 2 },   // 4-per-row — matches today's lg:grid-cols-4 visual
  pills:     { w: 4,  h: 1, minW: 2, minH: 1 },   // compact horizontal KPI strip
  bar:       { w: 6,  h: 4, minW: 4, minH: 3 },
  line:      { w: 6,  h: 4, minW: 4, minH: 3 },
  table:     { w: 8,  h: 5, minW: 4, minH: 3 },
  narrative: { w: 12, h: 3, minW: 4, minH: 2 },
  header:    { w: 12, h: 1, minW: 4, minH: 1 },
}

/** Desktop grid column count. Kept here so DEFAULT_LAYOUT and the grid agree. */
export const GRID_COLS_LG = 12
