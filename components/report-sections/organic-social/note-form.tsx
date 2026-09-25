'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from '@/lib/organic-social/chart-notes/limits'
import { dayLabel, thumbSrc, type NoteControls } from '@/lib/organic-social/annotations'
import { cn } from '@/lib/utils'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'
const BUTTON = 'rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** Add or edit a day's note (Phase 2b, the approved mockup). A new note starts from a post: the month's
 *  posts as pictures with their dates, only days with posts, oldest first, in one row that scrolls
 *  sideways; picking one sets the day, and up to NOTE_MAX_POSTS may be picked, all from that day
 *  (a pick from another day moves there and clears the rest). Editing from a card is fixed to that
 *  card's day: its posts, or the line "No posts went live this day". Saving always lands as a draft;
 *  the action re-checks everything. Staff only, and `no-print`, since Export PDF prints the page. */
export function NoteForm({ controls, fixedDay, initial, onClose }: {
  controls: NoteControls
  fixedDay?: string
  initial?: { text: string; postIds: number[] }
  onClose: () => void
}) {
  const router = useRouter()
  const days = fixedDay ? controls.days.filter((d) => d.day === fixedDay) : controls.days.filter((d) => d.posts.length > 0)
  const posts = days.flatMap((d) => d.posts.map((p) => ({ ...p, day: d.day })))
  const [day, setDay] = useState<string | null>(fixedDay ?? null)
  // A pick Dash no longer returns cannot be shown or unpicked, so it is dropped here.
  const [picked, setPicked] = useState<number[]>(() => (initial?.postIds ?? []).filter((id) => posts.some((p) => p.id === id)))
  const [text, setText] = useState(initial?.text ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const full = picked.length >= NOTE_MAX_POSTS

  function pick(id: number, postDay: string) {
    if (picked.includes(id)) {
      const rest = picked.filter((x) => x !== id)
      setPicked(rest)
      if (!fixedDay && rest.length === 0) setDay(null)
      return
    }
    if (day !== postDay) { setDay(postDay); setPicked([id]); return }
    if (!full) setPicked([...picked, id])
  }

  // A new note's day comes only from picking a post (and goes when every pick is undone), so no day
  // means no post yet; an edit is already on its card's day. Either way it also needs text.
  const canSave = !pending && !!text.trim() && !!day

  function save() {
    if (!day) return
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
    <div role="group" aria-label="Note" className="no-print w-full space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
      {posts.length > 0 ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-dark">
            {posts.map((p) => {
              const on = picked.includes(p.id)
              const src = thumbSrc(p.thumb)
              return (
                <button key={p.id} type="button" aria-pressed={on} aria-label={`Post from ${dayLabel(p.day)}`}
                  disabled={pending || (!on && full && p.day === day)} onClick={() => pick(p.id, p.day)}
                  className="shrink-0 cursor-pointer rounded-md text-center outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40">
                  {src
                    ? <img src={src} alt="" className={cn('h-14 w-14 rounded-md object-cover', on && 'ring-2 ring-brand-cyan')} />
                    : <span className={cn('flex h-14 w-14 items-center justify-center rounded-md bg-white/[0.04] text-[10px] text-text-muted', on && 'ring-2 ring-brand-cyan')}>No preview</span>}
                  <span className={cn('mt-1 block text-[11px]', on ? 'text-white' : 'text-text-muted')}>{dayLabel(p.day)}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-text-muted">
            {full ? `Up to ${NOTE_MAX_POSTS} posts` : fixedDay ? `Pick up to ${NOTE_MAX_POSTS} of this day's posts` : 'Pick a post, then write what happened'}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-text-muted">No posts went live this day</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Note text" className={`${FIELD} min-w-[12rem] flex-1`} value={text}
          maxLength={NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder="What happened this day?" />
        <span className="text-[11px] text-text-muted" aria-live="polite">{[...text].length}/{NOTE_MAX_CHARS}</span>
        <button type="button" className={BUTTON} onClick={save} disabled={!canSave}>Save draft</button>
        <button type="button" className={BUTTON} onClick={onClose} disabled={pending}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
