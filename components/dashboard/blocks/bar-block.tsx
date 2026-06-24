import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { BarBlockBody } from './bar-block-body'
import type { DashboardConfig, GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

export interface BarBlockProps {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

/** Renders a Bar block: shared chrome + Suspense-streamed chart body. */
export function BarBlock({ block, groupedPromise, canEdit, slug, config, activeDefault }: BarBlockProps) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="bar" />}>
        <BarBlockBody
          name={block.name}
          groupedPromise={groupedPromise}
          target={block.target}
          ceiling={block.ceiling}
          slug={slug}
        />
      </Suspense>
    </BlockChrome>
  )
}
