import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getClientBySlug, getDashboardConfig } from '@/lib/db/queries'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { Header } from '@/components/layout/header'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { MetricBlockShell } from '@/components/dashboard/metric-block'
import { BlockValue } from '@/components/dashboard/block-value'
import { BlockDelta } from '@/components/dashboard/block-delta'
import { ValueSkeleton, DeltaSkeleton, EmptyDashboardState } from '@/components/dashboard/metric-block-states'
import type { DashboardConfig } from '@/lib/dashboard/types'

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
  const blocksById = new Map(config.blocks.map((b) => [b.id, b]))
  for (const block of config.blocks) {
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

    blockNodes[block.id] = (
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

