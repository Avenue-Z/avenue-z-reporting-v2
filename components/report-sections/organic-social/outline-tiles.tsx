import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import { pctCompact } from '@/lib/organic-social/format'
import { expectsComparison } from '@/lib/organic-social/metrics'
import type { OutlineHeadline, OutlineKpi } from '@/lib/organic-social/outline-headlines'
import { NoData } from './no-data'
import { gridColsBase, gridColsMd } from './platform-headlines'

/** A blank value that keeps the card's height (the value line would collapse if empty). */
const BLANK = '\u00A0'

/** Tiles in a grid with no heading, for the metrics directly under the engagement graph. The
 *  cards are drawn as the shared tiles draw them, except that a change shows as a whole number
 *  (Jasmine, 2026-09-29). A flagged row (a metric Dash does not offer) is a blank card with its
 *  flag and no change arrow. */
export function OutlineTiles({ kpis }: { kpis: OutlineKpi[] }) {
  const n = kpis.length
  return (
    <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
      {kpis.map((k) => k.value === null ? (
        <KpiCard key={k.key} title={k.label} value={BLANK} subValue={k.unavailable} />
      ) : (
        <KpiCard
          key={k.key}
          title={k.label}
          value={k.format === 'percent' ? pctCompact(k.value) : num(k.value)}
          delta={k.delta}
          wholeDelta
          comparisonExpected={expectsComparison(k.key)}
          subValue={k.footnote}
        />
      ))}
    </div>
  )
}

/** The outline's Data block: the same markup as the shared PlatformHeadlines for one platform when
 *  no tile has a prior (a test holds the two together; with a prior, the change here is a whole number) under the outline's heading "Data", not the platform name, drawn
 *  with OutlineTiles so a flagged row can show blank. The shared component is not changed. One more difference: the
 *  outline tiles carry no footnote (2026-10-02), and since that walkthrough no shared tile carries one either. */
export function OutlineHeadlines({ headline }: { headline: OutlineHeadline }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Data</h3>
        {headline.noData ? <NoData /> : <OutlineTiles kpis={headline.kpis} />}
      </section>
    </div>
  )
}
