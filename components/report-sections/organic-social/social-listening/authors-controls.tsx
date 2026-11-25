'use client'

// The authors table's controls (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit F): the sort, for
// every viewer, and staff's Show / Hide for an author or an overview card. The sort writes `slsort` to the URL, as the chart
// toggle writes `slcols` (chart-toggle.tsx), so the route reads it back and the PDF prints the same order.
import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { pickSlItemAction } from '@/app/actions/social-listening'
import { formatSlSort } from '@/lib/organic-social/social-listening/params'
import type { SlAuthorSort } from '@/lib/organic-social/social-listening/picks'
import f from '../design/frames.module.css'
import k from '../design/kit.module.css'

const SORTS: { id: SlAuthorSort; label: string }[] = [{ id: 'posts', label: 'Posts' }, { id: 'reach', label: 'Reach' }, { id: 'engagement', label: 'Engagement' }]

export function AuthorSortControl({ sort }: { sort: SlAuthorSort }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [current, setCurrent] = useState(sort)
  const [seen, setSeen] = useState(sort)
  if (sort !== seen) { setSeen(sort); setCurrent(sort) }
  const choose = (next: SlAuthorSort) => {
    setCurrent(next)
    const sp = new URLSearchParams(params.toString())
    const value = formatSlSort(next)
    if (value) sp.set('slsort', value)
    else sp.delete('slsort')
    const q = sp.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }
  return (
    <div className={f.toggle} role="group" aria-label="Sort authors by">
      {SORTS.map((s) => (
        <button key={s.id} type="button" className={k.pill} aria-pressed={current === s.id} onClick={() => choose(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Show or hide one author or card for this month. Staff only (the page renders it only for an editor; the action checks
 *  again). The page refreshes with the new answer. */
export function PickToggle({ clientSlug, range, kind, itemKey, shown, name }: {
  clientSlug: string; range: string; kind: 'author' | 'card'; itemKey: string; shown: boolean; name: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next = shown ? 'hidden' : 'shown'
  const act = () => start(async () => {
    setError(null)
    let r: { ok: boolean; error?: string }
    try { r = await pickSlItemAction({ clientSlug, range, kind, key: itemKey, state: next }) } catch { r = { ok: false, error: 'Could not save. Try again.' } }
    if (!r.ok) { setError(r.error ?? 'Could not save. Try again.'); return }
    router.refresh()
  })
  return (
    <span className="no-print inline-flex items-center gap-2">
      <button type="button" className={k.pill} disabled={pending} aria-label={`${shown ? 'Hide' : 'Show'} ${name} for this month`} onClick={act}>
        {shown ? 'Hide' : 'Show'}
      </button>
      {error && <span role="alert" className="text-[11px] text-red-400">{error}</span>}
    </span>
  )
}
