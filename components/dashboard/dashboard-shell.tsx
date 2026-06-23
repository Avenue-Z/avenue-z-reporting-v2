'use client'

import type { ReactNode } from 'react'
import { GlobalTimeControl } from './global-time-control'
import { AddBlockButton } from './add-block/add-block-button'
import { BlockGrid } from './block-grid'
import { EmptyDashboardState } from './metric-block-states'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export interface DashboardShellProps {
  config: DashboardConfig
  canEdit: boolean
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  /** Map of block id → rendered server island (the Suspense-wrapped <MetricBlock>). */
  blockNodes: Record<string, ReactNode>
}

export function DashboardShell({
  config,
  canEdit,
  activeDefault,
  slug,
  blockNodes,
}: DashboardShellProps) {
  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        {canEdit ? <AddBlockButton slug={slug} config={config} /> : <span />}
        <GlobalTimeControl activeDefault={activeDefault} />
      </div>
      <BlockGrid
        blocks={config.blocks}
        canEdit={canEdit}
        slug={slug}
        config={config}
        renderBlock={(b: PersistedBlock) => blockNodes[b.id]}
      />
    </div>
  )
}
