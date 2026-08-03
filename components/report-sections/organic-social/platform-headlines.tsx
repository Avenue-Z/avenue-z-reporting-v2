import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import { expectsComparison } from '@/lib/organic-social/metrics'
import type { PlatformHeadline } from '@/lib/organic-social/types'
import { NoData } from './no-data'

/** Mobile-base column count that avoids a lonely last-row card. Overview (5) is unchanged
 *  (out of scope here — PR #174 review). 10 is already even at 2-col; 9 needs a 3-col mobile
 *  base (3×3); 11 is prime, so mobile drops to a single column (no last-row orphan is
 *  possible at 1-col). Class strings are literals so Tailwind's scanner keeps them.
 *  Condition is n%2===0 (even), not n%5===0 — 10 is both, but an odd multiple of 5 (15, 25)
 *  would still orphan a 2-col mobile grid (PR #174 review — pinned by the n=6..25 sweep in
 *  platform-headlines.gridcols.test.ts). */
export function gridColsBase(n: number): string {
  if (n <= 5) return 'grid-cols-2'
  if (n % 2 === 0) return 'grid-cols-2' // e.g. 10 → even at 2-col mobile
  if (n % 3 === 0) return 'grid-cols-3' // 9 → 3×3
  return 'grid-cols-1'                  // 11 → no orphan possible at 1-col
}

/** md:+ column count. Prefer the WIDEST grid (5-up) so every platform's cards are the same width
 *  — a narrower grid (e.g. 9 KPIs at 3-up) makes those cards visibly chunkier than the others.
 *  Step down only to avoid a "lonely last-row card" (a full row then a single orphan, n%c===1):
 *  9→5/4, 10→2×5, 11→4/4/3 (5 would orphan a single card). The 4→3→2 fall-through covers any
 *  future KPI count (PR #174 review — pinned by the n=6..25 no-orphan sweep in
 *  platform-headlines.gridcols.test.ts). */
export function gridColsMd(n: number): string {
  if (n <= 5) return 'md:grid-cols-5'
  if (n % 5 !== 1) return 'md:grid-cols-5' // 9 → 5/4, 10 → 2×5
  if (n % 4 !== 1) return 'md:grid-cols-4' // 11 → 4/4/3 (5 would orphan a single card)
  if (n % 3 !== 1) return 'md:grid-cols-3'
  return 'md:grid-cols-2'
}

function PlatformSection({ h }: { h: PlatformHeadline }) {
  const n = h.kpis.length
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{h.label}</h3>
      {h.noData ? (
        <NoData />
      ) : (
        <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
          {h.kpis.map((k) => (
            <KpiCard
              key={k.key}
              title={k.label}
              value={k.format === 'percent' ? `${Math.round(k.value)}%` : num(k.value)}
              delta={k.delta}
              comparisonExpected={expectsComparison(k.key)}
              subValue={k.footnote}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function PlatformHeadlines({ headlines }: { headlines: PlatformHeadline[] }) {
  return (
    <div className="space-y-6">
      {headlines.map((h) => (
        <PlatformSection key={h.channel} h={h} />
      ))}
    </div>
  )
}
