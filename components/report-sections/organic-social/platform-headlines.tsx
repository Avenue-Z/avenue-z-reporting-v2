import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import type { PlatformHeadline } from '@/lib/organic-social/types'

/** Mobile-base column count that avoids a lonely last-row card. Overview (5) is unchanged
 *  (out of scope here — PR #174 review). 10 is already even at 2-col; 9 needs a 3-col mobile
 *  base (3×3); 11 is prime, so mobile drops to a single column (no last-row orphan is
 *  possible at 1-col). Class strings are literals so Tailwind's scanner keeps them. */
function gridColsBase(n: number): string {
  if (n <= 5) return 'grid-cols-2'
  if (n % 5 === 0) return 'grid-cols-2' // 10 → even at 2-col mobile
  if (n % 3 === 0) return 'grid-cols-3' // 9 → 3×3
  return 'grid-cols-1'                  // 11 → no orphan possible at 1-col
}

/** md:+ column count that avoids a lonely last-row card. Overview (5) stays a clean single
 *  row; platform subpages (9–11) divide evenly where possible (10→2×5, 9→3×3) or land on a
 *  full last row (11→4/4/3) instead of the 5/5/1 a fixed 5-wide grid would give. */
function gridColsMd(n: number): string {
  if (n <= 5) return 'md:grid-cols-5'
  if (n % 5 === 0) return 'md:grid-cols-5' // 10 → 2×5
  if (n % 3 === 0) return 'md:grid-cols-3' // 9 → 3×3
  return 'md:grid-cols-4'                  // 11 → 4/4/3 (no orphan single card)
}

function PlatformSection({ h }: { h: PlatformHeadline }) {
  const n = h.kpis.length
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{h.label}</h3>
      <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
        {h.kpis.map((k) => (
          <KpiCard
            key={k.key}
            title={k.label}
            value={k.format === 'percent' ? k.value.toFixed(1) : num(k.value)}
            suffix={k.format === 'percent' ? '%' : undefined}
            delta={k.delta}
            subValue={k.footnote}
          />
        ))}
      </div>
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
