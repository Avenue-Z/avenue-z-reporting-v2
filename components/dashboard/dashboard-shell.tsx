'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { AddBlockButton } from './add-block/add-block-button'
import { BlockGrid } from './block-grid'
import { BlockActionsContext } from './block-actions'
import { EmptyDashboardState } from './metric-block-states'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardShellProps {
  config: DashboardConfig
  canEdit: boolean
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  /** Map of block id → rendered server island (the <MetricBlockShell>). */
  blockNodes: Record<string, ReactNode>
}

export function DashboardShell({
  config,
  canEdit,
  activeDefault,
  slug,
  blockNodes,
}: DashboardShellProps) {
  const [optimistic, setOptimistic] = useState<{ id: string; name: string }[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const serverIdsKey = config.blocks.map((b) => b.id).join(',')
  useEffect(() => {
    const ids = new Set(config.blocks.map((b) => b.id))
    setOptimistic((prev) => prev.filter((o) => !ids.has(o.id))) // drop added-then-confirmed
    setHidden((prev) => prev.filter((id) => ids.has(id))) // drop deleted-then-confirmed
  }, [serverIdsKey])
  const pendingOptimistic = optimistic.filter((o) => !config.blocks.some((b) => b.id === o.id))
  const visibleBlocks = config.blocks.filter((b) => !hidden.includes(b.id))
  const actions = {
    hide: (id: string) => setHidden((p) => (p.includes(id) ? p : [...p, id])),
    unhide: (id: string) => setHidden((p) => p.filter((x) => x !== id)),
  }

  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <BlockActionsContext.Provider value={actions}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          {canEdit ? <AddBlockButton slug={slug} config={config} onAdded={(b) => setOptimistic((prev) => [...prev, b])} /> : <span />}
          <GlobalTimeControl activeDefault={activeDefault} />
        </div>
        <BlockGrid
          blocks={visibleBlocks}
          canEdit={canEdit}
          slug={slug}
          config={config}
          optimisticBlocks={pendingOptimistic}
          renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
        />
      </div>
    </BlockActionsContext.Provider>
  )
}
