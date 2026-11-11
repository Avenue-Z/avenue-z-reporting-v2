import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { organicSocialSubsections } from '@/lib/constants'
import { isInternalStaff } from '@/lib/dashboard/permissions'
import { CHANNEL_LABEL, type DashChannel } from '@/lib/organic-social/metrics'
import { readMonthTab, readSheetTabTitles, readYtdTab, YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { KpiSheetLayoutError, kpiPeriodLabel, kpiSheetFor, MONTH_NAMES, monthIndex, monthTabFor, parseKpiGrid, type KpiPlatform } from '@/lib/organic-social/kpi-sheet'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { resolveDateRange } from '@/lib/date-range'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { ProgressRing } from '@/components/charts/progress-ring'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { Fallback } from './shared'
import { PrintAsClient } from './print-as-client'

/** The slide's labels (S6c): Impressions/Views on Instagram and Facebook, Impressions elsewhere. */
export const impressionsLabel = (channel: DashChannel) => (channel === 'INSTAGRAM' || channel === 'FACEBOOK' ? 'Impressions/Views' : 'Impressions')

/** The year of the served range's last day (a locked month is "custom:<first>,<last>"); a preset range names none. */
const YEAR_OF_END = /,(\d{4})-\d{2}-\d{2}$/

const MONTH_NOTE = 'text-sm text-text-muted'

/** One brand colour per metric, the same on every platform, so a colour always means the same KPI (S6b gives each ring
 *  its own colour). The brand tokens in app/globals.css (--color-brand-green, -cyan, -blue). */
const RING_COLOR = {
  followers: 'var(--color-brand-green)',
  impressions: 'var(--color-brand-cyan)',
  engagements: 'var(--color-brand-blue)',
} as const

/** KPI Check-In (10/6 calls; spec section 5): one row per shown client channel, three rings each, year to date
 *  against the half's target, read from the team's KPI tracker sheet (dash_social_config.kpiSheets). Pinned per client;
 *  nothing here asks Dash, so the lock sweep stores nothing new. Log lines carry the slug and year, never the sheet id.
 *  A sheet row later than the newest month clients may see (the team fills "End of October" before the October report
 *  opens) shows a client a note instead of its rings; staff see the rings and the note.
 *  Two settings (kpiSheetFor): a fixed `{ sheetId, tab }` reads that one tab and the month on screen plays no part, as
 *  before; `{ sheetId, byMonth: true }` reads the tab named for the month on screen ("October 2026"), so each new month
 *  works and past months stay viewable (spec docs/superpowers/specs/2026-11-11-kpi-tab-by-month-design.md). */
export async function KpiCheckInSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, dateRange, role } = ctx
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const dsc = client?.dashSocialConfig as { channels?: string[]; kpiSheets?: unknown } | null | undefined
  let year = YEAR_OF_END.exec(dateRange)?.[1] ?? requestClock().today.slice(0, 4)
  const staff = isInternalStaff(role)
  let sheet = kpiSheetFor(dsc?.kpiSheets, year)
  // Month tabs take the month AND the year from the range's last day; the entry is looked up again for that year (spec 2).
  const endDay = sheet.kind === 'byMonth' ? resolveDateRange(dateRange).endDate : null
  if (endDay !== null && endDay.slice(0, 4) !== year) { year = endDay.slice(0, 4); sheet = kpiSheetFor(dsc?.kpiSheets, year) }
  if (sheet.kind === 'none') {
    // The part is pinned only where a sheet is expected (a fixed entry: every January, until the year's entry is added;
    // a month-tab entry carries into the next year on its own, kpiSheetFor).
    console.warn(`[organic-social] kpi sheet not configured slug=${clientSlug} year=${year}`)
    return staff ? <PrintAsClient live={<p className={MONTH_NOTE}>No KPI sheet configured for {year}.</p>} client={null} /> : null
  }
  if (sheet.kind === 'invalid') { console.warn(`[organic-social] kpi sheet config invalid slug=${clientSlug} year=${year}`); return null }
  const shown = organicSocialSubsections(client ?? {}).flatMap((s) => (s.channel ? [s.channel] : []))
  // The newest month a CLIENT may see, whatever the viewer's role: the client viewer's list holds only opened months.
  const released = lockedRangeFor(client, 'CLIENT_VIEWER', undefined, requestClock())?.months[0]?.key ?? null
  let rows: KpiPlatform[]
  if (sheet.kind === 'fixed') {
    try {
      const tracker = parseKpiGrid(await readYtdTab(sheet.sheetId, sheet.tab), year)
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
  } else {
    const month = Number(endDay!.slice(5, 7)) - 1
    const found = await monthTabRows({ slug: clientSlug, sheetId: sheet.sheetId, carriedFrom: sheet.carriedFrom, year, month, exactMonth: hasReportingMonths(client), shown })
    if (found.kind === 'error') return <Fallback kind="error" />
    if (found.kind === 'note') return staff ? <PrintAsClient live={<p className={MONTH_NOTE}>{found.text}</p>} client={null} /> : null
    rows = found.rows
  }
  // In the PDF export each platform card is one unbreakable block, with the heading in the first (export-layout.ts);
  // a staff export prints the client's view (PrintAsClient).
  const view = (asStaff: boolean) => (
    <section className="space-y-6">
      {rows.map((row, i) => {
        const rowKey = `${year}-${String(monthIndex(row.monthLabel) + 1).padStart(2, '0')}`
        const ahead = released !== null && rowKey > released
        const note = ahead ? <p className={MONTH_NOTE}>KPI Check-In updates with the {row.monthLabel} report.</p> : null
        return (
          <div key={row.channel} data-export-block="" className="space-y-6">
            {i === 0 && <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">KPI Check-In</h2>}
            <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{CHANNEL_LABEL[row.channel]}</h3>
                {(!ahead || asStaff) && <span className="rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted">{kpiPeriodLabel(row.monthLabel, year)}</span>}
              </div>
              {ahead && !asStaff ? <div className="mt-4">{note}</div> : (
                <>
                  {note && <div className="mt-2">{note}</div>}
                  {/* Three across only when the CARD is wide enough for three readable rings (32rem), whatever the window. */}
                  <div className="@container mt-4">
                    <div className="grid grid-cols-1 gap-4 @lg:grid-cols-3">
                      <ProgressRing label="Total Followers" color={RING_COLOR.followers} value={row.actual.followers} target={row.target.followers} />
                      <ProgressRing label={impressionsLabel(row.channel)} color={RING_COLOR.impressions} value={row.actual.impressions} target={row.target.impressions} />
                      <ProgressRing label="Total Engagements" color={RING_COLOR.engagements} value={row.actual.engagements} target={row.target.engagements} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
  return staff ? <PrintAsClient live={view(true)} client={view(false)} /> : view(false)
}

type MonthTabResult = { kind: 'rows'; rows: KpiPlatform[] } | { kind: 'note'; text: string } | { kind: 'error' }
type MonthCheck = MonthTabResult | { kind: 'missing' } | { kind: 'notReady'; missing: string }

/** The rows for month tabs (spec sections 2 to 5). A client on reporting months gets exactly the picked month; any other
 *  client gets the newest READY month tab from the range's last month back to January (my decision, 2026-11-11). A
 *  missing, not-ready or ambiguous tab is a staff note and nothing for a client, never the error card; only a failed read
 *  is the error card. Logs carry the slug, year and month, never the sheet id or a tab title. */
async function monthTabRows(a: { slug: string; sheetId: string; carriedFrom?: string; year: string; month: number; exactMonth: boolean; shown: DashChannel[] }): Promise<MonthTabResult> {
  const fail = (e: unknown): MonthTabResult => {
    console.error(`[organic-social] kpi sheet read failed slug=${a.slug} year=${a.year} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return { kind: 'error' }
  }
  let titles: string[]
  try { titles = await readSheetTabTitles(a.sheetId) } catch (e) { return fail(e) }
  const check = async (m: number): Promise<MonthCheck> => {
    const tab = monthTabFor(titles, a.year, m)
    if (tab.kind === 'none') return { kind: 'missing' }
    if (tab.kind === 'ambiguous') return { kind: 'notReady', missing: 'month tab ambiguous' }
    let grid: unknown[][] | 'gone'
    try { grid = await readMonthTab(a.sheetId, tab.title) } catch (e) { return fail(e) }
    // The titles are cached for minutes; a tab renamed or deleted since then answers 400, which the reader returns as 'gone'.
    if (grid === 'gone') return { kind: 'missing' }
    try {
      const tracker = parseKpiGrid(grid, a.year)
      return {
        kind: 'rows',
        rows: a.shown.map((channel) => {
          const row = tracker.platforms.find((p) => p.channel === channel)
          if (!row) throw new KpiSheetLayoutError(CHANNEL_LABEL[channel])
          if (row.monthLabel !== MONTH_NAMES[m]) throw new KpiSheetLayoutError(`${CHANNEL_LABEL[channel]} month mismatch`)
          return row
        }),
      }
    } catch (e) {
      return { kind: 'notReady', missing: e instanceof KpiSheetLayoutError ? e.missing : 'layout' }
    }
  }
  const at = (m: number) => `slug=${a.slug} year=${a.year} month=${a.year}-${String(m + 1).padStart(2, '0')}`
  const name = (m: number) => `${MONTH_NAMES[m]} ${a.year}`
  const missingNote = (m: number): MonthTabResult => {
    console.warn(`[organic-social] kpi month tab missing ${at(m)}${a.carriedFrom ? ` carried=${a.carriedFrom}` : ''}`)
    return { kind: 'note', text: `No KPI tab for ${name(m)} yet${a.carriedFrom ? ` (using the ${a.carriedFrom} tracker)` : ''}.` }
  }
  if (a.exactMonth) {
    const r = await check(a.month)
    if (r.kind === 'missing') return missingNote(a.month)
    if (r.kind === 'notReady') {
      console.warn(`[organic-social] kpi month tab not ready ${at(a.month)} missing=${r.missing}`)
      return { kind: 'note', text: `The ${name(a.month)} KPI tab isn't ready yet.` }
    }
    return r
  }
  // Newest ready month first. A month skipped because its tab exists but is not ready is logged with its reason, and when
  // nothing is ready the note says what is true of the end month: its tab isn't ready, or it has none (Paul, #445, #446).
  let endNotReady = false
  for (let m = a.month; m >= 0; m--) {
    const r = await check(m)
    if (r.kind === 'rows' || r.kind === 'error') return r
    if (r.kind === 'notReady') {
      console.warn(`[organic-social] kpi month tab not ready ${at(m)} missing=${r.missing}`)
      if (m === a.month) endNotReady = true
    }
  }
  if (endNotReady) return { kind: 'note', text: `The ${name(a.month)} KPI tab isn't ready yet.` }
  return missingNote(a.month)
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
