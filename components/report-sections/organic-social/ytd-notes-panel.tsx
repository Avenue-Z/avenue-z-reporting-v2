'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS } from '@/lib/organic-social/chart-notes/limits'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { YtdGraphNotes, YtdNoteControls, YtdNoteRow } from './parts/ytd-notes'
import { NoteActions } from './note-actions'
import { PILL as BUTTON } from './pill'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'
/** How long the line after a save stays, as on the daily graphs (trends.tsx, SAVED_LINE_MS). */
const SAVED_LINE_MS = 8000

type Had = 'none' | 'draft' | 'approved'

/** The one line shown after a save, the YTD form of the daily graphs' line (note-form.tsx, savedLine). */
export function ytdSavedLine(label: string, had: Had, canApprove: boolean): string {
  const first = had === 'draft' ? `Updated the draft for ${label}. Clients see it once it's approved.`
    : had === 'approved' ? `Saved a draft for ${label}. Clients keep seeing the approved note until this one is approved.`
    : `Saved a draft for ${label}. Clients see it once it's approved.`
  return canApprove ? `${first} Approve it in the list below.` : first
}

/** The notes under one YTD graph (spec 2026-10-06-os-ytd-notes-design.md). A viewer who cannot edit sees each approved
 *  note the chart cannot show on a point as a line, and nothing when there is none; this part uses no hooks, so it
 *  renders anywhere. An editor gets the Add annotation form and every noted month with the daily graphs' buttons. */
export function YtdNotesPanel({ notes, title }: { notes: YtdGraphNotes; title: string }) {
  if (notes.controls) return <EditorPanel notes={notes} controls={notes.controls} title={title} />
  if (notes.panel.length === 0) return null
  return (
    <ul aria-label={`Notes on ${title}`} className="space-y-1 text-xs text-text-muted">
      {notes.panel.map((r) => <li key={r.key}>{`${r.label}: ${r.text}`}</li>)}
    </ul>
  )
}

/** What the daily graphs' buttons read from a note (note-actions.tsx): its day (the month's 1st), its approved text and
 *  the editor state. A YTD note has no value and no picture. */
const asAnnotation = (r: YtdNoteRow): ChartAnnotation => ({
  date: `${r.key}-01`, value: 0, label: r.label, thumb: null,
  ...(r.text !== null ? { note: r.text } : {}),
  ...(r.editor ? { noteEditor: r.editor } : {}),
})

