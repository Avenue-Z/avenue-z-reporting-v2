'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { BlockSkeleton } from './blocks/block-skeleton'
import { applyLayoutChange } from './config-mutations'
import { DEFAULT_LAYOUT, GRID_COLS_LG } from './block-grid-defaults'
import type { BlockKind, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

const ResponsiveGrid = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 }
const COLS = { lg: GRID_COLS_LG, md: 8, sm: 4 }
const ROW_HEIGHT = 52 // KPI h:2 → 2*52 + 20 margin = 124px ≈ natural KpiCard pill height (kills the SSR→grid stretch)
const SAVE_DEBOUNCE_MS = 300

export interface BlockGridProps {
  blocks: PersistedBlock[]
  canEdit: boolean
  slug: string
  config: DashboardConfig
  /** Rendered child per block (the <MetricBlockShell>, kind-dispatched at the page route). */
  renderBlock: (block: PersistedBlock) => ReactNode
}

/** Build the RGL Layout array for the lg breakpoint, auto-packing unplaced
 *  blocks (no `layout`) at their per-kind default size, left-to-right then
 *  top-to-bottom. Placed blocks keep their persisted `{x, y, w, h}`. */
function buildLgLayout(blocks: PersistedBlock[]): Layout[] {
  let cursorX = 0
  let cursorY = 0
  return blocks.map((b) => {
    const kind: BlockKind = b.kind ?? 'kpi'
    const def = DEFAULT_LAYOUT[kind]
    if (b.layout) {
      return { i: b.id, x: b.layout.x, y: b.layout.y, w: b.layout.w, h: b.layout.h, minW: def.minW, minH: def.minH }
    }
    if (cursorX + def.w > GRID_COLS_LG) { cursorX = 0; cursorY += def.h }
    const item: Layout = { i: b.id, x: cursorX, y: cursorY, w: def.w, h: def.h, minW: def.minW, minH: def.minH }
    cursorX += def.w
    return item
  })
}

export function BlockGrid({ blocks, canEdit, slug, config, renderBlock }: BlockGridProps) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPersistedOnMount = useRef(false)

  const lgLayout = useMemo(() => buildLgLayout(blocks), [blocks])
  const layouts: Layouts = useMemo(() => ({ lg: lgLayout }), [lgLayout])

  /** Debounced save: RGL fires onLayoutChange on every step of a drag/resize;
   *  coalesce into a single saveDashboardConfig call. */
  const scheduleSave = (nextLg: Layout[]) => {
    if (!canEdit) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // Scope the layout save to the currently-rendered (optimistic) block set, not
      // the server `config` prop — otherwise a layout change triggered by an
      // optimistic add/delete would re-persist the stale full block list and undo
      // the mutation (e.g. resurrect a just-deleted block).
      const next = applyLayoutChange({ ...config, blocks }, nextLg.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
      startTransition(async () => {
        const res = await saveDashboardConfig(slug, next)
        if (!res.ok) setErrorMsg(res.error)
      })
    }, SAVE_DEBOUNCE_MS)
  }

  /** On mount, if there are any unplaced blocks (no persisted layout), the
   *  packed layout we just computed is divergent from what's stored — write it
   *  back exactly once so subsequent loads are stable. Editors only. */
  useEffect(() => {
    if (!canEdit || hasPersistedOnMount.current) return
    const hasUnplaced = blocks.some((b) => !b.layout)
    if (!hasUnplaced) return
    hasPersistedOnMount.current = true
    scheduleSave(lgLayout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const handleLayoutChange = (_current: Layout[], all: Layouts) => {
    if (!all.lg) return
    scheduleSave(all.lg)
  }

  return (
    <>
      {errorMsg && (
        <p className="mb-3 text-xs text-[#FF6666]" role="alert">
          Save failed: {errorMsg}
        </p>
      )}
      <ResponsiveGrid
        className={pending ? 'opacity-90' : undefined}
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        margin={[20, 20]}
        isDraggable={canEdit}
        isResizable={canEdit}
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        preventCollision={false}
        draggableHandle=".block-drag-handle"
      >
        {blocks.map((b) => (
          <div key={b.id}>
            <div className="h-full">{renderBlock(b) ?? <BlockSkeleton />}</div>
          </div>
        ))}
      </ResponsiveGrid>
    </>
  )
}
