import type { WeeklyContacts } from '@/lib/salesforce/types'
import { KpiCard } from './kpi-card'
import { NoData } from './no-data'
import { fmtNum } from './reshape'

const NULL_GLYPH = '—'

/** '2026-W33' to 'W33'. */
function weekLabel(week: string): string {
  return `W${week.split('-W')[1] ?? ''}`
}

export function ContactPacing({ data }: { data: WeeklyContacts }) {
  const {
    weeks, currentWeek, currentWeekPartial, daysElapsedInCurrentWeek,
    previousWeek, priorYearWeek, completedWeekOverWeek,
  } = data

  // gapFill returns [] only when the query produced no usable bucket at all
  // (contacts.ts:99). In that state currentWeek and previousWeek are both 0 and
  // both comparisons are undefined, so replacing only the CHART would leave
  // three tiles reading 0, 0 and a dash stacked above "No data for this
  // period.": a confident zero with the disclaimer printed under it rather
  // than on it. Replace the whole block.
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
        <div className="flex h-32 items-end gap-1">
          {weeks.map((b, i) => {
            const isPartial = i === weeks.length - 1
            return (
              <div key={b.week} className="flex flex-1 flex-col items-center gap-1">
                <span
                  data-week={b.week}
                  data-partial={isPartial ? 'true' : undefined}
                  className={
                    isPartial
                      ? 'w-full rounded-t border-t-2 border-dashed border-white/40 bg-white/20'
                      : 'w-full rounded-t bg-white/60'
                  }
                  // max === 0 is every bucket at zero. Short-circuit rather than
                  // dividing, which would emit height: NaN%.
                  style={{ height: max === 0 ? '0%' : `${(b.contacts / max) * 100}%` }}
                />
                <span className="text-[10px] text-text-muted">{weekLabel(b.week)}</span>
              </div>
            )
          })}
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
