import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** Canonical KPI value text. Color is supplied by the caller via `className`
 *  (KpiCard passes white/valueClassName; BlockValue passes its band color). */
export function MetricValue({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-3xl font-extrabold', className)}>{children}</p>
}
