'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SORT_METRICS, type SortDir, type SortKey } from '@/lib/organic-social/sort-content'

type Metric = (typeof SORT_METRICS)[number]

/** One sort state for a card list: the offered metrics (all four when no list is given), the active one (Engagements
 *  when offered, else the first) and its direction. Clicking the active metric flips the direction; another switches
 *  to it, descending. Shared by SortableTopContent and InfluencerGrid so the two tabs sort alike (#334 review item 9). */
export function useSort(sortKeys?: readonly [SortKey, ...SortKey[]]) {
  const metrics = sortKeys ? SORT_METRICS.filter((m) => sortKeys.includes(m.key)) : SORT_METRICS
  const [sortKey, setSortKey] = useState<SortKey>(metrics.some((m) => m.key === 'engagements') ? 'engagements' : metrics[0].key)
  const [dir, setDir] = useState<SortDir>('desc')
  const onMetric = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setDir('desc')
    }
  }
  return { metrics, sortKey, dir, onMetric }
}

/** The "Sort by" buttons: the active one is pressed and shows its direction. */
export function SortToolbar({ metrics, sortKey, dir, onMetric }: {
  metrics: readonly Metric[]; sortKey: SortKey; dir: SortDir; onMetric: (key: SortKey) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sort by</span>
      {metrics.map((m) => {
        const active = m.key === sortKey
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onMetric(m.key)}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
              active
                ? 'border-white/20 bg-white/[0.06] text-white'
                : 'border-white/[0.08] text-text-muted hover:text-white',
            )}
          >
            {m.label}
            {active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        )
      })}
    </div>
  )
}
