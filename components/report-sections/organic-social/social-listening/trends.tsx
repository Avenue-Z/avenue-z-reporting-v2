'use client'
// Trends in keyword themes, as the approved mockup draws them (docs/social-listening/mock.template.html, #brand-trends):
// Emerging and Decreasing with their changes, New as chips. A client and the PDF see the approved lists only
// (view-model.ts); staff see the draft, edit it as one theme per line, and an approver approves exactly the lists on screen.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useExportMode } from '@/components/export/export-mode'
import { approveTrendsAction, saveTrendsAction } from '@/app/actions/social-listening'
import { formatTrendLines } from '@/lib/organic-social/social-listening/trends'
import type { SlTrendLists } from '@/lib/organic-social/social-listening/types'
import s from './sl.module.css'

const EMPTY: SlTrendLists = { emerging: [], decreasing: [], newThemes: [] }
const signed = (change: string, sign: '+' | '-') => (/^[+-]/.test(change) ? change : `${sign}${change}`)

export function TrendLists({ lists }: { lists: SlTrendLists }) {
  return (
    <div className={s.trendCols}>
      <div>
        <h4 className={s.up}>Emerging</h4>
        <ul className={s.tlist}>
          {lists.emerging.length === 0 ? <li className={s.flat}>None</li> : lists.emerging.map((t) => (
            <li key={t.theme}><span>{t.theme}</span>{t.change && <span className={s.up}>{signed(t.change, '+')}</span>}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className={s.down}>Decreasing</h4>
        <ul className={s.tlist}>
          {lists.decreasing.length === 0 ? <li className={s.flat}>None</li> : lists.decreasing.map((t) => (
            <li key={t.theme}><span>{t.theme}</span>{t.change && <span className={s.down}>{signed(t.change, '-')}</span>}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 style={{ color: '#60FDFF' }}>New</h4>
        <div className={s.chips}>
          {lists.newThemes.length === 0 ? <span className={s.flat}>None</span> : lists.newThemes.map((t) => <span key={t.theme}>{t.theme}</span>)}
        </div>
      </div>
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
  return (
    <div>
      {editing ? (
        <div className={s.pform}>
          {(['emerging', 'decreasing', 'newThemes'] as const).map((k) => (
            <label key={k} className={k === 'newThemes' ? s.wide : undefined}>{{ emerging: 'Emerging', decreasing: 'Decreasing', newThemes: 'New themes' }[k]}
              <textarea rows={7} value={text[k]} onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))} />
            </label>
          ))}
          <div className={`${s.wide} ${s.editRow}`}>
            <button type="button" className={`${s.tbtn} ${s.primary}`} disabled={pending}
              onClick={() => start(async () => { setError(null); done(await saveTrendsAction({ clientSlug, range, ...text })) })}>{pending ? 'Saving...' : 'Save'}</button>
            <button type="button" className={s.tbtn} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
            <span className={s.hint}>One theme per line. End a line with its change, for example <code>theme name +12%</code> or <code>other theme -40%</code>.</span>
          </div>
        </div>
      ) : (
        <>
          <TrendLists lists={shown} />
          <div className={s.editRow}>
            <span className={s.state}>
              {draft === null ? 'Not entered yet. Type the trends from the Talkwalker dashboard.'
                : draft.status === 'approved' ? 'Approved, shown to the client' : 'Draft, not shown to the client until approved'}
            </span>
            <span className={s.spacer} />
            {draft?.status === 'draft' && caps.canApprove && (
              <button type="button" className={s.tbtn} disabled={pending}
                onClick={() => start(async () => { setError(null); done(await approveTrendsAction({ clientSlug, range, seen: draft.lists })) })}>Approve</button>
            )}
            <button type="button" className={s.tbtn} onClick={open}>Edit trends</button>
          </div>
        </>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
    </div>
  )
}
