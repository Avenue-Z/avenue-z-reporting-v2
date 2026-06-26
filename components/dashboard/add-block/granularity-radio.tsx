'use client'

import { cn } from '@/lib/utils'
import type { Granularity } from '@/lib/dashboard/types'

const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day',   label: 'Day' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function GranularityRadio({
  value,
  onChange,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelCls}>Granularity</span>
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs',
              o.value === value
                ? 'border-brand-cyan/60 bg-brand-cyan/10 font-bold text-brand-cyan'
                : 'border-white/10 text-white/80 hover:border-white/25 hover:bg-white/[0.04]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