function EditorPanel({ notes, controls, title }: { notes: YtdGraphNotes; controls: YtdNoteControls; title: string }) {
  const [form, setForm] = useState<{ fixed?: string; initial?: string } | null>(null)
  const [saved, setSavedState] = useState<string | null>(null)
  // The line after a save clears after SAVED_LINE_MS, as on the daily graphs (trends.tsx), so it never outlives what it
  // says ("Approve it in the list below" after the note is approved). Opening the form clears it too.
  const savedClock = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSaved = (next: string | null) => {
    if (savedClock.current) clearTimeout(savedClock.current)
    savedClock.current = next ? setTimeout(() => { savedClock.current = null; setSavedState(null) }, SAVED_LINE_MS) : null
    setSavedState(next)
  }
  useEffect(() => () => { if (savedClock.current) clearTimeout(savedClock.current) }, [])
  // Months saved on this page whose refreshed answer has not arrived: their Approve, Revoke and Delete wait, as on the
  // daily card (note-actions.tsx, trends.tsx). A new answer from the server clears them.
  const [justSaved, setJustSaved] = useState<ReadonlySet<string>>(new Set())
  const [answer, setAnswer] = useState(notes.panel)
  if (notes.panel !== answer) {
    setAnswer(notes.panel)
    setJustSaved(new Set())
  }
  const rows = new Map(notes.panel.map((r) => [r.key, r]))
  const onEdit = (day: string, initial?: { text: string }) => { setSaved(null); setForm({ fixed: day.slice(0, 7), initial: initial?.text }) }

  return (
    <div className="no-print space-y-2">
      <button type="button" className={BUTTON} aria-expanded={!!form} onClick={() => { setSaved(null); setForm((f) => (f ? null : {})) }}>
        Add annotation
      </button>
      {form && (
        <MonthForm key={form.fixed ?? 'new'} controls={controls} fixed={form.fixed} initial={form.initial} rows={rows}
          onClose={() => setForm(null)}
          onSaved={(key, had) => {
            setForm(null)
            setSaved(ytdSavedLine(controls.months.find((m) => m.key === key)?.label ?? key, had, controls.canApprove))
            setJustSaved((s) => new Set(s).add(key))
          }} />
      )}
      {saved && !form && <p role="status" className="text-xs text-text-muted">{saved}</p>}
      {notes.panel.length > 0 && (
        <ul aria-label={`Notes on ${title}`} className="space-y-1">
          {notes.panel.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-white">{r.label}</span>
              {r.text !== null && <span className="text-white">{r.text}</span>}
              {r.editor?.draft && <span className="text-text-muted">{`Draft: ${r.editor.draft.text}`}</span>}
              <NoteActions annotation={asAnnotation(r)} controls={controls} compact onEdit={onEdit} saving={justSaved.has(r.key)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Add a month's note, or edit one (fixed to that month). Always saves a draft, on the month's 1st, with no posts. */
function MonthForm({ controls, fixed, initial, rows, onClose, onSaved }: {
  controls: YtdNoteControls
  fixed?: string
  initial?: string
  rows: Map<string, YtdNoteRow>
  onClose: () => void
  onSaved: (key: string, had: Had) => void
}) {
  const router = useRouter()
  const [key, setKey] = useState(fixed ?? '')
  const [text, setText] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const labelOf = (k: string) => controls.months.find((m) => m.key === k)?.label ?? k
  const existing = key ? rows.get(key) : undefined
  const canSave = !pending && !!key && !!text.trim()

  function save() {
    if (!key) return
    setError(null)
    startTransition(async () => {
      let r: { ok: boolean; error?: string }
      try {
        r = await saveChartNoteAction({ clientSlug: controls.clientSlug, channel: controls.channel, chart: controls.chart, day: `${key}-01`, body: text, postIds: [] })
      } catch {
        r = { ok: false, error: 'Could not save. Try again.' }
      }
      if (!r.ok) { setError(r.error ?? 'Could not save. Try again.'); return }
      onSaved(key, existing?.editor?.draft ? 'draft' : existing && existing.text !== null ? 'approved' : 'none')
      router.refresh()
    })
  }

  return (
    <div role="group" aria-label="Note" className="w-full space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
      {fixed ? (
        <p className="text-[11px] text-text-muted">{`Note for ${labelOf(fixed)}`}</p>
      ) : (
        <label className="flex items-center gap-2 text-[11px] text-text-muted">
          Month
          <select aria-label="Month" value={key} disabled={pending} onChange={(e) => setKey(e.target.value)}
            className="rounded-md border border-white/[0.12] bg-bg-surface px-2 py-1 text-xs text-white">
            <option value="">Pick a month</option>
            {controls.months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      )}
      {!fixed && existing && (
        <p className="text-[11px] text-white">
          {existing.editor?.draft
            ? `${labelOf(key)} already has a draft. Saving updates it.`
            : `${labelOf(key)} already has an approved note. Saving drafts a change to it.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Note text" className={`${FIELD} min-w-[12rem] flex-1`} value={text}
          maxLength={NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder="What happened this month?" />
        <span className="text-[11px] text-text-muted" aria-live="polite">{[...text].length}/{NOTE_MAX_CHARS}</span>
        <button type="button" className={BUTTON} onClick={save} disabled={!canSave}>Save draft</button>
        <button type="button" className={BUTTON} onClick={onClose} disabled={pending}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
