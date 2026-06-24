'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronDownIcon } from 'lucide-react'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { resolveDateRange, formatResolvedRange } from '@/lib/date-range'

const DATE_PRESETS = [
  { value: 'last_7_days',  label: 'Last 7 Days'  },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_60_days', label: 'Last 60 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_month',   label: 'This Month'   },
  { value: 'last_month',   label: 'Last Month'   },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'last_year',    label: 'Last Year'    },
] as const

const COMPARE_PRESETS = [
  { value: null,               label: 'No Comparison'   },
  { value: 'previous_period',  label: 'Previous Period' },
  { value: 'previous_year',    label: 'Previous Year'   },
] as const

function getDateLabel(value: string): string {
  if (value.startsWith('custom:')) return 'Custom Range'
  return DATE_PRESETS.find((p) => p.value === value)?.label ?? value
}

function getCompareLabel(value: string | null): string | null {
  if (!value) return null
  return COMPARE_PRESETS.find((p) => p.value === value)?.label ?? null
}

function customToCalendarRange(value: string): DateRange | undefined {
  if (!value.startsWith('custom:')) return undefined
  const [s, e] = value.replace('custom:', '').split(',')
  if (s && e) return { from: new Date(`${s}T00:00:00`), to: new Date(`${e}T00:00:00`) }
  return undefined
}

interface GA4DatePickerProps {
  dateRange: string
  compareRange: string | null
}

export function GA4DatePicker({ dateRange, compareRange }: GA4DatePickerProps) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen]                     = useState(false)
  const [pendingDate, setPendingDate]       = useState(dateRange)
  const [pendingCompare, setPendingCompare] = useState<string | null>(compareRange)
  const [customOpen, setCustomOpen]         = useState(dateRange.startsWith('custom:'))
  const [pendingCalendar, setPendingCalendar] = useState<DateRange | undefined>(
    customToCalendarRange(dateRange),
  )

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPendingDate(dateRange)
      setPendingCompare(compareRange)
      setCustomOpen(dateRange.startsWith('custom:'))
      setPendingCalendar(customToCalendarRange(dateRange))
    }
    setOpen(next)
  }

  const handlePresetClick = (value: string) => {
    setCustomOpen(false)
    setPendingDate(value)
  }

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setPendingCalendar(range)
    if (range?.from && range?.to) {
      setPendingDate(`custom:${format(range.from, 'yyyy-MM-dd')},${format(range.to, 'yyyy-MM-dd')}`)
    }
  }

  const canApply = pendingDate.startsWith('custom:')
    ? !!(pendingCalendar?.from && pendingCalendar?.to)
    : !!pendingDate

  const handleApply = () => {
    if (!canApply) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('dateRange', pendingDate)
    if (pendingCompare) params.set('compareRange', pendingCompare)
    else params.delete('compareRange')
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const dateLabel    = getDateLabel(dateRange)
  const compareLabel = getCompareLabel(compareRange)
  const resolved     = formatResolvedRange(dateRange)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button suppressHydrationWarning className="flex items-center gap-2 rounded-md border border-white/10 bg-bg-surface px-3.5 py-2 text-sm text-white transition-colors hover:border-white/25 hover:bg-white/[0.04]">
          <span className="flex flex-col items-start leading-tight">
            <span className="flex items-center gap-2">
              <span className="font-medium">{dateLabel}</span>
              {compareLabel && (
                <>
                  <span className="text-white/25">vs</span>
                  <span className="text-xs text-text-muted">{compareLabel}</span>
                </>
              )}
            </span>
            <span className="text-[11px] text-text-muted">{resolved}</span>
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto border-white/[0.08] bg-[#1a1a1a] p-0 shadow-2xl" align="end" sideOffset={8}>
        <div className="flex divide-x divide-white/[0.06]">
          {/* Date range column */}
          <div className="w-44 py-2">
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Date Range
            </p>
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                  !customOpen && pendingDate === preset.value ? 'font-semibold text-brand-cyan' : 'text-white/75',
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setCustomOpen(true)}
              className={cn(
                'mt-1 block w-full border-t border-white/[0.06] px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                customOpen ? 'font-semibold text-brand-cyan' : 'text-white/75',
              )}
            >
              Custom Range
            </button>
          </div>

          {/* Custom calendar column (only when Custom Range is active) */}
          {customOpen && (
            <div className="flex flex-col p-3">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                Custom Range
              </p>
              <Calendar
                mode="range"
                selected={pendingCalendar}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                showOutsideDays={false}
                className="!bg-transparent"
                classNames={{ today: 'text-white font-bold' }}
              />
              <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs text-text-muted">
                {pendingCalendar?.from && pendingCalendar?.to
                  ? `${format(pendingCalendar.from, 'MMM d, yyyy')} – ${format(pendingCalendar.to, 'MMM d, yyyy')}`
                  : 'Select start and end dates'}
              </p>
            </div>
          )}

          {/* Compare column */}
          <div className="flex w-44 flex-col py-2">
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Compare To
            </p>
            {COMPARE_PRESETS.map((opt) => (
              <button
                key={opt.value ?? 'none'}
                onClick={() => setPendingCompare(opt.value)}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.05]',
                  pendingCompare === opt.value ? 'font-semibold text-brand-cyan' : 'text-white/75',
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className="mt-auto px-3 pb-2 pt-4">
              <button
                onClick={handleApply}
                disabled={!canApply}
                className="w-full rounded-full bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
