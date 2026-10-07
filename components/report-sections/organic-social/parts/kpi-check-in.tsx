import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { CHANNEL_LABEL, resolveChannels, type DashChannel } from '@/lib/organic-social/metrics'
import { readYtdTab, ytdSheetFor, YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { KpiSheetLayoutError, kpiPeriodLabel, parseKpiGrid, type KpiPlatform } from '@/lib/organic-social/kpi-sheet'
import { requestClock } from '@/lib/organic-social/locked-range'
import { ProgressRing } from '@/components/charts/progress-ring'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { Fallback } from './shared'

/** The slide's labels (S6c): Impressions/Views on Instagram and Facebook, Impressions elsewhere. */
export const impressionsLabel = (channel: DashChannel) => (channel === 'INSTAGRAM' || channel === 'FACEBOOK' ? 'Impressions/Views' : 'Impressions')

const YEAR = /^custom:(\d{4})-/

/** KPI Check-In (10/6 calls; spec section 5): one row per client channel, three rings each, year to date against
 *  the H2 target, read from the team's KPI tracker sheet (dash_social_config.kpiSheets). Pinned per client; nothing
 *  here asks Dash, so the lock sweep stores nothing new. Log lines carry the slug and year, never the sheet id. */
export async function KpiCheckInSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, dateRange } = ctx
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const dsc = client?.dashSocialConfig as { channels?: string[]; kpiSheets?: unknown } | null | undefined
  const year = YEAR.exec(dateRange)?.[1] ?? requestClock().today.slice(0, 4)
  const sheet = ytdSheetFor(dsc?.kpiSheets, year)
  if (sheet.kind === 'none') return null
  if (sheet.kind === 'invalid') { console.warn(`[organic-social] kpi sheet config invalid slug=${clientSlug} year=${year}`); return null }
  let rows: KpiPlatform[]
  try {
    const tracker = parseKpiGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
    rows = resolveChannels(dsc?.channels).map((channel) => {
      const row = tracker.platforms.find((p) => p.channel === channel)
      if (!row) throw new KpiSheetLayoutError(CHANNEL_LABEL[channel])
      return row
    })
  } catch (e) {
    if (e instanceof KpiSheetLayoutError) console.error(`[organic-social] kpi sheet layout not found slug=${clientSlug} year=${year} missing=${e.missing}`)
    else console.error(`[organic-social] kpi sheet read failed slug=${clientSlug} year=${year} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return <Fallback kind="error" />
  }
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">KPI Check-In</h2>
      {rows.map((row) => (
        <div key={row.channel} className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{CHANNEL_LABEL[row.channel]}</h3>
            <span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted">{kpiPeriodLabel(row.monthLabel, year)}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <ProgressRing label="Total Followers" value={row.actual.followers} target={row.target.followers} />
            <ProgressRing label={impressionsLabel(row.channel)} value={row.actual.impressions} target={row.target.impressions} />
            <ProgressRing label="Total Engagements" value={row.actual.engagements} target={row.target.engagements} />
          </div>
        </div>
      ))}
    </section>
  )
}

export const kpiCheckInV1: PartImpl<OrganicSocialCtx> = {
  id: 'kpi-check-in',
  version: 1,
  published: false,
  defaultLabel: 'KPI Check-In',
  render: (ctx) => ctx.channel !== null || ctx.view === 'influencer' ? null : (
    <Suspense fallback={<HeadlinesSkeleton />}>
      <KpiCheckInSection ctx={ctx} />
    </Suspense>
  ),
}
