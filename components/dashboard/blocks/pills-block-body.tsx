import type { ReactNode } from 'react'

/** Compact KPI body for a horizontal pills strip. Name (small caps) + value +
 *  inline delta — designed for a 4×1 grid cell. No sub-label, no target/ceiling
 *  badges (those live on full KPI tiles). */
export function PillsBlockBody({
  name, value, delta, badge,
}: {
  name: ReactNode
  value: ReactNode
  delta: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-3 h-full flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted truncate">{name}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-bold text-white">{value}</span>
          <span className="text-[11px] text-text-muted">{delta}</span>
        </div>
      </div>
      {badge}
    </div>
  )
}
