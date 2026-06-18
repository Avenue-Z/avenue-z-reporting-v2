'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/layout/date-range-picker'

export interface GlobalTimeControlProps {
  /** Active default — already merged from URL searchParams + persisted config.defaultRange. */
  activeDefault: { dateRange: string; compareRange: string | null }
}

export function GlobalTimeControl({ activeDefault }: GlobalTimeControlProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Reflect URL changes immediately after router.push (mirrors ReportDateRange).
  const dateRange = searchParams.get('dateRange') ?? activeDefault.dateRange
  const compareRange = searchParams.has('compareRange')
    ? searchParams.get('compareRange')
    : activeDefault.compareRange

  const push = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`)

  const handleDateChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', next)
    push(params)
  }

  const handleCompareChange = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('compareRange', next)
    else params.set('compareRange', '') // explicit empty = "no comparison"
    push(params)
  }

  return (
    <DateRangePicker
      value={dateRange}
      onChange={handleDateChange}
      compareValue={compareRange}
      onCompareChange={handleCompareChange}
    />
  )
}
