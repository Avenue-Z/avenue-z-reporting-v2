import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { organicSocialSubsections } from '@/lib/constants'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { CHANNEL_LABEL, type DashChannel } from '@/lib/organic-social/metrics'
import { readYtdTab, ytdSheetFor, YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { KpiSheetLayoutError, kpiPeriodLabel, monthIndex, parseKpiGrid, type KpiPlatform } from '@/lib/organic-social/kpi-sheet'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { ProgressRing } from '@/components/charts/progress-ring'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { Fallback } from './shared'

/** The slide's labels (S6c): Impressions/Views on Instagram and Facebook, Impressions elsewhere. */
export const impressionsLabel = (channel: DashChannel) => (channel === 'INSTAGRAM' || channel === 'FACEBOOK' ? 'Impressions/Views' : 'Impressions')

/** The year of the served range's last day (a locked month is "custom:<first>,<last>"); a preset range names none. */
const YEAR_OF_END = /,(\d{4})-\d{2}-\d{2}$/

const MONTH_NOTE = 'text-sm text-text-muted'

/** KPI Check-In (10/6 calls; spec section 5): one row per shown client channel, three rings each, year to date
 *  against the half's target, read from the team's KPI tracker sheet (dash_social_config.kpiSheets). Pinned per client;
 *  nothing here asks Dash, so the lock sweep stores nothing new. Log lines carry the slug and year, never the sheet id.
 *  A sheet row later than the newest month clients may see (the team fills "End of October" before the October report
 *  opens) shows a client a note instead of its rings; staff see the rings and the note. The month on screen plays no
 *  part: a released row shows its rings whatever month is picked. */
export async function KpiCheckInSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, dateRange, role } = ctx
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const dsc = client?.dashSocialConfig as { channels?: string[]; kpiSheets?: unknown } | null | undefined
  const year = YEAR_OF_END.exec(dateRange)?.[1] ?? requestClock().today.slice(0, 4)
  const staff = isInternalStaff(role)
  const sheet = ytdSheetFor(dsc?.kpiSheets, year)
  if (sheet.kind === 'none') {
    // The part is pinned only where a sheet is expected (every January, until the year's entry is added).
    console.warn(`[organic-social] kpi sheet not configured slug=${clientSlug} year=${year}`)
    return staff ? <p className={MONTH_NOTE}>No KPI sheet configured for {year}.</p> : null
  }
  if (sheet.kind === 'invalid') { console.warn(`[organic-social] kpi sheet config invalid slug=${clientSlug} year=${year}`); return null }
  const shown = organicSocialSubsections(client ?? {}).flatMap((s) => (s.channel ? [s.channel] : []))
  // The newest month a CLIENT may see, whatever the viewer's role: the client viewer's list holds only opened months.
  const released = lockedRangeFor(client, 'CLIENT_VIEWER', undefined, requestClock())?.months[0]?.key ?? null
  let rows: KpiPlatform[]
  try {
    const tracker = parseKpiGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab), year)
    rows = shown.map((channel) => {
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
      {rows.map((row) => {
        const rowKey = `${year}-${String(monthIndex(row.monthLabel) + 1).padStart(2, '0')}`
        const ahead = released !== null && rowKey > released
        const note = ahead ? <p className={MONTH_NOTE}>KPI Check-In updates with the {row.monthLabel} report.</p> : null
        return (
          <div key={row.channel} className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{CHANNEL_LABEL[row.channel]}</h3>
              {(!ahead || staff) && <span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted">{kpiPeriodLabel(row.monthLabel, year)}</span>}
            </div>
            {ahead && !staff ? <div className="mt-4">{note}</div> : (
              <>
                {note && <div className="mt-2">{note}</div>}
                {/* Three across only when the CARD is wide enough for three readable rings (32rem), whatever the window. */}
                <div className="@container mt-4">
                  <div className="grid grid-cols-1 gap-4 @lg:grid-cols-3">
                    <ProgressRing label="Total Followers" value={row.actual.followers} target={row.target.followers} />
                    <ProgressRing label={impressionsLabel(row.channel)} value={row.actual.impressions} target={row.target.impressions} />
                    <ProgressRing label="Total Engagements" value={row.actual.engagements} target={row.target.engagements} />
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })}
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
