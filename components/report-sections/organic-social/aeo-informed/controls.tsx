'use client'
// The AEO Informed Social tab's two controls. Each sets its URL param and keeps every other one, as month-picker.tsx sets dateRange; the
// default value removes the param, so the default URL stays the one the sidebar links to. The server reads both (parseAeoRange,
// parseAeoMin in lib/organic-social/aeo-tab/params.ts) and re-renders. In the PDF export each is plain text.
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useExportMode } from '@/components/export/export-mode'
import type { AeoRange } from '@/lib/organic-social/aeo-tab/params'
import { MIN_COMPETITORS_LABEL, RANGE_LABEL } from './copy'

const RANGES: AeoRange[] = ['month', 'ytd', 'all']
const MINS = [1, 2, 3, 4, 5]

function useSetParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (name: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null) params.delete(name)
    else params.set(name, value)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
}

export function AeoRangeControl({ value }: { value: AeoRange }) {
  const exportMode = useExportMode()
  const setParam = useSetParam()
  if (exportMode) return <span className="text-sm font-semibold text-white">{RANGE_LABEL[value]}</span>
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-bg-surface p-0.5" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={r === value}
          onClick={() => setParam('aeo', r === 'month' ? null : r)}
          className={cn('rounded px-3 py-1.5 text-sm font-semibold transition-colors', r === value ? 'bg-white/[0.12] text-white' : 'text-text-muted hover:text-white')}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  )
}

export function AeoMinControl({ value }: { value: number }) {
  const exportMode = useExportMode()
  const setParam = useSetParam()
  if (exportMode) return <span className="text-xs text-text-muted">{MIN_COMPETITORS_LABEL}: {value}</span>
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      {MIN_COMPETITORS_LABEL}
      <select
        aria-label={MIN_COMPETITORS_LABEL}
        value={String(value)}
        onChange={(e) => setParam('aeomin', e.target.value === '2' ? null : e.target.value)}
        className="rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-sm font-medium text-white"
      >
        {MINS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
      </select>
    </label>
  )
}
