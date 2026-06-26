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
import { HeaderBlock } from '@/components/dashboard/blocks/header-block'
import { NarrativeBlock } from '@/components/dashboard/blocks/narrative-block'
import { PillsBlock } from '@/components/dashboard/blocks/pills-block'
import { TableBlock } from '@/components/dashboard/blocks/table-block'
import type { BlockConfig, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

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

  // Lookup of every block by id — formula bindings resolve their live @ref
  // operands against this map (see resolveBlock's `deps.blocksById`). Built once
  // per request and threaded into the kpi resolve path below.
  const blocksById = new Map<string, BlockConfig>(config.blocks.map((b) => [b.id, b]))

  const blockNodes: Record<string, ReactNode> = {}
  for (const block of config.blocks) {
    blockNodes[block.id] = renderBlockNode(block, activeDefault, clientSlug, canEdit, config, blocksById)
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
 *  fed by resolveGroupedBlock/resolveSeriesBlock. The kpi path threads
 *  `blocksById` into resolveBlock so formula @ref operands resolve to live blocks. */
function renderBlockNode(
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
      const eff = block.range ?? activeDefault // effective range (per-block override or global)
      const ctx = { slug: clientSlug }
      // resolveBlock prefers config.range over the passed global, so null the clone's
      // range and pass the effective range as global. compareRange:null ⇒ value only.
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
    case 'pills': {
      return (
        <PillsBlock
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'table': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <TableBlock
          block={block}
          groupedPromise={groupedPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'header': {
      return (
        <HeaderBlock
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'narrative': {
      return (
        <NarrativeBlock
          block={block}
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
