'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ComboOption } from './search-combobox'

/** Toggle a value in/out of the selected list (pure; order-preserving append). */
export function toggleValue(values: string[], v: string): string[] {
  return values.includes(v) ? values.filter((x) => x !== v) : [...values, v]
}

export function MultiSelectCombobox({
  values,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  allowCustom = false,
}: {
  values: string[]
  onChange: (values: string[]) => void
  options: ComboOption[]
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  allowCustom?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle === ''
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
  }, [q, options])

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const trigger =
    'flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white disabled:opacity-40'

  const addCustom = () => {
    const v = q.trim()
    if (v === '' || values.includes(v)) return
    onChange([...values, v])
    setQ('')
  }

  return (
    <div className="flex-1">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
        <PopoverTrigger asChild>
          <button type="button" className={trigger} disabled={disabled || loading}>
            <span className={cn('truncate', values.length === 0 && 'text-text-muted')}>
              {loading ? 'Loading…' : values.length === 0 ? placeholder : `${values.length} selected`}
            </span>
            <span className="text-text-muted">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] border-white/[0.08] bg-[#1a1a1a] p-0 text-white"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (allowCustom && e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            placeholder={allowCustom ? 'Search or type to add…' : 'Search…'}
            className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-text-muted"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && !allowCustom && <p className="px-3 py-2 text-xs text-text-muted">No matches</p>}
            {allowCustom && q.trim() !== '' && !options.some((o) => o.value === q.trim()) && (
              <button type="button" onClick={addCustom}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-brand-cyan hover:bg-white/[0.06]">
                Add &quot;{q.trim()}&quot;
              </button>
            )}
            {filtered.map((o) => {
              const checked = values.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(toggleValue(values, o.value))}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/[0.06]',
                    checked ? 'text-brand-cyan' : 'text-white/90',
                  )}
                >
                  <span className={cn('inline-block h-3 w-3 shrink-0 rounded-sm border', checked ? 'border-brand-cyan bg-brand-cyan' : 'border-white/30')} />
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/90">
              {labelFor(v)}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-text-muted hover:text-white" aria-label={`Remove ${v}`}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
