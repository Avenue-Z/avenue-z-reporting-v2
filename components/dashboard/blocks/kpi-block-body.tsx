import type { ReactNode } from 'react'

export interface KpiBlockBodyProps {
  name: string
  value: ReactNode
  delta: ReactNode
  sub?: ReactNode
  badge?: ReactNode
}

/** KPI-shaped body card. Pure presentation — value/delta/sub are pre-built ReactNodes
 *  (typically Suspense-wrapped on the server). The chrome is supplied by <BlockChrome>. */
export function KpiBlockBody({ name, value, delta, sub, badge }: KpiBlockBodyProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px]">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      {badge && <div className="mt-2">{badge}</div>}
      <div className="mt-2">{value}</div>
      <div className="mt-1">{delta}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  )
}
