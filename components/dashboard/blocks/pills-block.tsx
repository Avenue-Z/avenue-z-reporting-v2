import { Suspense } from 'react'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { BlockValue } from '../block-value'
import { BlockDelta } from '../block-delta'
import { ValueSkeleton, DeltaSkeleton } from '../metric-block-states'
import { BlockChrome, DetachBadge, detachBadgeLabel } from '../block-chrome'
import { PillsBlockBody } from './pills-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Compact KPI block. Streams value + delta progressively via Suspense, same
 *  pattern as MetricBlockShell — just a tighter body. */
export function PillsBlock({
  block, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  const eff = block.range ?? activeDefault
  const ctx = { slug }
  const blockNoRange = { ...block, range: null }
  const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx)
  const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
  const prevPromise = compareIso
    ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx)
    : null

  const label = detachBadgeLabel(block)
  const badge = label !== null ? <DetachBadge label={label} canEdit={false} onReset={() => {}} /> : null

  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <PillsBlockBody
        name={block.name}
        value={
          <Suspense fallback={<ValueSkeleton />}>
            <BlockValue valuePromise={valuePromise} slug={slug} />
          </Suspense>
        }
        delta={
          <Suspense fallback={<DeltaSkeleton />}>
            <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
          </Suspense>
        }
        badge={badge}
      />
    </BlockChrome>
  )
}
