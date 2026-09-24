'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from '@/lib/organic-social/chart-notes/limits'
import { dayLabel, thumbSrc, type NoteControls } from '@/lib/organic-social/annotations'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'
const BUTTON = 'rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** Add or edit a day's note: the day (fixed when editing), up to NOTE_MAX_POSTS of that day's posts,
 *  and the text. Saving always lands as a draft; the action re-checks everything. Staff only, and
 *  `no-print`, since Export PDF prints the page in front of you. */
export function NoteForm({ controls, fixedDay, initial, onClose }: {
  controls: NoteControls
  fixedDay?: string
  initial?: { text: string; postIds: number[] }
  onClose: () => void
}) {
  const router = useRouter()
  const latest = controls.days[controls.days.length - 1]?.day ?? ''
  const [day, setDay] = useState(fixedDay ?? latest)
  const posts = controls.days.find((d) => d.day === day)?.posts ?? []
  const [text, setText] = useState(initial?.text ?? '')
  // A pick Dash no longer returns cannot be shown or unticked, so it is dropped here.
  const [picked, setPicked] = useState<number[]>((initial?.postIds ?? []).filter((id) => posts.some((p) => p.id === id)))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < NOTE_MAX_POSTS ? [...p, id] : p))

  function save() {
    setError(null)
    startTransition(async () => {
      let r: { ok: boolean; error?: string }
      try {
        r = await saveChartNoteAction({ clientSlug: controls.clientSlug, channel: controls.channel, chart: controls.chart, day, body: text, postIds: picked })
      } catch {
        r = { ok: false, error: 'Could not save. Try again.' }
      }
      if (!r.ok) { setError(r.error ?? 'Could not save. Try again.'); return }
      onClose()
      router.refresh() // re-runs the RSC; the action's revalidateTag already busted the cache
    })
  }

  return (
    <div role="group" aria-label="Note" className="no-print flex w-full flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
      <select aria-label="Day" className={FIELD} value={day} disabled={!!fixedDay}
        onChange={(e) => { setDay(e.target.value); setPicked([]) }}>
        {controls.days.map((d) => (
          <option key={d.day} value={d.day}>
            {dayLabel(d.day)}{d.posts.length ? ` (${d.posts.length} post${d.posts.length === 1 ? '' : 's'})` : ''}
          </option>
        ))}
      </select>
      {posts.map((p, i) => {
        const on = picked.includes(p.id)
        const src = thumbSrc(p.thumb)
        return (
          <label key={p.id} className="flex items-center gap-1 text-[11px] text-text-muted">
            <input type="checkbox" aria-label={`Post ${i + 1}`} checked={on}
              disabled={!on && picked.length >= NOTE_MAX_POSTS} onChange={() => toggle(p.id)} />
            {src ? <img src={src} alt="" className="h-10 w-10 rounded object-cover" /> : <span>No preview</span>}
          </label>
        )
      })}
      <input aria-label="Note text" className={`${FIELD} min-w-[12rem] flex-1`} value={text}
        maxLength={NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder="What happened this day?" />
      <button type="button" className={BUTTON} onClick={save} disabled={pending || !text.trim() || !day}>Save draft</button>
      <button type="button" className={BUTTON} onClick={onClose} disabled={pending}>Cancel</button>
      {error && <p role="alert" className="w-full text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
