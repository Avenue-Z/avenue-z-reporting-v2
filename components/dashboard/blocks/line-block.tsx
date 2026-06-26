import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { LineBlockBody } from './line-block-body'
import type { DashboardConfig, PersistedBlock, SeriesResult } from '@/lib/dashboard/types'

export interface LineBlockProps {
  block: PersistedBlock
  seriesPromise: Promise<SeriesResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}

/** Renders a Line block: shared chrome + Suspense-streamed chart body. */
export function LineBlock({ block, seriesPromise, canEdit, slug, config, activeDefault }: LineBlockProps) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="line" />}>
        <LineBlockBody
          name={block.name}
          seriesPromise={seriesPromise}
          slug={slug}
        />
      </Suspense>
    </BlockChrome>
  )
}
