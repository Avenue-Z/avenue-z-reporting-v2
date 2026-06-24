'use client'

import { BlockChrome, DetachBadge, detachBadgeLabel } from './block-chrome'
import { KpiBlockBody } from './blocks/kpi-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
import type { ReactNode } from 'react'

export interface MetricBlockShellProps {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
  value: ReactNode
  delta: ReactNode
  /** Optional sub-label slot (rendered below the delta — e.g. KPI subLabel "13-wk avg kr251"). */
  sub?: ReactNode
}

/** KPI variant: wraps a KpiBlockBody in shared BlockChrome. Public signature
 *  unchanged from prior versions — this file is now a thin composition wrapper. */
export function MetricBlockShell({ block, canEdit, slug, config, activeDefault, value, delta, sub }: MetricBlockShellProps) {
  const label = detachBadgeLabel(block)
  // Visual indicator only — the kebab menu is the actionable way to reset.
  const badge = label !== null ? <DetachBadge label={label} canEdit={false} onReset={() => {}} /> : null

  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <KpiBlockBody name={block.name} value={value} delta={delta} sub={sub} badge={badge} />
    </BlockChrome>
  )
}
