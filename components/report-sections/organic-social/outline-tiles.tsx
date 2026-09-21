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
 *  cards are drawn exactly as the shared tiles draw them. A flagged row (a metric Dash does not
 *  offer) is a blank card with its flag and no change arrow. */
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
          comparisonExpected={expectsComparison(k.key)}
          subValue={k.footnote}
        />
      ))}
    </div>
  )
}

/** The outline's Data block: the same markup as the shared PlatformHeadlines for one platform
 *  (a test holds the two together), drawn with OutlineTiles so a flagged row can show blank. The
 *  shared component, which Renaissance renders, is not changed. */
export function OutlineHeadlines({ headline }: { headline: OutlineHeadline }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{headline.label}</h3>
        {headline.noData ? <NoData /> : <OutlineTiles kpis={headline.kpis} />}
      </section>
    </div>
  )
}
