'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboOption { value: string; label: string; group?: string; disabled?: boolean }

export function SearchCombobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  loading = false,
}: {
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match =
      needle === ''
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    return [...match].sort((a, b) => Number(a.disabled ?? false) - Number(b.disabled ?? false))
  }, [q, options])

  const trigger =
    'flex w-full items-center justify-between rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white disabled:opacity-40'

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
      <PopoverTrigger asChild>
        <button type="button" className={trigger} disabled={disabled || loading}>
          <span className={cn(!selected && 'text-text-muted')}>
            {loading ? 'Loading…' : selected ? selected.label : placeholder}
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
          placeholder="Search…"
          className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-text-muted"
        />
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">No matches</p>}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={o.disabled}
              onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-white/[0.06]',
                o.value === value ? 'text-brand-cyan' : o.disabled ? 'cursor-not-allowed text-text-muted hover:bg-transparent' : 'text-white/90',
              )}
            >
              <span>{o.label}</span>
              {o.disabled && <span className="text-[10px] uppercase tracking-widest text-text-muted">closed</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
