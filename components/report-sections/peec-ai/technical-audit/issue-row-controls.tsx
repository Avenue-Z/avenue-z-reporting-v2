'use client'
// Staff-only controls for one issue row: hide/unhide and an inline note editor. Never rendered for a client or in the
// PDF export (the list decides). Errors show inline; no window.confirm (browser dialogs break the headless export).
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setIssueOverride } from '@/app/actions/tech-audit'

const NOTE_MAX = 280
const BAD = '#FF4444'
const BTN = 'rounded-full px-3 py-1 text-xs font-bold text-white disabled:opacity-50'

export function IssueRowControls({ clientSlug, issueKey, hidden, note }: {
  clientSlug: string
  issueKey: string
  hidden: boolean
  note: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save(patch: { hidden?: boolean; note?: string | null }, done?: () => void) {
    setError(null)
    start(async () => {
      const r = await setIssueOverride({ clientSlug, issueKey, ...patch })
      if (!r.ok) { setError(r.error); return }
      done?.()
      router.refresh()
    })
  }

  return (
    <div data-print-hidden className="mt-2 flex flex-col gap-2">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => save({ hidden: !hidden })} className={BTN} style={{ background: '#3a3a3a' }}>
          {hidden ? 'Unhide' : 'Hide'}
        </button>
        {!editing && (
          <button type="button" disabled={pending} onClick={() => { setDraft(note ?? ''); setError(null); setEditing(true) }} className={BTN} style={{ background: '#3a3a3a' }}>
            {note ? 'Edit note' : 'Add note'}
          </button>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label="Note"
            value={draft}
            maxLength={NOTE_MAX}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white"
          />
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending} onClick={() => save({ note: draft }, () => setEditing(false))} className={BTN} style={{ background: '#60FF80', color: '#000' }}>
              Save note
            </button>
            <button type="button" disabled={pending} onClick={() => { setError(null); setEditing(false) }} className={BTN} style={{ background: '#3a3a3a' }}>
              Cancel
            </button>
            <span className="text-xs text-text-muted">{draft.length}/{NOTE_MAX}</span>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs" style={{ color: BAD }}>{error}</p>}
    </div>
  )
}
