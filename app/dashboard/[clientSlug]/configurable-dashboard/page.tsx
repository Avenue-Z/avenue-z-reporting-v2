import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import { renderBlockNode } from '@/components/dashboard/render-block'
import type { BlockConfig } from '@/lib/dashboard/types'

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

