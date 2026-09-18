import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import { pctCompact } from '@/lib/organic-social/format'
import { expectsComparison } from '@/lib/organic-social/metrics'
import type { HeadlineKpi } from '@/lib/organic-social/types'
import { gridColsBase, gridColsMd } from './platform-headlines'

/** Tiles in a grid with no heading, for the metrics directly under the engagement graph. The
 *  cards are drawn exactly as the Data block draws them. */
export function OutlineTiles({ kpis }: { kpis: HeadlineKpi[] }) {
  const n = kpis.length
  return (
    <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
      {kpis.map((k) => (
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
