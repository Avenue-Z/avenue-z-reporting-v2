'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from '@/lib/organic-social/chart-notes/limits'
import { dayLabel, type NoteControls } from '@/lib/organic-social/annotations'
import { Picture } from './annotation-callouts'
import { PILL as BUTTON } from './pill'
import { cn } from '@/lib/utils'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'

/** A day's note already on this chart, as the Add annotation panel needs it: the text and picks to load
 *  (its draft's, else the approved note's) and whether a draft exists. Editors only. */
export type ExistingNote = { text: string; postIds: number[]; draft: boolean }
/** What a save did, for the line shown after it: the day, and what that day had before. */
export type SavedNote = { day: string; had: 'none' | 'draft' | 'approved' }

/** The one line shown after a save (Phase 2c, D18), so it is clear what happened. */
export function savedLine({ day, had }: SavedNote, canApprove: boolean): string {
  const d = dayLabel(day)
  const first = had === 'draft' ? `Updated the draft for ${d}. Clients see it once it's approved.`
    : had === 'approved' ? `Saved a draft for ${d}. Clients keep seeing the approved note until this one is approved.`
    : `Saved a draft for ${d}. Clients see it once it's approved.`
  return canApprove ? `${first} Hover its dot to approve it.` : first
}

/** Add or edit a day's note (Phase 2b, the approved mockup). A new note starts from a post: the month's
 *  posts as pictures with their dates, only days with posts, oldest first, in one row that scrolls
 *  sideways; picking one sets the day, and up to NOTE_MAX_POSTS may be picked, all from that day
 *  (a pick from another day moves there and clears the rest). Editing from a card is fixed to that
 *  card's day: its posts, or the line "No posts went live this day". Saving always lands as a draft;
 *  the action re-checks everything. Staff only, and `no-print`, since Export PDF prints the page. */
export function NoteForm({ controls, fixedDay, initial, notes, onClose, onSaved }: {
  controls: NoteControls
  fixedDay?: string
  initial?: { text: string; postIds: number[] }
  /** This chart's notes by day (Phase 2c, D19). */
  notes?: Record<string, ExistingNote>
  onClose: () => void
  onSaved: (saved: SavedNote) => void
}) {
  const router = useRouter()
  const days = fixedDay ? controls.days.filter((d) => d.day === fixedDay) : controls.days.filter((d) => d.posts.length > 0)
  const posts = days.flatMap((d) => d.posts.map((p) => ({ ...p, day: d.day })))
  const [day, setDay] = useState<string | null>(fixedDay ?? null)
  // A pick Dash no longer returns cannot be shown or unpicked, so it is dropped here. When the posts
  // could not load at all, nothing can be checked, so the note keeps its picks as they are (Paul's
  // review of #273, C4: a failed fetch plus a typo fix used to save the note without its pictures).
  const [picked, setPicked] = useState<number[]>(() => controls.postsFailed
    ? (initial?.postIds ?? [])
    : (initial?.postIds ?? []).filter((id) => posts.some((p) => p.id === id)))
  const [text, setText] = useState(initial?.text ?? '')
  // The text this panel filled in from a day's note (D19). While the user leaves it as it was, it
  // belongs to that day: moving to another day, or unpicking every post, drops it.
  const [loaded, setLoaded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const full = picked.length >= NOTE_MAX_POSTS

  function pick(id: number, postDay: string) {
    // Filled-in text the user left as it was goes with its day (audit, 2026-09-25: moving from 8/22 to
    // 8/19 kept 8/22's note, so a save would have put it on 8/19). Text the user wrote always stays.
    const own = loaded !== null && text === loaded ? '' : text
    if (picked.includes(id)) {
      const rest = picked.filter((x) => x !== id)
      setPicked(rest)
      if (!fixedDay && rest.length === 0) { setDay(null); setText(own); setLoaded(null) }
      return
    }
    if (day !== postDay) {
      setDay(postDay)
      const ex = fixedDay ? undefined : notes?.[postDay]
      if (!ex) { setPicked([id]); setText(own); setLoaded(null); return }
      // Each chart holds one note per day, so a day that already has one loads it and a save updates it,
      // never replacing it silently (Phase 2c, D19; seen live 2026-09-24). Its picks stay (those Dash
      // still returns that day), the new pick joins if there is room, and typed text is never replaced.
      const base = ex.postIds.filter((pid) => posts.some((q) => q.id === pid && q.day === postDay))
      setPicked(base.includes(id) || base.length >= NOTE_MAX_POSTS ? base : [...base, id])
      if (own.trim()) { setText(own); setLoaded(null) } else { setText(ex.text); setLoaded(ex.text) }
      return
    }
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
      const ex = notes?.[day]
      onSaved({ day, had: ex ? (ex.draft ? 'draft' : 'approved') : 'none' })
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
              return (
                <button key={p.id} type="button" aria-pressed={on} aria-label={`Post from ${dayLabel(p.day)}`}
                  disabled={pending || (!on && full && p.day === day)} onClick={() => pick(p.id, p.day)}
                  className="shrink-0 cursor-pointer rounded-md text-center outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40">
                  {/* The card's own Picture, so a purged Dash thumbnail shows the same placeholder here as on
                      the card, not a broken image (Paul's review of #273, C11). The ring marks a pick. */}
                  <span className={cn('block rounded-md', on && 'ring-2 ring-brand-cyan')}>
                    <Picture creative={p.thumb.creative} alt="" tile="h-14 w-14 shrink-0 rounded-md" />
                  </span>
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
        <p className="text-[11px] text-text-muted">
          {controls.postsFailed ? 'Posts could not load, so this note keeps its picked posts.' : 'No posts went live this day'}
        </p>
      )}
      {!fixedDay && day && notes?.[day] && (
        <p className="text-[11px] text-white">
          {notes[day].draft
            ? `${dayLabel(day)} already has a draft. Saving updates it.`
            : `${dayLabel(day)} already has an approved note. Saving drafts a change to it.`}
        </p>
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
