import type { WeeklyContacts } from '@/lib/salesforce/types'
import { CHART_COLORS } from '@/lib/constants'
import { isoWeekStart } from '@/lib/salesforce/iso-week'
import { KpiCard } from './kpi-card'
import { NoData } from './no-data'
import { fmtNum } from './reshape'

const NULL_GLYPH = '—'

/** Plural agreement matters here: these strings are the only place a single
 *  contact is ever named, and "1 contacts" in a client-facing tooltip is the
 *  kind of detail that undermines the numbers beside it. */
function countLabel(n: number): string {
  return `${fmtNum(n)} ${n === 1 ? 'contact' : 'contacts'}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Aug 3' for the Monday that opens a week. Fixed abbreviations rather than
 *  Intl.DateTimeFormat: this renders on the server, and a locale-dependent month
 *  name would make the axis differ between environments and its assertions
 *  differ between machines. UTC throughout, matching the transform's week keys. */
function dateLabel(monday: Date): string {
  return `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}`
}

export function ContactPacing({ data }: { data: WeeklyContacts }) {
  const {
    weeks, currentWeek, currentWeekPartial, daysElapsedInCurrentWeek,
    previousWeek, priorYearWeek, completedWeekOverWeek, campaignUnmatched,
  } = data

  // gapFill returns [] only when the query produced no usable bucket at all
  // (contacts.ts:99). In that state currentWeek and previousWeek are both 0 and
  // both comparisons are undefined, so replacing only the CHART would leave
  // three tiles reading 0, 0 and a dash stacked above "No data for this
  // period.": a confident zero with the disclaimer printed under it rather
  // than on it. Replace the whole block.
  // Ordered ahead of the empty check because it describes the SAME empty state
  // more truthfully. When the filter matches nothing the series is empty too, so
  // both branches are live at once and the generic message would win by accident
  // — asserting the period was empty when the query in fact returned plenty of
  // rows, none of them on the configured campaigns. Pipeline Performance names
  // the likely cause directly below; this block must not contradict it.
  if (campaignUnmatched) {
    return <NoData message="No leads matched the agency-sourced campaigns. The campaigns may have been renamed." />
  }

  if (weeks.length === 0) return <NoData />

  // weeks is a contiguous run of ISO weeks through the current one, and the
  // window cannot emit a bucket after today, so the last element is always the
  // week in progress and every earlier element is a completed week. Fewer than
  // two elements therefore means no completed week exists, and previousWeek's
  // 0 is the `?? 0` at contacts.ts:153 rather than a count.
  //
  // currentWeekPartial cannot serve as this discriminant: the shipped
  // transform sets it to true unconditionally (contacts.ts:173).
  const hasCompletedWeek = weeks.length >= 2

  const max = Math.max(...weeks.map((w) => w.contacts))

  // Week numbers are how the data is keyed, not how a reader reads a year. The
  // axis is labelled by date and thinned to one anchor per month: 35 labels on
  // 35 cells is a smear, and the intermediate weeks are legible by position
  // once the month starts are marked.
  const starts = weeks.map((b) => isoWeekStart(b.week))
  const opensMonth = starts.map((d, i) => i > 0 && d.getUTCMonth() !== starts[i - 1].getUTCMonth())
  // The first bucket is anchored too, since a year whose data opens mid-month
  // would otherwise carry no label until the next month change. It yields when
  // the SECOND bucket opens a month, which happens whenever ISO week 1 starts in
  // December: labelling both would print two dates on adjacent cells at the
  // narrowest point of the chart.
  const labelled = starts.map((d, i) => (i === 0 ? !(starts.length > 1 && opensMonth[1]) : opensMonth[i]))

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">Year to date, by ISO week.</p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <KpiCard
          title="Current Week"
          value={fmtNum(currentWeek)}
          // No delta by design: comparing a partial week against a complete one
          // renders as an ~85 percent collapse on a Monday. completedWeekOverWeek
          // lives on Previous Week, where both sides are full weeks.
          subValue={currentWeekPartial ? `Partial week: ${daysElapsedInCurrentWeek} of 7 days.` : undefined}
        />
        <KpiCard
          title="Previous Week"
          value={hasCompletedWeek ? fmtNum(previousWeek) : NULL_GLYPH}
          delta={hasCompletedWeek ? completedWeekOverWeek : undefined}
          deltaLabel="vs prior complete week"
          // Both come off when the value is dashed: with no completed week there
          // is no comparison to promise, so this is the whole-tile-unavailable
          // case, not the placeholder case.
          comparisonExpected={hasCompletedWeek}
          subValue={hasCompletedWeek ? undefined : 'No completed week yet this year.'}
        />
        <KpiCard
          title="Prior Year Week"
          // Always rendered, never dropped. Absent covers three cases that look
          // identical here (failed compare fetch, no bucket for the matching ISO
          // week number, no completed week to match against), and removing the
          // tile hides which, while also changing the block's shape so a reader
          // cannot tell a missing comparison from one never offered.
          value={priorYearWeek != null ? fmtNum(priorYearWeek) : NULL_GLYPH}
        />
      </div>

      <div className="space-y-2">
        {/* Bars and labels are two sibling tracks, not one column per week, and
            that split is load-bearing rather than cosmetic. Each bar's height is
            a PERCENTAGE, which resolves against its containing block's height, so
            that block has to be this fixed-height row. While each bar sat inside
            a per-week column instead, the column's own height was content-based
            (this row is `items-end`, which suppresses the default
            `align-items: stretch`), the percentage resolved to `auto`, and every
            bar rendered at zero height with only the labels still drawing. Both
            tracks carry the same flex-1 cells and the same gap, so the labels
            stay aligned under their bars. */}
        <div className="space-y-1">
          <div className="flex h-32 items-end gap-1">
            {weeks.map((b, i) => {
              const isPartial = i === weeks.length - 1
              return (
                // h-full is load-bearing, not decoration. This wrapper exists to
                // anchor the hover tooltip, and it sits between the bar and the
                // fixed-height row, so without a definite height of its own the
                // bar's percentage would resolve against `auto` and collapse to
                // zero: exactly the bug the sibling label track was introduced
                // to fix. justify-end then sits the bar on the row's baseline.
                <div key={b.week} className="group relative flex h-full flex-1 flex-col justify-end">
                  <span
                    data-week={b.week}
                    data-partial={isPartial ? 'true' : undefined}
                    className={isPartial ? 'w-full rounded-t border-t-2 border-dashed' : 'w-full rounded-t'}
                    style={{
                      // max === 0 is every bucket at zero. Short-circuit rather
                      // than dividing, which would emit height: NaN%.
                      height: max === 0 ? '0%' : `${(b.contacts / max) * 100}%`,
                      // The journey card heading this block is CHART_COLORS.positive.
                      // The in-progress week keeps that hue at low alpha with the
                      // dashed cap, so it reads as the same series still filling
                      // rather than as a different one.
                      backgroundColor: isPartial ? `${CHART_COLORS.positive}33` : CHART_COLORS.positive,
                      borderTopColor: isPartial ? CHART_COLORS.positive : undefined,
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                    {isPartial
                      ? `Week of ${dateLabel(starts[i])} \u00b7 ${countLabel(b.contacts)} so far, ${daysElapsedInCurrentWeek} of 7 days`
                      : `Week of ${dateLabel(starts[i])} \u00b7 ${countLabel(b.contacts)}`}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-1">
            {weeks.map((b, i) => (
              // Every bucket keeps a cell, labelled or not, so the label track
              // and the bar track stay in step: dropping the blanks would let
              // the remaining labels slide out from under their bars.
              <span
                key={b.week}
                data-week-label={b.week}
                className="flex-1 text-center text-[10px] text-text-muted"
              >
                {labelled[i] ? dateLabel(starts[i]) : ''}
              </span>
            ))}
          </div>
        </div>
        {/* The final bar covers only the days elapsed so far. Drawn at full
            scale with nothing distinguishing it, it reads on a Monday as a
            collapse: the same misreading the Current Week tile refuses to
            publish as a number. Dropping the bar is not the answer either,
            since Current Week is this block's headline. */}
        <p className="text-xs text-text-muted">
          Final bar is the current week in progress: {daysElapsedInCurrentWeek} of 7 days.
        </p>
      </div>
    </div>
  )
}
