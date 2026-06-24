import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock, resolveGroupedBlock, resolveSeriesBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { MetricBlockShell } from '@/components/dashboard/metric-block'
import { BlockValue } from '@/components/dashboard/block-value'
import { BlockDelta } from '@/components/dashboard/block-delta'
import { ValueSkeleton, DeltaSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import { UnsupportedBlockState } from '@/components/dashboard/blocks/unsupported-block'
import { BarBlock } from '@/components/dashboard/blocks/bar-block'
import { LineBlock } from '@/components/dashboard/blocks/line-block'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

export default async function ConfigurableDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>
  searchParams: Promise<{ dateRange?: string; compareRange?: string }>
}) {
  const { clientSlug } = await params
  const { dateRange: dateRangeParam, compareRange: compareRangeParam } = await searchParams

  const [session, client, config] = await Promise.all([
    auth(),
    getClientBySlug(clientSlug),
    getDashboardConfig(clientSlug),
  ])
  if (!client) notFound()

  const canEdit = canEditDashboard(
    session?.user?.role ?? '',
    session?.user?.clientSlug ?? null,
    clientSlug,
  )

  // No persisted config yet → empty-dashboard state, no control bar.
  if (!config) {
    return (
      <>
        <Header title="Dashboard" subtitle={client.name} />
        <div className="divider-full mb-8" />
        <EmptyDashboardState canEdit={canEdit} slug={clientSlug} />
      </>
    )
  }

  const activeDefault = {
    dateRange: dateRangeParam ?? config.defaultRange.dateRange,
    // Empty string means "no comparison" (user toggled it off this session).
    // Missing key → persisted default, and comparison defaults ON (previous
    // period) when none is persisted — mirrors the paid-search section.
    compareRange:
      compareRangeParam === undefined
        ? config.defaultRange.compareRange ?? 'previous_period'
        : compareRangeParam === ''
          ? null
          : compareRangeParam,
  }

  const blockNodes: Record<string, ReactNode> = {}
  for (const block of config.blocks) {
    blockNodes[block.id] = renderBlockNode(block, activeDefault, clientSlug, canEdit, config)
  }

  return (
    <>
      <Header title="Dashboard" subtitle={client.name} />
      <div className="divider-full mb-8" />
      <DashboardShell
        config={config}
        canEdit={canEdit}
        activeDefault={activeDefault}
        slug={clientSlug}
        blockNodes={blockNodes}
      />
    </>
  )
}

/** Per-block kind dispatcher. 'kpi' → progressive-streaming KPI tile via
 *  MetricBlockShell + BlockValue + BlockDelta. 'bar'/'line' → BarBlock/LineBlock,
 *  fed by resolveGroupedBlock/resolveSeriesBlock from sub-project #2. */
function renderBlockNode(
  block: PersistedBlock,
  activeDefault: { dateRange: string; compareRange: string | null },
  clientSlug: string,
  canEdit: boolean,
  config: DashboardConfig,
): ReactNode {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const eff = block.range ?? activeDefault
      const ctx = { slug: clientSlug }
      const blockNoRange = { ...block, range: null }
      const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx)
      const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
      const prevPromise = compareIso
        ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx)
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
              <BlockValue valuePromise={valuePromise} slug={clientSlug} target={block.target} ceiling={block.ceiling} />
            </Suspense>
          }
          delta={
            <Suspense fallback={<DeltaSkeleton />}>
              <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
            </Suspense>
          }
          sub={block.subLabel}
        />
      )
    }
    case 'bar': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <BarBlock
          block={block}
          groupedPromise={groupedPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'line': {
      const eff = block.range ?? activeDefault
      const seriesPromise = resolveSeriesBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <LineBlock
          block={block}
          seriesPromise={seriesPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
