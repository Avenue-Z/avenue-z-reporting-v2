'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { saveDashboardConfig } from '@/app/actions/dashboard'
import { getMainLabel } from '@/components/layout/date-range-picker'
import { setBlockRange, resetBlockRange } from './config-mutations'
import { useDashboardMutations } from './dashboard-mutations'
import { AddBlockDialog } from './add-block/add-block-dialog'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

const PRESETS = [
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_14_days', label: 'Last 14 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_60_days', label: 'Last 60 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'last_year', label: 'Last Year' },
] as const

const COMPARES = [
  { value: null, label: 'No Comparison' },
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'previous_year', label: 'Previous Year' },
] as const

export interface BlockChromeProps {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
  /** The kind-specific body card (KpiBlockBody, BarBlockBody, LineBlockBody, …). */
  children: ReactNode
}

/** Shared block chrome: relative positioning + kebab popover + range override + drift badge.
 *  Body content is supplied as `children`. State + save logic owned here once. */
export function BlockChrome({ block, canEdit, slug, config, activeDefault, children }: BlockChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'range' | 'confirm-delete' | 'confirm-reset'>('menu')
  const [editOpen, setEditOpen] = useState(false)
  const isStatic = block.kind === 'header' || block.kind === 'narrative'
  const [draftDate, setDraftDate] = useState<string>(block.range?.dateRange ?? activeDefault.dateRange)
  const [draftCompare, setDraftCompare] = useState<string | null>(block.range?.compareRange ?? activeDefault.compareRange)
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { optimisticRemove } = useDashboardMutations()

  const isOverridden = block.range !== null

  function closeMenu() { setMenuOpen(false); setView('menu'); setErrorMsg(null) }
  function runSave(nextConfig: DashboardConfig) {
    startTransition(async () => {
      const res = await saveDashboardConfig(slug, nextConfig)
      if (!res.ok) { setErrorMsg(res.error); return }
      closeMenu()
    })
  }
  function applyOverride() { runSave(setBlockRange(config, block.id, { dateRange: draftDate, compareRange: draftCompare })) }
  function confirmReset() { runSave(resetBlockRange(config, block.id)) }
  function confirmDelete() { optimisticRemove(block.id); closeMenu() }

  return (
    <div className="relative h-full">
      {children}

      {canEdit && editOpen && (
        <AddBlockDialog slug={slug} config={config} editing={block} onClose={() => setEditOpen(false)} />
      )}

      {canEdit && (
        <div
          className="block-drag-handle absolute right-10 top-3 flex h-6 w-6 cursor-grab items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-white active:cursor-grabbing"
          aria-label={`Drag ${block.name} to reorder`}
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {canEdit && (
        <Popover open={menuOpen} onOpenChange={(open) => (open ? setMenuOpen(true) : (setMenuOpen(false), setView('menu')))}>
          <PopoverTrigger asChild>
            <button
              aria-label={`Edit ${block.name}`}
              className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-white/10 hover:text-white"
            >
              ⋯
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 border-white/[0.08] bg-[#1a1a1a] p-2" align="end" sideOffset={4}>
            {view === 'menu' && (
              <div className="flex flex-col">
                {/* Edit is available for EVERY block kind — blockToManualDraft + the
                    AddBlockDialog editing mode pre-fill the builder for KPI / chart /
                    formula / static blocks alike. (Previously gated to static only.) */}
                <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]"
                  onClick={() => { setMenuOpen(false); setEditOpen(true) }}>Edit…</button>
                {!isStatic && (
                  <>
                    <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('range')}>Set range…</button>
                    {isOverridden && (
                      <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('confirm-reset')}>Reset to inherit</button>
                    )}
                  </>
                )}
                <button className="px-3 py-2 text-left text-[13px] text-[#FF6666] hover:bg-white/[0.06]" onClick={() => setView('confirm-delete')}>Delete block</button>
              </div>
            )}

            {view === 'range' && (
              <div className="flex flex-col">
                <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Date Range</p>
                <div className="max-h-48 overflow-y-auto">
                  {PRESETS.map((p) => (
                    <button key={p.value} onClick={() => setDraftDate(p.value)}
                      className={cn('block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]', p.value === draftDate ? 'font-bold text-brand-cyan' : 'text-white/80')}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="px-2 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Compare To</p>
                {COMPARES.map((c) => (
                  <button key={String(c.value)} onClick={() => setDraftCompare(c.value)}
                    className={cn('block w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/[0.06]', c.value === draftCompare ? 'font-bold text-brand-cyan' : 'text-white/80')}>
                    {c.label}
                  </button>
                ))}
                <div className="mt-2 flex justify-end gap-2">
                  <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setView('menu')} disabled={pending}>Cancel</button>
                  <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                    onClick={applyOverride} disabled={pending}>
                    {pending ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            )}

            {view === 'confirm-reset' && (
              <ConfirmRow question="Reset this block to inherit the global range?" confirmLabel="Reset" pending={pending} onCancel={() => setView('menu')} onConfirm={confirmReset} />
            )}

            {view === 'confirm-delete' && (
              <ConfirmRow question="Delete this block? This cannot be undone." confirmLabel="Delete" destructive pending={pending} onCancel={() => setView('menu')} onConfirm={confirmDelete} />
            )}

            {errorMsg && <p className="mt-2 px-2 text-[11px] text-[#FF6666]">Error: {errorMsg}</p>}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/** Inline detached-range badge. Public so KPI body can render it inside its card. */
export function DetachBadge({ label, canEdit, onReset }: { label: string; canEdit: boolean; onReset: () => void }) {
  const cls = 'inline-flex w-fit rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-cyan'
  if (canEdit) return <button onClick={onReset} className={`${cls} hover:bg-brand-cyan/20`}>Detached · {label}</button>
  return <span className={cls}>Detached · {label}</span>
}

function ConfirmRow({ question, confirmLabel, destructive = false, pending, onCancel, onConfirm }: {
  question: string; confirmLabel: string; destructive?: boolean; pending: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <p className="text-[13px] text-white/90">{question}</p>
      <div className="flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onCancel} disabled={pending}>Cancel</button>
        <button className={cn('rounded-md px-3 py-1.5 text-xs font-bold', destructive ? 'bg-[#FF4444]/80 text-white hover:bg-[#FF4444]' : 'bg-brand-cyan text-black hover:opacity-90')}
          onClick={onConfirm} disabled={pending}>
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}

/** Compute the per-block "Detached" badge label (or null if not overridden). */
export function detachBadgeLabel(block: PersistedBlock): string | null {
  return block.range !== null ? getMainLabel(block.range.dateRange) : null
}
