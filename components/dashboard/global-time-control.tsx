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

  // Batched apply: write BOTH params in one push so range + comparison update
  // atomically. (Two separate pushes race — the second clobbers the first.)
  const handleApply = (nextDate: string, nextCompare: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', nextDate)
    params.set('compareRange', nextCompare ?? '') // explicit empty = "no comparison"
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <DateRangePicker
      value={dateRange}
      compareValue={compareRange}
      onApply={handleApply}
    />
  )
}
