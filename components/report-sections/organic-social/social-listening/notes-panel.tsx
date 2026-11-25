'use client'

// The notes under a Social Listening graph (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit E;
// spec F6). A client, and every PDF, sees each approved note as a numbered line matching its mark on the graph, and
// nothing when there is none. Someone who can edit gets Add annotation and every noted day or month with the Organic
// Social notes' own buttons (note-actions.tsx, imported, not changed). The form is this tab's own: it saves on a day of
// the graph, or a month's 1st, with no posts. Same draft and approve steps as every chart note.
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChartNoteAction } from '@/app/actions/chart-notes'
import { NOTE_MAX_CHARS } from '@/lib/organic-social/chart-notes/limits'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import { isSlMonthNoteChart, SL_NOTES_CHANNEL, type SlChartNotes, type SlNoteControls, type SlNoteRow } from '@/lib/organic-social/social-listening/notes-keys'
import { NoteActions } from '../note-actions'
import { PILL as BUTTON } from '../pill'
import f from '../design/frames.module.css'

const FIELD = 'rounded-md border border-white/[0.12] bg-transparent px-2 py-1 text-xs text-white'
/** How long the line after a save stays, as on the other notes (ytd-notes-panel.tsx). */
const SAVED_LINE_MS = 8000
type Had = 'none' | 'draft' | 'approved'

function savedLine(label: string, had: Had, canApprove: boolean): string {
  const first = had === 'draft' ? `Updated the draft for ${label}. Clients see it once it's approved.`
    : had === 'approved' ? `Saved a draft for ${label}. Clients keep seeing the approved note until this one is approved.`
    : `Saved a draft for ${label}. Clients see it once it's approved.`
  return canApprove ? `${first} Approve it in the list below.` : first
}

export function SlNotesPanel({ notes, title }: { notes: SlChartNotes; title: string }) {
  if (notes.controls) return <EditorPanel notes={notes} controls={notes.controls} title={title} />
  if (notes.marks.length === 0) return null
  return (
    <ol aria-label={`Notes on ${title}`} className={f.noteList}>
      {notes.marks.map((m) => (
        <li key={m.at} data-export-block="">
          <span className={f.noteBadge}>{m.n}</span>
          <span>{`${m.label}: ${m.text}`}</span>
        </li>
      ))}
    </ol>
  )
}

function EditorPanel({ notes, controls, title }: { notes: SlChartNotes; controls: SlNoteControls; title: string }) {
  const month = isSlMonthNoteChart(controls.chart)
  const dayOf = (key: string) => (month ? `${key}-01` : key)
  const [form, setForm] = useState<{ fixed?: string; initial?: string } | null>(null)
  const [saved, setSavedState] = useState<string | null>(null)
  const savedClock = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSaved = (next: string | null) => {
    if (savedClock.current) clearTimeout(savedClock.current)
    savedClock.current = next ? setTimeout(() => { savedClock.current = null; setSavedState(null) }, SAVED_LINE_MS) : null
    setSavedState(next)
  }
  useEffect(() => () => { if (savedClock.current) clearTimeout(savedClock.current) }, [])
  // A key saved on this page whose refreshed answer has not arrived: its Approve, Revoke and Delete wait (note-actions.tsx).
  const [justSaved, setJustSaved] = useState<ReadonlySet<string>>(new Set())
  const [answer, setAnswer] = useState(notes.panel)
  if (notes.panel !== answer) { setAnswer(notes.panel); setJustSaved(new Set()) }
  const rows = new Map(notes.panel.map((r) => [r.key, r]))
  const keyOf = (day: string) => (month ? day.slice(0, 7) : day)
  const onEdit = (day: string, initial?: { text: string }) => { setSaved(null); setForm({ fixed: keyOf(day), initial: initial?.text }) }
  const asAnnotation = (r: SlNoteRow): ChartAnnotation => ({
    date: dayOf(r.key), value: 0, label: r.label, thumb: null,
    ...(r.text !== null ? { note: r.text } : {}),
    ...(r.editor ? { noteEditor: r.editor } : {}),
  })

  return (
    <div className="no-print mt-3 space-y-2">
      <button type="button" className={BUTTON} aria-expanded={!!form} onClick={() => { setSaved(null); setForm((x) => (x ? null : {})) }}>
        Add annotation
      </button>
      {form && (
        <NoteForm key={form.fixed ?? 'new'} controls={controls} month={month} fixed={form.fixed} initial={form.initial} rows={rows}
          onClose={() => setForm(null)}
          onSaved={(key, had) => {
            setForm(null)
            setSaved(savedLine(controls.options.find((o) => o.key === key)?.label ?? key, had, controls.canApprove))
            setJustSaved((x) => new Set(x).add(key))
          }} />
      )}
      {saved && !form && <p role="status" className="text-xs text-text-muted">{saved}</p>}
      {notes.panel.length > 0 && (
        <ul aria-label={`Notes on ${title}`} className="space-y-1">
          {notes.panel.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 text-xs">
              {r.n !== null && <span className={f.noteBadge}>{r.n}</span>}
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

/** Add a note on a day (or month) of the graph, or edit one (fixed to it). Always saves a draft with no posts. */
function NoteForm({ controls, month, fixed, initial, rows, onClose, onSaved }: {
  controls: SlNoteControls; month: boolean; fixed?: string; initial?: string; rows: Map<string, SlNoteRow>
  onClose: () => void; onSaved: (key: string, had: Had) => void
}) {
  const router = useRouter()
  const [key, setKey] = useState(fixed ?? '')
  const [text, setText] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const labelOf = (k: string) => controls.options.find((o) => o.key === k)?.label ?? k
  const existing = key ? rows.get(key) : undefined
  const unit = month ? 'Month' : 'Day'

  function save() {
    if (!key) return
    setError(null)
    startTransition(async () => {
      let r: { ok: boolean; error?: string }
      try {
        r = await saveChartNoteAction({ clientSlug: controls.clientSlug, channel: SL_NOTES_CHANNEL, chart: controls.chart, day: month ? `${key}-01` : key, body: text, postIds: [] })
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
          {unit}
          <select aria-label={unit} value={key} disabled={pending} onChange={(e) => setKey(e.target.value)}
            className="rounded-md border border-white/[0.12] bg-bg-surface px-2 py-1 text-xs text-white">
            <option value="">{`Pick a ${unit.toLowerCase()}`}</option>
            {controls.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
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
          maxLength={NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder={month ? 'What happened this month?' : 'What happened this day?'} />
        <span className="text-[11px] text-text-muted" aria-live="polite">{[...text].length}/{NOTE_MAX_CHARS}</span>
        <button type="button" className={BUTTON} onClick={save} disabled={pending || !key || !text.trim()}>Save draft</button>
        <button type="button" className={BUTTON} onClick={onClose} disabled={pending}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
