'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SummaryPeriod = 'weekly' | 'monthly' | 'quarterly'

const PERIODS: { id: SummaryPeriod; label: string }[] = [
  { id: 'weekly',    label: 'Weekly'    },
  { id: 'monthly',   label: 'Monthly'   },
  { id: 'quarterly', label: 'Quarterly' },
]

export function PeriodSelector({ activePeriod }: { activePeriod: SummaryPeriod }) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  function select(period: SummaryPeriod) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', period)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
      {PERIODS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => select(id)}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-semibold transition-all',
            activePeriod === id
              ? 'bg-white text-black shadow-sm'
              : 'text-text-muted hover:text-white'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
