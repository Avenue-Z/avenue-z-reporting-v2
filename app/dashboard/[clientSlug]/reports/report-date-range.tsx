'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/layout/date-range-picker'

export function ReportDateRange({
  value: serverValue,
  compareValue: serverCompareValue,
}: {
  value: string
  compareValue?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const value = searchParams.get('dateRange') ?? serverValue
  const compareValue = searchParams.has('compareRange')
    ? searchParams.get('compareRange')
    : (serverCompareValue ?? null)

  const handleChange = (newRange: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', newRange)
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleCompareChange = (newCompare: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newCompare) {
      params.set('compareRange', newCompare)
    } else {
      params.delete('compareRange')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <DateRangePicker
      value={value}
      onChange={handleChange}
      compareValue={compareValue}
      onCompareChange={handleCompareChange}
    />
  )
}
