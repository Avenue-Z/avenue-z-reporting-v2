'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DateRangePicker } from '@/components/layout/date-range-picker'

export function PortalReportDateRange({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleChange = (newRange: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', newRange)
    router.push(`${pathname}?${params.toString()}`)
  }

  return <DateRangePicker value={value} onChange={handleChange} />
}
