'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { MonthOption } from '@/lib/organic-social/reporting-months'

/** Month and year picker for locked-months clients (spec 4.3). Labels, tags and comparisons arrive
 *  formatted from the server; the browser never formats a date. Choosing a month sets dateRange to
 *  its canonical range and removes compareRange; every other param is kept. */
export function MonthPicker({ months, value, emptyText }: { months: MonthOption[]; value: string | null; emptyText: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (months.length === 0) {
    return <span aria-disabled="true" className="text-sm text-text-muted">{emptyText ?? 'No reporting months yet'}</span>
  }

  const selected = months.find((m) => m.key === value) ?? null
  const choose = (key: string) => {
    const month = months.find((m) => m.key === key)
    if (!month) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', month.dateRange)
    params.delete('compareRange')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <label className="flex flex-col items-end gap-0.5">
      <span className="sr-only">Reporting month</span>
      <select
        value={selected?.key ?? ''}
        onChange={(e) => choose(e.target.value)}
        className="rounded-md border border-white/10 bg-bg-surface px-3.5 py-2 text-sm font-medium text-white"
      >
        {months.map((m) => (
          <option key={m.key} value={m.key}>{m.tag ? `${m.label} (${m.tag})` : m.label}</option>
        ))}
      </select>
      {selected && <span className="text-[11px] text-text-muted">{selected.compareLabel}</span>}
    </label>
  )
}
