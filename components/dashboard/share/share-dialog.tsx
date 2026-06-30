'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { saveDashboardShare, loadDashboardShare } from '@/app/actions/dashboard'
import { groupSections } from '@/lib/dashboard/share'
import type { PersistedBlock } from '@/lib/dashboard/types'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Checkbox with indeterminate support (set via ref — DOM-only prop). */
function Check({ checked, indeterminate, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer accent-brand-cyan"
    />
  )
}

export function ShareDialog({ slug, blocks, onClose }: { slug: string; blocks: PersistedBlock[]; onClose: () => void }) {
  // Sections (header → its data blocks) drive the component tree.
  const sections = useMemo(() => groupSections(blocks), [blocks])
  const allBlockIds = useMemo(() => sections.flatMap((s) => s.blocks.map((b) => b.id)), [sections])

  const [title, setTitle] = useState(`${humanize(slug)} Dashboard`)
  const [expiryDays, setExpiryDays] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allBlockIds)) // default: share everything
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(sections.map((s) => s.header?.id ?? '__general__')))
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Prefill from an existing share (title, selected blocks, current link).
  useEffect(() => {
    let alive = true
    loadDashboardShare(slug).then((r) => {
      if (!alive || !r.ok || !r.share) return
      setTitle(r.share.title)
      setSelected(new Set(r.share.blockIds))
      setUrl(`${window.location.origin}/share/${r.share.token}`)
    })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { alive = false; window.removeEventListener('keydown', onKey) }
  }, [slug, onClose])

  const toggleBlock = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleSection = (ids: string[], allOn: boolean) => setSelected((prev) => {
    const next = new Set(prev)
    for (const id of ids) { if (allOn) next.delete(id); else next.add(id) }
    return next
  })
  const selectAll = () => setSelected((prev) => (prev.size === allBlockIds.length ? new Set() : new Set(allBlockIds)))
  const toggleExpand = (key: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  function generate() {
    setError(null)
    startTransition(async () => {
      const res = await saveDashboardShare(slug, { title, expiryDays, blockIds: [...selected] })
      if (!res.ok) { setError(res.error); return }
      setUrl(res.url)
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 flex w-full max-w-xl flex-col gap-5 rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Share dashboard</h2>
            <p className="mt-0.5 text-sm text-text-muted">Generate a shareable link for your dashboard.</p>
          </div>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-white">Dashboard title</span>
          <input className={ctrl} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dashboard title" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-white">Expiry (days)</span>
            <input type="number" min={0} step={1} className={ctrl} value={expiryDays}
              onChange={(e) => setExpiryDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            <span className="text-[11px] text-text-muted">0 = never expires</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-white">Access</span>
            <select className={ctrl} value="link" disabled>
              <option value="link">link</option>
            </select>
            <span className="text-[11px] text-text-muted">Anyone with the link can view</span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Components to share</span>
            <button className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/[0.06]" onClick={selectAll}>
              {selected.size === allBlockIds.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="flex max-h-[40vh] flex-col divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/[0.06]">
            {sections.map((section) => {
              const key = section.header?.id ?? '__general__'
              const ids = section.blocks.map((b) => b.id)
              const selCount = ids.filter((id) => selected.has(id)).length
              const allOn = selCount === ids.length && ids.length > 0
              const isOpen = expanded.has(key)
              if (ids.length === 0) return null // a header with no data blocks isn't shareable on its own
              return (
                <div key={key}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Check checked={allOn} indeterminate={selCount > 0} onChange={() => toggleSection(ids, allOn)} />
                    <span className="flex-1 text-sm font-bold text-white">{section.header?.name ?? 'General'}</span>
                    <span className="text-xs text-text-muted">{selCount}/{ids.length}</span>
                    <button onClick={() => toggleExpand(key)} aria-label="Toggle section" className="text-text-muted hover:text-white">
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-white/[0.02] px-4 pb-3 pl-12">
                      {section.blocks.map((b) => (
                        <label key={b.id} className="flex cursor-pointer items-center gap-2">
                          <Check checked={selected.has(b.id)} onChange={() => toggleBlock(b.id)} />
                          <span className="truncate text-sm text-white/90">{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {error && <p className="text-xs text-[#FF6666]">{error}</p>}

        {url ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Shareable link</span>
            <div className="flex gap-2">
              <input className={ctrl} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button
                className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-sm text-white/90 hover:bg-white/[0.06]"
                onClick={() => navigator.clipboard?.writeText(url)}
              >
                Copy
              </button>
            </div>
            <button
              className="self-start rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
              onClick={generate}
              disabled={pending || selected.size === 0}
            >
              {pending ? 'Updating…' : 'Update link'}
            </button>
          </div>
        ) : (
          <button
            className="self-end rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-40"
            onClick={generate}
            disabled={pending || selected.size === 0 || !title.trim()}
          >
            {pending ? 'Generating…' : 'Generate link'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
