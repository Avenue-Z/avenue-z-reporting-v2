import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { TableBlockBody } from './table-block-body'
import type { DashboardConfig, GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

/** Streams a GroupedResult into <DataTable>. Same call-shape as BarBlock —
 *  the page dispatcher builds the promise via resolveGroupedBlock. */
export function TableBlock({
  block, groupedPromise, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="table" />}>
        <TableBlockBody block={block} groupedPromise={groupedPromise} slug={slug} />
      </Suspense>
    </BlockChrome>
  )
}
