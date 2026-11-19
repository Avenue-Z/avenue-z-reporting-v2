'use client'
// Trends in keyword themes: three columns (emerging, decreasing, new), and the staff editor. A client and the PDF see
// the approved lists only (view-model.ts); staff see the draft, edit it as one theme per line, and an approver approves
// exactly the lists on screen.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { approveTrendsAction, saveTrendsAction } from '@/app/actions/social-listening'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import { formatTrendLines } from '@/lib/organic-social/social-listening/trends'
import type { SlTrendLists } from '@/lib/organic-social/social-listening/types'

const EMPTY: SlTrendLists = { emerging: [], decreasing: [], newThemes: [] }

export function TrendLists({ lists }: { lists: SlTrendLists }) {
  const col = (title: string, color: string, items: SlTrendLists['emerging'], sign: '' | '+' | '-') => (
    <div>
      <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color }}>{title}</h4>
      {items.length === 0 ? <p className="text-xs text-text-muted">None</p> : (
        <ul className="space-y-1 text-sm">
          {items.map((t) => (
            <li key={t.theme} className="flex justify-between gap-3">
              <span className="text-white">{t.theme}</span>
              {t.change && <span className="tabular-nums" style={{ color }}>{sign && !/^[+-]/.test(t.change) ? `${sign}${t.change}` : t.change}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {col('Emerging', SENTIMENT_COLORS.pos, lists.emerging, '+')}
      {col('Decreasing', SENTIMENT_COLORS.neg, lists.decreasing, '-')}
      {col('New', '#60FDFF', lists.newThemes, '')}
    </div>
  )
}

export function TrendsBlock({ lists, draft, clientSlug, range, caps }: {
  lists: SlTrendLists | null
  draft: { lists: SlTrendLists; status: 'draft' | 'approved' } | null
  clientSlug: string; range: string; caps: { canEdit: boolean; canApprove: boolean }
}) {
  const exportMode = useExportMode()
  const router = useRouter()
  const staff = caps.canEdit && !exportMode
  const shown = staff ? (draft?.lists ?? lists ?? EMPTY) : (lists ?? EMPTY)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState({ emerging: '', decreasing: '', newThemes: '' })
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (!staff) return <TrendLists lists={shown} />

  const open = () => {
    setText({ emerging: formatTrendLines(shown.emerging), decreasing: formatTrendLines(shown.decreasing), newThemes: formatTrendLines(shown.newThemes) })
    setEditing(true)
  }
  const done = (r: { ok: boolean; error?: string }) => { if (!r.ok) setError(r.error ?? 'Something went wrong.'); else { setEditing(false); router.refresh() } }
  const field = 'w-full rounded-md border border-white/10 bg-bg-surface px-2 py-1 text-sm text-white'
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-text-muted">
        {draft === null ? 'Not entered yet. Type the trends from the Talkwalker dashboard.'
          : draft.status === 'approved' ? 'Approved, shown to the client' : 'Draft, not shown to the client until approved'}
      </p>
      {editing ? (
        <div className="space-y-2 text-xs text-text-muted">
          <p>One theme per line. End a line with its change, for example <code>theme name +12%</code> or <code>other theme -40%</code>.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {(['emerging', 'decreasing', 'newThemes'] as const).map((k) => (
              <label key={k} className="block">{{ emerging: 'Emerging', decreasing: 'Decreasing', newThemes: 'New themes' }[k]}
                <textarea className={field} rows={8} value={text[k]} onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => start(async () => { setError(null); done(await saveTrendsAction({ clientSlug, range, ...text })) })}
              className="rounded-md bg-white/[0.16] px-3 py-1 font-semibold text-white">{pending ? 'Saving...' : 'Save draft'}</button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className="rounded-md px-3 py-1 font-semibold text-text-muted">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <TrendLists lists={shown} />
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={open} className="rounded-md bg-white/[0.12] px-2.5 py-1 font-semibold text-white">Edit trends</button>
            {draft?.status === 'draft' && caps.canApprove && (
              <button type="button" disabled={pending} onClick={() => start(async () => { setError(null); done(await approveTrendsAction({ clientSlug, range, seen: draft.lists })) })}
                className="rounded-md bg-[#60FF80]/20 px-2.5 py-1 font-semibold text-[#60FF80]">Approve</button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="text-xs text-[#FF4444]">{error}</p>}
    </div>
  )
}
