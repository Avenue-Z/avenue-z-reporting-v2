'use client'
// The Social Listening tab's analysis box, as on the approved mockup (docs/social-listening/mock.template.html, renderComm):
// a dashed "+ Add analysis" button when empty, a softly tinted card with a small label and Edit once written, a plain text
// box with Save, Cancel and Remove. It is a drop-in for CommentaryPanel (same props, same commentary actions), so drafts,
// approval and history work exactly as on every other box; only this tab uses it (monthlyCommentary's `Panel`).
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveCommentary, deleteCommentaryDraft, revokeCommentary, saveCommentary } from '@/app/actions/commentary'
import { useExportMode } from '@/components/export/export-mode'
import { addText, INSIGHTS_LABELS, type CommentaryLabels } from '@/lib/commentary/labels'
import type { CommentaryCapabilities, CommentaryEntry, CommentaryPeriodHistory } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { analysisHtmlToText, analysisTextToHtml, editorName } from '@/lib/organic-social/social-listening/analysis-text'
import s from '../design/kit.module.css'

type Props = {
  clientSlug: string
  viewKey: CommentaryViewKey
  entries: CommentaryEntry[]
  initialId: string | null
  clientEntryId: string | null
  capabilities: CommentaryCapabilities
  history: CommentaryPeriodHistory[]
  defaultPeriod?: { start: string; end: string }
  emptyText?: string
  entryNotes?: Record<string, string>
  labels?: CommentaryLabels
}

function Body({ html }: { html: string }) {
  // The HTML was sanitized on the server when it was saved (lib/commentary/sanitize.ts), as every commentary box shows it.
  return <div className={s.commBody} dangerouslySetInnerHTML={{ __html: html }} />
}

export function SlAnalysis({ clientSlug, viewKey, entries, initialId, clientEntryId, capabilities, history, defaultPeriod, entryNotes, labels = INSIGHTS_LABELS }: Props) {
  const router = useRouter()
  const exportMode = useExportMode()
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pending, start] = useTransition()
  const selected = entries.find((e) => e.id === initialId) ?? null

  // The PDF prints what the client sees, whoever exports.
  if (exportMode) {
    const shown = entries.find((e) => e.id === clientEntryId) ?? null
    if (!shown) return null
    return (
      <div className={`${s.comm} ${s.commClient}`} data-export-block="">
        <div className={s.commHead}><span className={s.lbl}>{labels.title}</span></div>
        <Body html={shown.bodyHtml} />
      </div>
    )
  }

  const staff = capabilities.canEdit
  const done = (r: { ok: boolean; error?: string }) => {
    if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
    setEditing(null)
    setError(null)
    router.refresh()
  }
  const run = (f: () => Promise<{ ok: boolean; error?: string } | void>) => start(async () => { done((await f()) ?? { ok: true }) })
  const open = (target: 'new' | CommentaryEntry) => {
    setText(target === 'new' ? '' : analysisHtmlToText(target.bodyHtml))
    setError(null)
    setEditing(target === 'new' ? 'new' : target.id)
  }

  if (editing !== null) {
    const entry = editing === 'new' ? null : entries.find((e) => e.id === editing) ?? null
    const period = entry ? { start: entry.periodStart, end: entry.periodEnd } : defaultPeriod
    const save = () => {
      const bodyHtml = analysisTextToHtml(text)
      if (!bodyHtml) { setError('Write something first, or Cancel.'); return }
      if (!period) { setError('No reporting month to save this for.'); return }
      run(() => saveCommentary({ ...(entry ? { id: entry.id } : {}), clientSlug, viewKey, bodyHtml, periodStart: period.start, periodEnd: period.end }))
    }
    return (
      <div className={s.comm}>
        <div className={s.commHead}><span className={s.lbl}>{labels.title}</span><span className={s.by}>Editing</span></div>
        <textarea className={s.editArea} aria-label={`${labels.title} text`} placeholder="What stands out this month and why"
          value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className={s.editRow}>
          <button type="button" className={`${s.tbtn} ${s.primary}`} onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>
          <button type="button" className={s.tbtn} onClick={() => { setEditing(null); setError(null) }} disabled={pending}>Cancel</button>
          {entry?.status === 'draft' && (
            <button type="button" className={`${s.tbtn} ${s.ghost}`} disabled={pending}
              onClick={() => { if (window.confirm('Remove this draft? It stays recoverable in the approver history log.')) run(() => deleteCommentaryDraft(clientSlug, entry.id)) }}>
              Remove analysis
            </button>
          )}
          <span className={s.hint}>Start a line with # for a heading. Leave a blank line between paragraphs.</span>
        </div>
        {error && <p role="alert" className={s.statusError}>{error}</p>}
      </div>
    )
  }

  if (!selected) {
    return staff ? <button type="button" className={`${s.tbtn} ${s.addAnalysis}`} onClick={() => open('new')}>+ {addText(labels)}</button> : null
  }

  return (
    <div className={staff ? s.comm : `${s.comm} ${s.commClient}`}>
      <div className={s.commHead}>
        <span className={s.lbl}>{labels.title}</span>
        {staff && <span className={s.by}>{editorName(selected.updatedBy)}</span>}
        {staff && (selected.status === 'approved' ? <span className={s.approved}>Approved</span> : <span className={s.edited}>Draft</span>)}
        {staff && entryNotes?.[selected.id] && <span className={s.by}>{entryNotes[selected.id]}</span>}
        <span className={s.spacer} />
        {staff && (
          <>
            {capabilities.canApprove && selected.status === 'draft' && (
              <button type="button" className={s.tbtn} disabled={pending} onClick={() => run(() => approveCommentary(clientSlug, selected.id))}>Approve</button>
            )}
            {capabilities.canApprove && selected.status === 'approved' && (
              <button type="button" className={`${s.tbtn} ${s.ghost}`} disabled={pending} onClick={() => run(() => revokeCommentary(clientSlug, selected.id))}>Revoke</button>
            )}
            <button type="button" className={s.tbtn} onClick={() => open(selected)}>Edit</button>
          </>
        )}
      </div>
      <Body html={selected.bodyHtml} />
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {capabilities.canApprove && history.length > 0 && (
        <div className={s.history}>
          <button type="button" onClick={() => setHistoryOpen((h) => !h)}>{historyOpen ? '▾' : '▸'} History ({history.reduce((n, g) => n + g.versions.length, 0)} versions)</button>
          {historyOpen && (
            <ul>
              {history.flatMap((g) => g.versions).map(({ entry, tag }) => (
                <li key={entry.id}><b>{tag}</b> · {editorName(entry.deletedBy ?? entry.approvedBy ?? entry.updatedBy)}: {analysisHtmlToText(entry.bodyHtml).slice(0, 140)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
