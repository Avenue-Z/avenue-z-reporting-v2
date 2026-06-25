'use client'

import type { ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { AddBlockButton } from './add-block/add-block-button'
import { BlockGrid } from './block-grid'
import { EmptyDashboardState } from './metric-block-states'
import { DashboardMutationsProvider, useDashboardMutations } from './dashboard-mutations'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardShellProps {
  config: DashboardConfig
  canEdit: boolean
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  /** Map of block id → rendered server island (the kind-specific renderer). */
  blockNodes: Record<string, ReactNode>
}

export function DashboardShell({ config, canEdit, activeDefault, slug, blockNodes }: DashboardShellProps) {
  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <DashboardMutationsProvider slug={slug} config={config}>
      <DashboardShellInner config={config} canEdit={canEdit} activeDefault={activeDefault} slug={slug} blockNodes={blockNodes} />
    </DashboardMutationsProvider>
  )
}

function DashboardShellInner({ config, canEdit, activeDefault, slug, blockNodes }: DashboardShellProps) {
  const { optimisticBlocks, error } = useDashboardMutations()
  if (optimisticBlocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        {canEdit ? <AddBlockButton slug={slug} config={config} /> : <span />}
        <GlobalTimeControl activeDefault={activeDefault} />
      </div>
      {error && <p className="text-xs text-[#FF6666]" role="alert">Save failed: {error}</p>}
      <BlockGrid
        blocks={optimisticBlocks}
        canEdit={canEdit}
        slug={slug}
        config={config}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
    </div>
  )
}
