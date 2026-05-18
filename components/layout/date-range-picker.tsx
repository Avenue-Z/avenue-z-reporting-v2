'use client'

import { useState, useEffect } from 'react'
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  subQuarters,
  subYears,
  differenceInDays,
} from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange } from 'react-day-picker'

const PRESETS = [
  { value: 'last_7_days',  label: 'Last 7 Days'  },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_60_days', label: 'Last 60 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_week',    label: 'This Week'    },
  { value: 'last_week',    label: 'Last Week'    },
  { value: 'this_month',   label: 'This Month'   },
  { value: 'last_month',   label: 'Last Month'   },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year',    label: 'This Year'    },
  { value: 'last_year',    label: 'Last Year'    },
  { value: 'year_to_date', label: 'Year to Date' },
] as const

const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'previous_year',   label: 'Previous Year'   },
  { value: 'custom',          label: 'Custom Range'    },
] as const

export function presetToDateRange(value: string): DateRange | undefined {
  const today = new Date()
  switch (value) {
    case 'last_7_days':   return { from: subDays(today, 7),  to: today }
    case 'last_14_days':  return { from: subDays(today, 14), to: today }
    case 'last_30_days':  return { from: subDays(today, 30), to: today }
    case 'last_60_days':  return { from: subDays(today, 60), to: today }
    case 'last_90_days':  return { from: subDays(today, 90), to: today }
    case 'this_week':     return { from: startOfWeek(today), to: today }
    case 'last_week': {
      const s = startOfWeek(subDays(today, 7))
      return { from: s, to: endOfWeek(s) }
    }
    case 'this_month':    return { from: startOfMonth(today), to: today }
    case 'last_month': {
      const s = startOfMonth(subMonths(today, 1))
      return { from: s, to: endOfMonth(s) }
    }
    case 'this_quarter':  return { from: startOfQuarter(today), to: today }
    case 'last_quarter': {
      const s = startOfQuarter(subQuarters(today, 1))
      return { from: s, to: endOfQuarter(s) }
    }
    case 'this_year':
    case 'year_to_date':  return { from: startOfYear(today), to: today }
    case 'last_year': {
      const s = startOfYear(subYears(today, 1))
      return { from: s, to: endOfYear(s) }
    }
    default: {
      if (value.startsWith('custom:')) {
        const [start, end] = value.replace('custom:', '').split(',')
        if (start && end) return { from: new Date(start), to: new Date(end) }
      }
      return undefined
    }
  }
}

function getMainLabel(value: string): string {
  const preset = PRESETS.find((p) => p.value === value)
  if (preset) return preset.label
  if (value.startsWith('custom:')) {
    const [s, e] = value.replace('custom:', '').split(',')
    if (s && e) return `${format(new Date(s), 'MMM d, yyyy')} – ${format(new Date(e), 'MMM d, yyyy')}`
  }
  return 'Last 30 Days'
}

function derivePreviousPeriod(mainValue: string): DateRange | undefined {
  const main = presetToDateRange(mainValue)
  if (!main?.from || !main?.to) return undefined
  const len = differenceInDays(main.to, main.from) + 1
  const prevEnd = subDays(main.from, 1)
  return { from: subDays(prevEnd, len - 1), to: prevEnd }
}

function derivePreviousYear(mainValue: string): DateRange | undefined {
  const main = presetToDateRange(mainValue)
  if (!main?.from || !main?.to) return undefined
  return { from: subYears(main.from, 1), to: subYears(main.to, 1) }
}

function getCompareDisplayLabel(compareValue: string, mainValue: string): string {
  if (compareValue === 'previous_period') {
    const r = derivePreviousPeriod(mainValue)
    return r?.from && r?.to
      ? `${format(r.from, 'MMM d')} – ${format(r.to, 'MMM d, yyyy')}`
      : 'Prev Period'
  }
  if (compareValue === 'previous_year') {
    const r = derivePreviousYear(mainValue)
    return r?.from && r?.to
      ? `${format(r.from, 'MMM d')} – ${format(r.to, 'MMM d, yyyy')}`
      : 'Prev Year'
  }
  if (compareValue.startsWith('custom:')) {
    const [s, e] = compareValue.replace('custom:', '').split(',')
    if (s && e) return `${format(new Date(s), 'MMM d')} – ${format(new Date(e), 'MMM d, yyyy')}`
  }
  return compareValue
}

function initCompareMode(compareValue?: string | null): string {
  if (!compareValue) return 'previous_period'
  if (compareValue === 'previous_year') return 'previous_year'
  if (compareValue.startsWith('custom:')) return 'custom'
  return 'previous_period'
}

interface DateRangePickerProps {
  value: string
  onChange: (value: string) => void
  compareValue?: string | null
  onCompareChange?: (value: string | null) => void
}

