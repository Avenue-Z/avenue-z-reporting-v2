'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction } from '@/app/actions/chart-notes'
import type { ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'

const BUTTON = 'no-print whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'

/** A card's note buttons, for someone who can edit: add or edit the note, delete a draft, and for an
 *  approver, approve a draft or revoke an approved note. Each action re-checks the session. The form
 *  itself opens above the chart (`onEdit`), never inside the card. On a card opened from its dot the visible
 *  words are shorter to fit; the accessible names stay the same everywhere. */
export function NoteActions({ annotation, controls, compact, onEdit }: {
  annotation: ChartAnnotation
  controls: NoteControls
  compact?: boolean
  onEdit: (day: string, initial?: { text: string; postIds: number[] }) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ed = annotation.noteEditor
  const say = (full: string, short: string) => (compact ? short : full)

  const run = (act: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null)
      let r: { ok: boolean; error?: string }
      try { r = await act() } catch { r = { ok: false, error: 'Something went wrong. Try again.' } }
      if (!r.ok) { setError(r.error ?? 'Something went wrong. Try again.'); return }
      router.refresh()
    })

  // Editing opens the day's draft if there is one (the server edits that draft), else the
  // approved text.
  const initial = ed?.draft
    ? { text: ed.draft.text, postIds: ed.draft.postIds }
    : annotation.note ? { text: annotation.note, postIds: ed?.approvedPostIds ?? [] } : undefined

  return (
    <>
      <button type="button" className={BUTTON} disabled={pending} aria-label={ed ? 'Edit note' : 'Add note'}
        onClick={() => onEdit(annotation.date, initial)}>
        {ed ? say('Edit note', 'Edit') : say('Add note', 'Note')}
      </button>
      {ed?.draft && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Approve"
          onClick={() => run(() => approveChartNoteAction(controls.clientSlug, ed.draft!.id, { text: ed.draft!.text, postIds: ed.draft!.postIds }))}>Approve</button>
      )}
      {/* Revoke is refused while a draft is open on the day, so it is offered only when there is none
          (Paul's review of #273, C9): delete or approve the draft first. */}
      {ed?.approvedId && !ed.draft && controls.canApprove && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Revoke"
          onClick={() => run(() => revokeChartNoteAction(controls.clientSlug, ed.approvedId!))}>Revoke</button>
      )}
      {ed?.draft && (
        <button type="button" className={BUTTON} disabled={pending} aria-label="Delete draft"
          onClick={() => run(() => deleteChartNoteDraftAction(controls.clientSlug, ed.draft!.id))}>
          {say('Delete draft', 'Delete')}
        </button>
      )}
      {error && <span role="alert" className="no-print text-[11px] text-red-400">{error}</span>}
    </>
  )
}
