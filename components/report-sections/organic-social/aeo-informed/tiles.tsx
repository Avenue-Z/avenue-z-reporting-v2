// The four tiles before the tables (the outline's "BEFORE THE TABLES"; spec section 3 item 3, section 5 "Totals"), over the client's own
// channels, the same rows as the own table. Drawn with the Organic Social tiles' KpiCard. The change is the outline tiles' rule (outlineDelta,
// lib/organic-social/outline-delta.ts: percent change against the size of the previous value, none when it is 0), against the previous
// window of the same length, and is shown in Month only (previousDays); YTD and All time have none.
import { KpiCard } from '@/components/charts/kpi-card'
import { outlineDelta } from '@/lib/organic-social/outline-delta'
import { pctCompact } from '@/lib/organic-social/format'
import type { AeoTotals } from '@/lib/organic-social/aeo-informed'
import type { TotalMetric } from '@/lib/dash-social/types'
import { deltaLabel, EMPTY_MARK, TILE, TILES_LABEL } from './copy'

const change = (cur: number | null, prev: number | null | undefined) => outlineDelta({ value: cur, context: prev ?? null } as unknown as TotalMetric)

export function AeoTiles({ totals, previousDays }: { totals: AeoTotals; previousDays: number | null }) {
  const p = totals.prior
  const withChange = previousDays !== null
  const tiles = [
    { ...TILE.urlsCited, value: totals.urlsCited.toLocaleString('en-US'), delta: change(totals.urlsCited, p?.urlsCited) },
    { ...TILE.retrievals, value: totals.retrievals.toLocaleString('en-US'), delta: change(totals.retrievals, p?.retrievals) },
    { ...TILE.citations, value: totals.citations.toLocaleString('en-US'), delta: change(totals.citations, p?.citations) },
    {
      ...TILE.citationRate,
      value: totals.citationRate === null ? EMPTY_MARK : pctCompact(totals.citationRate * 100),
      delta: totals.citationRate === null ? undefined : change(totals.citationRate, p?.citationRate),
    },
  ]
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-text-muted">{TILES_LABEL}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <KpiCard
            key={t.title}
            title={t.title}
            tooltip={t.tooltip}
            value={t.value}
            {...(withChange ? { delta: t.delta, wholeDelta: true, comparisonExpected: true, deltaLabel: deltaLabel(previousDays) } : {})}
          />
        ))}
      </div>
    </div>
  )
}
