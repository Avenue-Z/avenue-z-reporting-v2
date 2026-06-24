import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { KpiBlock } from '@/components/dashboard/blocks/kpi-block'
import { UnsupportedBlockState } from '@/components/dashboard/blocks/unsupported-block'
import { MetricBlockSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
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

  // Build one Suspense-wrapped server island per block; the shell renders these in grid order.
  const blockNodes: Record<string, ReactNode> = {}
  for (const block of config.blocks) {
    blockNodes[block.id] = (
      <Suspense fallback={<MetricBlockSkeleton name={block.name} />}>
        <ResolvedBlockIsland
          block={block}
          activeDefault={activeDefault}
          slug={clientSlug}
          canEdit={canEdit}
          config={config}
        />
      </Suspense>
    )
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

async function ResolvedBlockIsland({
  block,
  activeDefault,
  slug,
  canEdit,
  config,
}: {
  block: PersistedBlock
  activeDefault: { dateRange: string; compareRange: string | null }
  slug: string
  canEdit: boolean
  config: DashboardConfig
}) {
  const kind = block.kind ?? 'kpi'
  switch (kind) {
    case 'kpi': {
      const result = await resolveBlock(block, activeDefault, { slug })
      return (
        <KpiBlock
          block={block}
          result={result}
          canEdit={canEdit}
          slug={slug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    // 'bar' | 'line' | 'table' | 'narrative' | 'header' arrive in sub-projects #3–#4.
    default:
      return <UnsupportedBlockState kind={kind} name={block.name} />
  }
}
