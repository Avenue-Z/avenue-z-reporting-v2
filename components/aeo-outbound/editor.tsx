'use client'
// The snapshot editor (spec §9a, §10): the report in a sandboxed srcdoc iframe, a sticky toolbar, and the notes
// drawer. The iframe never saves anything itself: it posts {type:'dirty'|'edit'} here, and this page owns the one
// SaveQueue that PATCHes the slots route. Live and revoked rows load the preview and never attach a queue.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { approveSnapshotAction, copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { DECISIONS, NEEDS_VALIDATION } from '@/lib/aeo-outbound/config'
import { MAX_RECIPIENT } from '@/lib/aeo-outbound/recipient'
import type { DisplayStatus } from '@/lib/aeo-outbound/store'
import { requestGenerate } from './generate-client'
import { StatusPill, btnCls, cardCls } from './hub'
import {
  APPROVE_CONFIRM, DISCARD_CONFIRM, FLUSH_WAIT, GENERATING_EDITOR, GONE, NEEDS_VALIDATION_FIRST,
  RECIPIENT_EXAMPLE, RECIPIENT_LABEL, REVOKE_CONFIRM, VIEW_FAILED, actionError,
} from './messages'
import { RETRY_MESSAGE, SaveQueue, type SaveState, type SendResult } from './save-queue'
import { snapshotUrl } from './status'

export interface OutboundEditorProps {
  id: string
  brand: string
  projectId: string
  status: DisplayStatus
  revision: number
  notes: string[]
  needsValidation: string[]
  token: string | null
  error: string | null
}

const FLUSH_WAIT_MS = 2000
const POLL_MS = 100
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

type Dialog = { recipient: string; error: string | null; sending: boolean }

