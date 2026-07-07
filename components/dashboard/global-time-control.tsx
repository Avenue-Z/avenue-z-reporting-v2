'use client'

import type { TransitionStartFunction } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/layout/date-range-picker'

export interface GlobalTimeControlProps {
  /** Active default — already merged from URL searchParams + persisted config.defaultRange. */
  activeDefault: { dateRange: string; compareRange: string | null }
  /** Owned by the shell so the same transition dims the grid while it refetches. */
  isPending: boolean
  startTransition: TransitionStartFunction
}

export function GlobalTimeControl({ activeDefault, isPending, startTransition }: GlobalTimeControlProps) {
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
    // Wrap the push so isPending stays true until the server re-render (block
    // refetch) commits — that's the window we surface as loading feedback.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <DateRangePicker
      value={dateRange}
      compareValue={compareRange}
      onApply={handleApply}
      pending={isPending}
    />
  )
}
