'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { AEO_MODELS, MODEL_COLORS, MODEL_DISPLAY_LABELS, serializeModelsParam, type AEOModel } from '@/lib/peec/models'
import { cn } from '@/lib/utils'

export function ModelFilter({ selected }: { selected: AEOModel[] | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const effectiveSelected: AEOModel[] = selected ?? Array.from(AEO_MODELS)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<AEOModel[]>(effectiveSelected)

  const handleOpenChange = (next: boolean) => {
    if (next) setPending(effectiveSelected)
    setOpen(next)
  }

  const toggle = (m: AEOModel) =>
    setPending((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))

  // Single atomic router.push — no double-push bug
  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString())
    const serialized = serializeModelsParam(pending)
    if (serialized) params.set('models', serialized)
    else params.delete('models')
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const handleSelectAll = () => setPending(Array.from(AEO_MODELS))
  const handleClear = () => setPending([])

  const isFiltered = selected !== null
  const label = isFiltered
    ? `${effectiveSelected.length}/${AEO_MODELS.length} models`
    : 'All models'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-2 border-white/[0.08] bg-bg-surface text-xs font-semibold text-white hover:bg-white/[0.06]',
            isFiltered && 'ring-1 ring-[#60FDFF]/40'
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-64 rounded-md border border-white/[0.08] bg-bg-surface p-2 shadow-xl"
      >
        <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          AI Model
        </div>
        <ul className="space-y-px">
          {AEO_MODELS.map((m) => {
            const checked = pending.includes(m)
            return (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/[0.04]"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                      checked ? 'border-transparent bg-[#60FDFF]' : 'border-white/30 bg-transparent'
                    )}
                  >
                    {checked && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                  </span>
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: MODEL_COLORS[m] }}
                  />
                  <span className="flex-1">{MODEL_DISPLAY_LABELS[m]}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-text-muted hover:text-white"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-text-muted hover:text-white"
            >
              Clear
            </button>
          </div>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