export function DateRangePicker({
  value,
  onChange,
  compareValue,
  onCompareChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const [localValue, setLocalValue] = useState(value)
  const [localCalendarRange, setLocalCalendarRange] = useState<DateRange | undefined>(
    presetToDateRange(value)
  )
  const [localCompareEnabled, setLocalCompareEnabled] = useState(!!compareValue)
  const [localCompareMode, setLocalCompareMode] = useState(initCompareMode(compareValue))
  const [localCompareCalendarRange, setLocalCompareCalendarRange] = useState<DateRange | undefined>(
    compareValue?.startsWith('custom:') ? presetToDateRange(compareValue) : undefined
  )

  // When the applied value changes externally (URL updated) and the popover is closed,
  // sync local state so the next open reflects the current applied selection.
  useEffect(() => {
    if (!open) {
      setLocalValue(value)
      setLocalCalendarRange(presetToDateRange(value))
    }
  }, [value, open])

  useEffect(() => {
    if (!open) {
      setLocalCompareEnabled(!!compareValue)
      setLocalCompareMode(initCompareMode(compareValue))
      setLocalCompareCalendarRange(
        compareValue?.startsWith('custom:') ? presetToDateRange(compareValue) : undefined
      )
    }
  }, [compareValue, open])

  const handlePresetClick = (preset: string) => {
    setLocalValue(preset)
    setLocalCalendarRange(presetToDateRange(preset))
  }

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setLocalCalendarRange(range)
    if (range?.from && range?.to) {
      setLocalValue(
        `custom:${format(range.from, 'yyyy-MM-dd')},${format(range.to, 'yyyy-MM-dd')}`
      )
    }
  }

  const canApply = localValue.startsWith('custom:')
    ? !!(localCalendarRange?.from && localCalendarRange?.to)
    : !!localValue

  const handleApply = () => {
    if (!canApply) return

    const finalValue =
      localValue.startsWith('custom:') && localCalendarRange?.from && localCalendarRange?.to
        ? `custom:${format(localCalendarRange.from, 'yyyy-MM-dd')},${format(localCalendarRange.to, 'yyyy-MM-dd')}`
        : localValue

    onChange(finalValue)

    if (onCompareChange) {
      if (!localCompareEnabled) {
        onCompareChange(null)
      } else if (localCompareMode === 'previous_period' || localCompareMode === 'previous_year') {
        onCompareChange(localCompareMode)
      } else if (
        localCompareMode === 'custom' &&
        localCompareCalendarRange?.from &&
        localCompareCalendarRange?.to
      ) {
        onCompareChange(
          `custom:${format(localCompareCalendarRange.from, 'yyyy-MM-dd')},${format(localCompareCalendarRange.to, 'yyyy-MM-dd')}`
        )
      }
    }

    setOpen(false)
  }

  const showCompareCalendar = localCompareEnabled && localCompareMode === 'custom'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-white/10 bg-bg-surface px-4 py-2 text-sm text-white transition-colors hover:border-white/20">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span>{getMainLabel(value)}</span>
          {compareValue && compareValue !== 'custom:' && (
            <>
              <span className="text-white/30">vs</span>
              <span className="text-text-muted">{getCompareDisplayLabel(compareValue, value)}</span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto border-white/[0.08] bg-[#1a1a1a] p-0"
        align="end"
        sideOffset={8}
      >
        <div className="flex">
          {/* Left — presets + compare toggle */}
          <div className="flex w-48 flex-col border-r border-white/[0.06] py-2">
            <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              Quick Select
            </p>
            <div className="max-h-[240px] overflow-y-auto">
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]',
                    preset.value === localValue ? 'font-bold text-brand-cyan' : 'text-white/80'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {onCompareChange && (
              <div className="mt-2 border-t border-white/[0.06] pt-3">
                <div className="mb-2 flex items-center justify-between px-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                    Compare To
                  </p>
                  <button
                    onClick={() => setLocalCompareEnabled((prev) => !prev)}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
                      localCompareEnabled ? 'bg-brand-cyan' : 'bg-white/20'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-3 w-3 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200',
                        localCompareEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>

                {localCompareEnabled && (
                  <div>
                    {COMPARE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setLocalCompareMode(opt.value)}
                        className={cn(
                          'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]',
                          localCompareMode === opt.value ? 'font-bold text-brand-cyan' : 'text-white/80'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — calendar + Apply */}
          <div className="flex flex-col p-3">
            {showCompareCalendar ? (
              <>
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                  Comparison Range
                </p>
                <Calendar
                  mode="range"
                  selected={localCompareCalendarRange}
                  onSelect={setLocalCompareCalendarRange}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  showOutsideDays={false}
                  className="!bg-transparent"
                  classNames={{ today: 'text-white font-bold' }}
                />
                <div className="mt-2 border-t border-white/[0.06] pt-3">
                  <p className="text-xs text-text-muted">
                    {localCompareCalendarRange?.from && localCompareCalendarRange?.to
                      ? `${format(localCompareCalendarRange.from, 'MMM d, yyyy')} – ${format(localCompareCalendarRange.to, 'MMM d, yyyy')}`
                      : localCompareCalendarRange?.from
                        ? `${format(localCompareCalendarRange.from, 'MMM d, yyyy')} – ...`
                        : 'Select comparison dates'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
                  Custom Range
                </p>
                <Calendar
                  mode="range"
                  selected={localCalendarRange}
                  onSelect={handleCalendarSelect}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  showOutsideDays={false}
                  className="!bg-transparent"
                  classNames={{ today: 'text-white font-bold' }}
                />
                <div className="mt-2 border-t border-white/[0.06] pt-3">
                  <p className="text-xs text-text-muted">
                    {localCalendarRange?.from && localCalendarRange?.to
                      ? `${format(localCalendarRange.from, 'MMM d, yyyy')} – ${format(localCalendarRange.to, 'MMM d, yyyy')}`
                      : localCalendarRange?.from
                        ? `${format(localCalendarRange.from, 'MMM d, yyyy')} – ...`
                        : 'Select start and end dates'}
                  </p>
                </div>
              </>
            )}

            <div className="mt-3 flex justify-end">
              <button
                onClick={handleApply}
                disabled={!canApply}
                className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
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
