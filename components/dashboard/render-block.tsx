import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { resolveBlock, resolveGroupedBlock, resolveSeriesBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { MetricBlockShell } from './metric-block'
import { BlockValue } from './block-value'
import { BlockDelta } from './block-delta'
import { ValueSkeleton, DeltaSkeleton } from './metric-block-states'
import { UnsupportedBlockState } from './blocks/unsupported-block'
import { BarBlock } from './blocks/bar-block'
import { LineBlock } from './blocks/line-block'
import { HeaderBlock } from './blocks/header-block'
import { NarrativeBlock } from './blocks/narrative-block'
import { TableBlock } from './blocks/table-block'
import type { BlockConfig, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Per-block kind dispatcher, shared by the authed configurable-dashboard page and the
 *  public /share view. 'kpi' → progressive-streaming tile (MetricBlockShell + BlockValue
 *  + BlockDelta); 'bar'/'line'/'table' → their blocks fed by resolveGrouped/SeriesBlock.
 *  Pass canEdit=false for a read-only render (the block chrome hides all edit controls). */
export function renderBlockNode(
  block: PersistedBlock,
  activeDefault: { dateRange: string; compareRange: string | null },
  clientSlug: string,
  canEdit: boolean,
  config: DashboardConfig,
  blocksById: Map<string, BlockConfig>,
): ReactNode {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const eff = block.range ?? activeDefault
      const ctx = { slug: clientSlug }
      const blockNoRange = { ...block, range: null }
      const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx, { blocksById })
      const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
      const prevPromise = compareIso
        ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx, { blocksById })
        : null
      return (
        <MetricBlockShell
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
          value={
            <Suspense fallback={<ValueSkeleton />}>
              <BlockValue valuePromise={valuePromise} slug={clientSlug} />
            </Suspense>
          }
          delta={
            <Suspense fallback={<DeltaSkeleton />}>
              <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
            </Suspense>
          }
        />
      )
    }
    case 'bar': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(block, { dateRange: eff.dateRange, compareRange: eff.compareRange }, { slug: clientSlug })
      return <BarBlock block={block} groupedPromise={groupedPromise} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault} />
    }
    case 'line': {
      const eff = block.range ?? activeDefault
      const seriesPromise = resolveSeriesBlock(block, { dateRange: eff.dateRange, compareRange: eff.compareRange }, { slug: clientSlug })
      return <LineBlock block={block} seriesPromise={seriesPromise} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault} />
    }
    case 'table': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(block, { dateRange: eff.dateRange, compareRange: eff.compareRange }, { slug: clientSlug })
      return <TableBlock block={block} groupedPromise={groupedPromise} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault} />
    }
    case 'header':
      return <HeaderBlock block={block} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault} />
    case 'narrative':
      return <NarrativeBlock block={block} canEdit={canEdit} slug={clientSlug} config={config} activeDefault={activeDefault} />
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
