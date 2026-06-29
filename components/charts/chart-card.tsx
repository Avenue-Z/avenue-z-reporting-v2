import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** Canonical report chart-card chrome: bordered surface + h3 title + body slot.
 *  Matches the hand-rolled markup in report sections (e.g. ga4/channel-tabs-chart).
 *  `fill` makes the card fill its grid cell (configurable dashboard RGL). */
export function ChartCard({
  title,
  children,
  fill = false,
  bodyClassName,
}: {
  title: ReactNode
  children: ReactNode
  fill?: boolean
  bodyClassName?: string
}) {
  return (
    <div className={cn('rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5', fill && 'h-full flex flex-col')}>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <div className={cn('mt-3', fill && 'flex-1 min-h-0', bodyClassName)}>{children}</div>
    </div>
  )
}