export function OutboundEditor(props: OutboundEditorProps) {
  const { id, brand, projectId } = props
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const queueRef = useRef<SaveQueue | null>(null)

  // Local status and token follow the server's on each refresh, and move ahead of it after an approve or revoke.
  const [status, setStatus] = useState(props.status)
  const [seenStatus, setSeenStatus] = useState(props.status)
  if (props.status !== seenStatus) { setSeenStatus(props.status); setStatus(props.status) }
  const [approvedToken, setApprovedToken] = useState<string | null>(null)
  const token = approvedToken ?? props.token

  const [html, setHtml] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [notes, setNotes] = useState(props.notes)
  const [needsValidation, setNeedsValidation] = useState(props.needsValidation)
  const [save, setSave] = useState<SaveState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const showsReport = status === 'draft' || status === 'live' || status === 'revoked'

  // The report HTML: editable for a draft, the preview (no share button inside srcdoc) for live and revoked.
  useEffect(() => {
    if (!showsReport) return
    let live = true
    const url = `/api/aeo-outbound/reports/${id}/view${status === 'draft' ? '' : '?mode=preview'}`
    setViewError(null)
    fetch(url)
      .then(async (res) => {
        if (!live) return
        if (res.status === 404) return setViewError(GONE)
        if (!res.ok) return setViewError(VIEW_FAILED)
        const text = await res.text()
        if (live) setHtml(text)
      })
      .catch(() => { if (live) setViewError(VIEW_FAILED) })
    return () => { live = false }
  }, [id, status, showsReport])

  // One save queue per draft. Leaving draft (an approve) stops it.
  useEffect(() => {
    if (status !== 'draft') return
    const send = async (path: string, value: string, revision: number): Promise<SendResult> => {
      const res = await fetch(`/api/aeo-outbound/reports/${id}/slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value, revision }),
      })
      if (res.status === 200) {
        const b = (await res.json()) as { revision?: unknown; notes?: unknown; needsValidation?: unknown }
        if (!Number.isInteger(b.revision)) return { kind: 'retry' }
        if (isStrings(b.notes)) setNotes(b.notes)
        if (isStrings(b.needsValidation)) setNeedsValidation(b.needsValidation)
        return { kind: 'ok', revision: b.revision as number }
      }
      if (res.status === 400) {
        const b = (await res.json().catch(() => ({}))) as { error?: unknown }
        return { kind: 'bad', error: typeof b.error === 'string' ? b.error : 'bad-request' }
      }
      if (res.status === 403 || res.status === 404 || res.status === 409) return { kind: 'stop' }
      return { kind: 'retry' }
    }
    const q = new SaveQueue(send, props.revision, setSave)
    queueRef.current = q
    setSave(q.state)
    return () => {
      q.stop('')
      if (queueRef.current === q) queueRef.current = null
    }
    // The revision seeds the queue once; the queue carries every later revision itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status])

  // Messages from the iframe, and only from it: a sandboxed iframe's origin is null, so its window is the check.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const q = queueRef.current
      const d = e.data as { type?: unknown; path?: unknown; value?: unknown } | null
      if (!q || !d || typeof d !== 'object' || typeof d.path !== 'string') return
      if (d.type === 'dirty') q.markDirty(d.path)
      else if (d.type === 'edit' && typeof d.value === 'string') q.edit(d.path, d.value)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (status !== 'generating') return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const blockedByValidation = DECISIONS.needsValidationBlocksApprove && needsValidation.length > 0
  const busySaving = !save || save.dirty || save.saving || save.stopped
  const approveDisabled = busySaving || blockedByValidation || busy
  const approveTitle = blockedByValidation ? NEEDS_VALIDATION_FIRST : busySaving ? FLUSH_WAIT : undefined

  async function onApprove() {
    const q = queueRef.current
    if (!q) return
    setMessage(null)
    iframeRef.current?.contentWindow?.postMessage({ type: 'flush' }, '*')
    for (let waited = 0; waited < FLUSH_WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS)
      if (!q.state.dirty && !q.state.saving) break
    }
    if (q.state.dirty || q.state.saving || q.state.stopped) return setMessage(FLUSH_WAIT)
    setDialog({ recipient: '', error: null, sending: false })
  }

  async function onConfirm() {
    const q = queueRef.current
    if (!dialog || !q) return
    // The dialog re-checks before sending, and always sends the last saved revision (spec §9a).
    if (q.state.dirty || q.state.saving || q.state.stopped) return setDialog({ ...dialog, error: FLUSH_WAIT })
    setDialog({ ...dialog, error: null, sending: true })
    const r = await approveSnapshotAction(id, q.state.revision, dialog.recipient)
    if (!r.ok) return setDialog({ ...dialog, sending: false, error: actionError(r.error) })
    setDialog(null)
    setApprovedToken(r.token)
    setStatus('live')
    router.refresh()
  }

  async function run(fn: () => Promise<void>) {
    setMessage(null)
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const onRerun = () => run(async () => {
    const out = await requestGenerate({ projectId, rerunOf: id })
    if (out.kind === 'open') return router.push(`/tools/new-business/${out.id}`)
    setMessage(out.text || null)
    if (out.kind === 'message' && out.refresh) router.refresh()
  })

  const onEditCopy = () => run(async () => {
    const r = await copySnapshotAsDraftAction(id)
    if (r.ok) router.push(`/tools/new-business/${r.id}`)
    else setMessage(actionError(r.error))
  })

  const onRevoke = () => {
    if (!window.confirm(REVOKE_CONFIRM)) return
    void run(async () => {
      const r = await revokeSnapshotAction(id)
      if (!r.ok) return setMessage(actionError(r.error))
      setStatus('revoked')
      router.refresh()
    })
  }

  const onDiscard = () => {
    if (!window.confirm(DISCARD_CONFIRM)) return
    void run(async () => {
      const r = await discardSnapshotAction(id)
      if (r.ok) router.push('/tools/new-business')
      else setMessage(actionError(r.error))
    })
  }

  let saveText: string | null = null
  if (status === 'draft' && save && !save.stopped) {
    if (save.error) {
      const field = save.error !== RETRY_MESSAGE ? save.badPaths.at(-1) : undefined
      saveText = field ? `${field}: ${save.error}` : save.error
    } else if (save.saving || save.dirty) saveText = 'Saving…'
    else if (save.revision !== props.revision) saveText = 'Saved'
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-black px-8 py-3">
        <Link href="/tools/new-business" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden />Back
        </Link>
        <span className="text-sm font-semibold text-white">{brand}</span>
        <StatusPill status={status} error={props.error} />
        {saveText && <span className="text-xs text-text-muted" aria-live="polite">{saveText}</span>}
        {status === 'draft' && save?.stopped && (
          <span className="inline-flex items-center gap-2 text-xs text-[#FF6B6B]">
            {save.error}
            <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>
          </span>
        )}
        {message && <span className="text-xs text-[#FF6B6B]">{message}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {status === 'draft' && (
            <button type="button" className={btnCls} disabled={approveDisabled} title={approveTitle} onClick={() => void onApprove()}>
              Approve
            </button>
          )}
          {status === 'live' && (
            <>
              <button type="button" className={btnCls} disabled={!token}
                onClick={() => token && void navigator.clipboard?.writeText(snapshotUrl(window.location.origin, token))}>
                Copy link
              </button>
              <button type="button" className={btnCls} disabled={busy} onClick={onRevoke}>Revoke</button>
            </>
          )}
          {(status === 'live' || status === 'revoked') && (
            <button type="button" className={btnCls} disabled={busy} onClick={() => void onEditCopy()}>Edit a copy</button>
          )}
          {status !== 'generating' && (
            <button type="button" className={btnCls} disabled={busy} onClick={() => void onRerun()}>Rerun</button>
          )}
          {status === 'failed' && (
            <button type="button" className={btnCls} disabled={busy} onClick={onDiscard}>Discard</button>
          )}
          {showsReport && (
            <>
              <button type="button" className={btnCls} aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>Notes</button>
              <a href={`/api/aeo-outbound/reports/${id}/view?mode=preview`} target="_blank" rel="noopener noreferrer"
                className={`${btnCls} inline-flex items-center gap-1`}>
                Open full size<ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </>
          )}
        </div>
      </div>

      {status === 'generating' && <div className={cardCls}><p className="text-sm text-white">{GENERATING_EDITOR}</p></div>}
      {status === 'failed' && <div className={cardCls}><p className="text-sm text-[#FF6B6B]">{props.error}</p></div>}

      {showsReport && (
        <div className="relative">
          {viewError && (
            <p className="mb-2 flex items-center gap-2 text-sm text-[#FF6B6B]">
              {viewError}
              {viewError !== GONE && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
            </p>
          )}
          <iframe
            ref={iframeRef}
            title={brand}
            sandbox="allow-scripts"
            srcDoc={html ?? ''}
            className="w-full rounded-lg bg-white"
            style={{ height: 'calc(100vh - 140px)' }}
          />
          {notesOpen && (
            <aside className="absolute right-0 top-0 z-10 max-h-full w-80 overflow-y-auto rounded-lg border border-white/[0.08] bg-bg-surface p-4 shadow-xl">
              <h2 className="mb-2 text-sm font-semibold text-white">Notes</h2>
              <ul className="space-y-2 text-xs text-text-muted">
                {needsValidation.map((p) => <li key={`nv-${p}`} className="text-[#FFFC60]">{NEEDS_VALIDATION}: {p}</li>)}
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </aside>
          )}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="aeo-approve-text" className={`${cardCls} w-full max-w-md`}>
            <p id="aeo-approve-text" className="mb-4 text-sm text-white">{APPROVE_CONFIRM}</p>
            <label htmlFor="aeo-recipient" className="mb-1 block text-xs text-text-muted">{RECIPIENT_LABEL}</label>
            <input
              id="aeo-recipient"
              className="w-full rounded-md border border-white/[0.08] bg-bg-base px-2 py-1.5 text-sm text-white"
              maxLength={MAX_RECIPIENT}
              placeholder={RECIPIENT_EXAMPLE}
              value={dialog.recipient}
              onChange={(e) => setDialog({ ...dialog, recipient: e.target.value, error: null })}
              autoFocus
            />
            {dialog.error && <p className="mt-2 text-xs text-[#FF6B6B]">{dialog.error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnCls} disabled={dialog.sending} onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className={btnCls} disabled={dialog.sending || !dialog.recipient.trim()} onClick={() => void onConfirm()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
