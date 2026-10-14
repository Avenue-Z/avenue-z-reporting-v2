'use client'
// The snapshot editor (spec §9a, §10; v1.1 §2, §4, §6, §7, §11). The report runs in a sandboxed srcdoc iframe that opens
// in Preview; Edit puts the frame in edit mode by message, never by reloading it. The frame never saves anything: it
// posts dirty, edit and structure here, and this page owns the one SaveQueue that PATCHes the slots route.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { approveSnapshotAction, copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { fieldLabel } from '@/lib/aeo-outbound/labels'
import { fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { isStoredNotes, type StoredNote } from '@/lib/aeo-outbound/notes'
import { MAX_RECIPIENT } from '@/lib/aeo-outbound/recipient'
import { REPORT_SANDBOX } from '@/lib/aeo-outbound/sandbox'
import { cleanValue, isStructuralPath } from '@/lib/aeo-outbound/slots'
import type { DisplayStatus } from '@/lib/aeo-outbound/store'
import { BeforeYouSend, openCount, type AboutInfo } from './before-you-send'
import { ConfirmDialog } from './confirm-dialog'
import { CopyLink } from './copy-link'
import { failureText } from './failure-text'
import { requestGenerate } from './generate-client'
import { StatusPill } from './hub'
import {
  ACTION_FAILED, APPROVE_AND_CREATE, APPROVE_CONFIRM, AUTOMATED, BEFORE_YOU_SEND, CANCEL, DISCARD_SNAPSHOT, DONE_EDITING, EDIT,
  EDIT_BANNER, EDIT_COPY, EDIT_COPY_HINT, FLUSH_WAIT, GONE, KEEP_DRAFT, KEEP_LINK, KEEP_SNAPSHOT, LEAVE, LEAVE_UNSAVED, LOADING_REPORT,
  LOCKED_CHART, LOCKED_FIXED, LOCKED_MIRROR, MAKE_NEW_DRAFT, NO_OPENS, OPENS_CAPPED, OPENS_CAVEAT, OPENS_TITLE, PERSON, RECIPIENT_EXAMPLE,
  RECIPIENT_LABEL, REVOKE_LINK, STALE, STAY, UNREADABLE, VIEW_FAILED, actionError, discardTitle, fillFirst, notClassified,
  rerunTitle, revokeTitle,
} from './messages'
import { ProgressChecklist } from './progress-checklist'
import { RETRY_MESSAGE, SaveQueue, type SaveState, type SendMeta, type SendResult } from './save-queue'
import { TEST_LINK_NOTE, shareUrl } from '@/lib/aeo-outbound/share-link'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'
import { useGenerationProgress } from './use-generation-progress'
import { useLeaveGuard } from './use-leave-guard'

export interface OpenEvent { openedAt: string; uaFamily: string; likelyAutomated: boolean; reason: string | null }
export interface OutboundEditorProps {
  id: string
  brand: string
  /** The row's own brand_name for the link slug; null when Peec never named it (Task 3c, spec v1.1 §16.2). */
  linkBrand: string | null
  /** The locked origin for this deployment, or null on a preview or local server (Task 3c). */
  shareOrigin: string | null
  projectId: string
  status: DisplayStatus
  revision: number
  notes: StoredNote[]
  needsValidation: string[]
  token: string | null
  error: string | null
  errorCode: string | null
  recipient: string | null
  sectionTitles: [string, string]
  about: AboutInfo | null
  opens: OpenEvent[]
  openCount: number
  needsValidationBlocksApprove: boolean
  unreadable: boolean
  progressStep: number
  createdAt: string
}

const FLUSH_WAIT_MS = 2000
const POLL_MS = 100
const LOCKED_MS = 3000
const OPENS_SHOWN = 200
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** The waits before a report load is tried again after a 503 (spec v1.1 §19.7). */
const VIEW_RETRY_MS = [1000, 2000]
/** The toolbar shows "Fill in N items first" for the current count (see `message`). */
const FILL_FIRST = Symbol('fill-first')
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

type Mode = 'preview' | 'edit'
type Dialog =
  | { kind: 'approve'; recipient: string; error: string | null; sending: boolean }
  | { kind: 'revoke' | 'discard' | 'rerun' }
  | { kind: 'leave'; then: () => void }

export function OutboundEditor(props: OutboundEditorProps) {
  const { id, projectId } = props
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const queueRef = useRef<SaveQueue | null>(null)
  const modeRef = useRef<Mode>('preview')
  // Spec v1.1 18.12: set on a structure 200, which reloads the page; until the new frame says ready, the old frame (whose
  // bullet indexes are stale) never gets edit mode back. Cleared by the new frame's ready.
  const reloadPendingRef = useRef(false)
  // Spec v1.1 §19.7: the frame's last scroll position, and the one to restore on the next ready after a bullet change.
  const scrollRef = useRef(0)
  const restoreScrollRef = useRef<number | null>(null)
  // Paul's review of #388 (C5): the revision the page's props carried when it opened, and whether the first report load
  // has happened. A refresh runs only on that first load, and only when the view rendered a newer revision.
  const openedPropsRevisionRef = useRef(props.revision)
  const firstLoadRef = useRef(true)

  // Local status and token follow the server's on each refresh, and move ahead of it after an approve or revoke.
  const [status, setStatus] = useState(props.status)
  const [seenStatus, setSeenStatus] = useState(props.status)
  const [panelOpen, setPanelOpen] = useState(props.status === 'draft')
  if (props.status !== seenStatus) {
    // A generating row that becomes a draft opens the panel, the same as a draft loaded directly (v1.1 §4).
    if (seenStatus === 'generating' && props.status === 'draft') setPanelOpen(true)
    setSeenStatus(props.status); setStatus(props.status)
  }
  const [approvedToken, setApprovedToken] = useState<string | null>(null)
  const token = approvedToken ?? props.token

  // v1.1 §4: the panel, Approve, the brand and the section titles re-sync from the server whenever the row's status or
  // revision changes, so nothing goes stale after a refresh.
  const [notes, setNotes] = useState(props.notes)
  const [needsValidation, setNeedsValidation] = useState(props.needsValidation)
  const [brand, setBrand] = useState(props.brand)
  // The brand slug of the public link: the brand as saved in this session, re-seeded when the server's value changes.
  const [linkBrand, setLinkBrand] = useState(props.linkBrand)
  const [seenLinkBrand, setSeenLinkBrand] = useState(props.linkBrand)
  if (props.linkBrand !== seenLinkBrand) { setSeenLinkBrand(props.linkBrand); setLinkBrand(props.linkBrand) }
  const [titles, setTitles] = useState<[string, string]>(props.sectionTitles)
  const [save, setSave] = useState<SaveState | null>(null)
  const sync = `${props.status}|${props.revision}`
  const [seenSync, setSeenSync] = useState(sync)
  if (sync !== seenSync) {
    setSeenSync(sync)
    // Paul's review of #388 (C5): props older than a save this page already made (a refresh that read the row before that
    // save landed) never reset the panel, or a filled item would come back. Newer props, or a status change, still do.
    const older = props.status === 'draft' && save !== null && props.revision < save.revision
    if (!older) { setNotes(props.notes); setNeedsValidation(props.needsValidation); setBrand(props.brand); setTitles(props.sectionTitles) }
  }

  const [html, setHtml] = useState<string | null>(null)
  // Spec v1.1 §19.7: each load is a new iframe element created with its report, so no load adds a history entry.
  const [loads, setLoads] = useState(0)
  const [viewError, setViewError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // The revision the page was opened at: props.revision, or the view route's when the queue adopted it (A1).
  const [openedRevision, setOpenedRevision] = useState(props.revision)
  // The toolbar message: plain text, or FILL_FIRST, whose words are built from the live count at render, so it follows the
  // count and clears at zero without matching its own wording (spec v1.1 §19.7; Paul, #388 review).
  const [message, setMessage] = useState<string | typeof FILL_FIRST | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [mode, setMode] = useState<Mode>('preview')
  const [locked, setLocked] = useState<{ text: string; n: number } | null>(null)
  const [ticks, setTicks] = useState<ReadonlySet<string>>(new Set())
  const [ownTicks, setOwnTicks] = useState<ReadonlySet<number>>(new Set())
  const [highlight, setHighlight] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rerunning, setRerunning] = useState<number | null>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(props.shareOrigin ?? window.location.origin) }, [props.shareOrigin])

  const showsReport = !props.unreadable && (status === 'draft' || status === 'live' || status === 'revoked')
  const toFrame = (m: unknown) => iframeRef.current?.contentWindow?.postMessage(m, '*')
  /** Edit mode, unless a structural change is queued or in flight, its reload has not arrived yet, or saving stopped: the
   *  frame is read-only then (v1.1 §3, 18.12, 19.7). */
  const frameEditable = () => modeRef.current === 'edit' && !queueRef.current?.state.structuring && !reloadPendingRef.current && !queueRef.current?.state.stopped

  // The report HTML: the draft page (editing hooks, Preview until Edit) for a draft, the frozen preview otherwise. A 503
  // (settings unreadable, spec v1.1 §19.7) is tried twice more, after 1 and 2 seconds, before the error shows.
  useEffect(() => {
    if (!showsReport) return
    let live = true
    const url = `/api/aeo-outbound/reports/${id}/view${status === 'draft' ? '' : '?mode=preview'}`
    setViewError(null)
    setHtml(null)
    void (async () => {
      try {
        let res = await fetch(url)
        for (const wait of VIEW_RETRY_MS) {
          if (!live || res.status !== 503) break
          await sleep(wait)
          if (!live) return
          res = await fetch(url)
        }
        if (!live) return
        if (res.status === 404) return setViewError(GONE)
        if (!res.ok) return setViewError(VIEW_FAILED)
        const shown = Number(res.headers.get('X-Report-Revision'))
        const text = await res.text()
        if (!live) return
        // Spec v1.1 §19.7 (A1): save against the revision this report was rendered at, while nothing has been sent.
        const q = queueRef.current
        if (q && res.headers.has('X-Report-Revision') && Number.isInteger(shown) && q.adopt(shown)) setOpenedRevision(shown)
        // A1 (Paul's review of #388, C5): props older than the report on screen mean the page came from the router cache
        // (Back or Forward), so re-read its data once. A normal open, and every later load, does not refresh.
        const first = firstLoadRef.current
        firstLoadRef.current = false
        if (first && status === 'draft' && res.headers.has('X-Report-Revision') && Number.isInteger(shown) && shown !== openedPropsRevisionRef.current) router.refresh()
        setHtml(text)
        setLoads((n) => n + 1)
      } catch {
        if (live) setViewError(VIEW_FAILED)
      }
    })()
    return () => { live = false }
    // The router only serves the one-time refresh above; a new router object must never reload the report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status, showsReport, reloadKey])

  // One save queue per draft. Leaving draft (an approve) stops it.
  useEffect(() => {
    if (status !== 'draft') return
    const dropTicksFor = (list: string) => setTicks((t) => new Set([...t].filter((k) => !(k.split('|')[1] ?? '').startsWith(`${list}.`))))
    // The queue aborts the signal when an attempt hangs past SAVE_TIMEOUT_MS or the queue stops (spec v1.1 18.4). writer
    // and seq let the route recognize a retry of a save that landed but whose answer was lost.
    const send = async (path: string, value: string, revision: number, { writer, seq, signal }: SendMeta): Promise<SendResult> => {
      const res = await fetch(`/api/aeo-outbound/reports/${id}/slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, value, revision, writer, seq }),
        signal,
      })
      if (res.status === 200) {
        const b = (await res.json()) as { revision?: unknown; notes?: unknown; needsValidation?: unknown }
        if (!Number.isInteger(b.revision)) return { kind: 'retry' }
        if (isStoredNotes(b.notes)) setNotes(b.notes)
        if (isStrings(b.needsValidation)) setNeedsValidation(b.needsValidation)
        if (isStructuralPath(path)) {
          // The list's indices changed: its Looks right ticks no longer point at the same bullets (v1.1 §3).
          dropTicksFor(path.split('.')[0])
          reloadPendingRef.current = true
          restoreScrollRef.current = scrollRef.current
          setReloadKey((k) => k + 1)
        } else if (path === 'brand') { setBrand(cleanValue(value)); setLinkBrand(cleanValue(value)) }
        else if (path === 'page.section_1_title') setTitles(([, two]): [string, string] => [cleanValue(value), two])
        else if (path === 'page.section_2_title') setTitles(([one]): [string, string] => [one, cleanValue(value)])
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
      const d = e.data as { type?: unknown; path?: unknown; value?: unknown; what?: unknown; op?: unknown; y?: unknown } | null
      if (!d || typeof d !== 'object') return
      if (d.type === 'ready') {
        reloadPendingRef.current = false
        frame.postMessage({ type: 'mode', edit: frameEditable() }, '*')
        // Spec v1.1 §19.7: a reload after a bullet change opens where Ryan was.
        if (restoreScrollRef.current) frame.postMessage({ type: 'scroll', y: restoreScrollRef.current }, '*')
        restoreScrollRef.current = null
        return
      }
      if (d.type === 'scroll') { if (typeof d.y === 'number' && d.y >= 0) scrollRef.current = d.y; return }
      if (d.type === 'locked') {
        const text = d.what === 'chart' ? LOCKED_CHART : typeof d.path === 'string' ? LOCKED_MIRROR : LOCKED_FIXED
        setLocked((l) => ({ text, n: (l?.n ?? 0) + 1 }))
        return
      }
      const q = queueRef.current
      if (!q || typeof d.path !== 'string') return
      if (d.type === 'dirty') q.markDirty(d.path)
      else if (d.type === 'edit' && typeof d.value === 'string') q.edit(d.path, d.value)
      else if (d.type === 'structure' && (d.op === 'add' || d.op === 'remove')) {
        const patchPath = `${d.path}.${d.op}`
        if (!isStructuralPath(patchPath)) return
        // One structure click at a time (spec v1.1 18.12): a second click that reached us before the frame turned
        // read-only would add a second bullet, or remove the bullet that shifted into the same index. It is dropped.
        if (q.state.structuring) return
        frame.postMessage({ type: 'mode', edit: false }, '*')
        q.structure(patchPath)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // Reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!locked) return
    const t = setTimeout(() => setLocked(null), LOCKED_MS)
    return () => clearTimeout(t)
  }, [locked])

  useEffect(() => {
    if (status !== 'generating') return
    const refreshTimer = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(refreshTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  /** Switching modes flushes pending edits first and never reloads the frame (v1.1 §2). */
  function switchMode(next: Mode) {
    toFrame({ type: 'flush' })
    modeRef.current = next
    setMode(next)
    toFrame({ type: 'mode', edit: frameEditable() })
  }
  function goTo(path: string) {
    if (modeRef.current !== 'edit') switchMode('edit')
    toFrame({ type: 'focus', path })
  }

  const count = openCount(needsValidation, notes, ticks)
  const blockedByValidation = props.needsValidationBlocksApprove && needsValidation.length > 0
  const busySaving = !save || save.dirty || save.saving || save.stopped || save.structuring
  const approveDisabled = busySaving || busy
  const shownMessage = message === FILL_FIRST ? (needsValidation.length ? fillFirst(needsValidation.length) : null) : message
  // Spec v1.1 §19.7: the disabled Approve says why: the stop, the refused field, else saving.
  const refusedField = save && !save.stopped && save.error && save.error !== RETRY_MESSAGE ? save.badPaths.at(-1) : undefined
  const approveTitle = !busySaving ? undefined
    : save?.stopped ? save.error ?? FLUSH_WAIT
      : refusedField ? `${fieldLabel(refusedField, titles)}: ${save!.error}`
        : FLUSH_WAIT

  async function onApprove() {
    const q = queueRef.current
    if (!q) return
    setMessage(null)
    // v1.1 §4: no disabled button without a reason. Open the panel at the first item and say how many.
    if (blockedByValidation) {
      setPanelOpen(true)
      setHighlight(needsValidation[0])
      setMessage(FILL_FIRST)
      return
    }
    toFrame({ type: 'flush' })
    for (let waited = 0; waited < FLUSH_WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS)
      if (!q.state.dirty && !q.state.saving) break
    }
    if (q.state.dirty || q.state.saving || q.state.stopped || q.state.structuring) return setMessage(FLUSH_WAIT)
    setDialog({ kind: 'approve', recipient: '', error: null, sending: false })
  }

  async function onConfirmApprove() {
    const q = queueRef.current
    if (dialog?.kind !== 'approve' || !q) return
    // The dialog re-checks before sending, and always sends the last saved revision (spec §9a).
    if (q.state.dirty || q.state.saving || q.state.stopped || q.state.structuring) return setDialog({ ...dialog, error: FLUSH_WAIT })
    setDialog({ ...dialog, error: null, sending: true })
    let r: Awaited<ReturnType<typeof approveSnapshotAction>>
    try {
      r = await approveSnapshotAction(id, q.state.revision, dialog.recipient)
    } catch {
      return setDialog({ ...dialog, sending: false, error: ACTION_FAILED })
    }
    if (!r.ok && r.error === 'stale') {
      // Someone else changed it: stop saving and offer the reload, the same as a save's 409.
      setDialog(null)
      return q.stop(STALE)
    }
    if (!r.ok) return setDialog({ ...dialog, sending: false, error: actionError(r.error) })
    setDialog(null)
    setApprovedToken(r.token)
    setStatus('live')
    router.refresh()
  }

  async function run(fn: () => Promise<void>) {
    setMessage(null)
    setBusy(true)
    try { await fn() } catch { setMessage(ACTION_FAILED) } finally { setBusy(false) }
  }

  // An edit not yet saved: the browser warns on unload, and in-app navigation asks first in the in-app dialog.
  const unsaved = status === 'draft' && !!save && (save.dirty || save.saving || save.structuring)
  useLeaveGuard(unsaved, (go) => setDialog({ kind: 'leave', then: go }))
  // A stopped queue leaves the frame read-only (spec v1.1 §19.7): nothing typed after a stop can look saved.
  useEffect(() => {
    if (save?.stopped) toFrame({ type: 'mode', edit: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.stopped])
  // A structural item that settled without a reload (a refused one) leaves the frame read-only: hand edit mode back.
  // After a 200 the page is reloading, and the new frame's ready sets the mode instead (spec v1.1 18.12).
  const wasStructuring = useRef(false)
  useEffect(() => {
    const now = !!save?.structuring
    if (wasStructuring.current && !now && !reloadPendingRef.current) toFrame({ type: 'mode', edit: frameEditable() })
    wasStructuring.current = now
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save?.structuring])
  const guard = (then: () => void) => (unsaved ? setDialog({ kind: 'leave', then }) : then())

  const doRerun = () => run(async () => {
    // While the request runs, the checklist replaces the action bar and follows the new row by project (spec v1.1 §16.3).
    setRerunning(Date.now())
    try {
      const out = await requestGenerate({ projectId, rerunOf: id })
      if (out.kind === 'open') return router.push(`/tools/new-business/${out.id}`)
      setMessage(out.text || null)
      if (out.kind === 'message' && out.refresh) router.refresh()
    } finally {
      setRerunning(null)
    }
  })
  const rerunLive = useGenerationProgress(rerunning === null ? null : { projectId, clickedAt: rerunning })
  // A row already generating: follow it by id, and refresh at once when it finishes (spec v1.1 §16.3).
  const ownLive = useGenerationProgress(status === 'generating' ? { id } : null, props.progressStep, () => router.refresh())
  const onRerun = () => {
    if (unsaved) return setDialog({ kind: 'leave', then: () => void doRerun() })
    if (status === 'draft') return setDialog({ kind: 'rerun' })
    void doRerun()
  }
  const onEditCopy = () => guard(() => void run(async () => {
    const r = await copySnapshotAsDraftAction(id)
    if (r.ok) router.push(`/tools/new-business/${r.id}`)
    else setMessage(actionError(r.error))
  }))
  const doRevoke = () => run(async () => {
    const r = await revokeSnapshotAction(id)
    if (!r.ok) return setMessage(actionError(r.error))
    setStatus('revoked')
    router.refresh()
  })
  const doDiscard = () => run(async () => {
    const r = await discardSnapshotAction(id)
    if (r.ok) router.push('/tools/new-business')
    else setMessage(actionError(r.error))
  })

  let saveText: string | null = null
  if (status === 'draft' && save && !save.stopped) {
    if (save.error) {
      const field = save.error !== RETRY_MESSAGE ? save.badPaths.at(-1) : undefined
      saveText = field ? `${fieldLabel(field, titles)}: ${save.error}` : save.error
    } else if (save.saving || save.dirty || save.structuring) saveText = 'Saving…'
    else if (save.revision !== openedRevision) saveText = 'Saved'
  }
  const sent = status === 'live' || status === 'revoked'
  const notClassifiedCount = props.opens.length < OPENS_SHOWN ? Math.max(0, props.openCount - props.opens.length) : 0

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-4 border-b border-white/[0.06] bg-black px-8 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/tools/new-business" onClick={(e) => { if (unsaved) { e.preventDefault(); setDialog({ kind: 'leave', then: () => router.push('/tools/new-business') }) } }} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-white">
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
          {shownMessage && <span className="text-xs text-[#FF6B6B]">{shownMessage}</span>}
          {rerunning !== null ? <div className="ml-auto"><ProgressChecklist step={rerunLive.step} startedAtMs={rerunning} /></div> : (
          <div role="toolbar" aria-label="Snapshot actions" className="ml-auto flex flex-wrap items-center gap-1.5">
            {status === 'draft' && (
              <button type="button" className={primaryBtnCls} disabled={props.unreadable} onClick={() => switchMode(mode === 'edit' ? 'preview' : 'edit')}>
                {mode === 'edit' ? DONE_EDITING : EDIT}
              </button>
            )}
            {sent && (
              <>
                <button type="button" className={primaryBtnCls} disabled={busy} title={EDIT_COPY_HINT} onClick={onEditCopy}>{EDIT_COPY}</button>
                <span className="text-xs text-text-muted">{EDIT_COPY_HINT}</span>
              </>
            )}
            {status === 'draft' && !props.unreadable && (
              <button type="button" className={btnCls} disabled={approveDisabled} title={approveTitle} onClick={() => void onApprove()}>Approve</button>
            )}
            {status === 'live' && token && origin && <CopyLink url={shareUrl(origin, linkBrand, token)} showField />}
            {status === 'live' && token && props.shareOrigin === null && <span className="text-xs text-text-muted">{TEST_LINK_NOTE}</span>}
            {status === 'live' && <button type="button" className={btnCls} disabled={busy} onClick={() => setDialog({ kind: 'revoke' })}>Revoke</button>}
            {status !== 'generating' && <button type="button" className={btnCls} disabled={busy} onClick={onRerun}>Rerun</button>}
            {status === 'failed' && <button type="button" className={btnCls} disabled={busy} onClick={() => setDialog({ kind: 'discard' })}>Discard</button>}
            {showsReport && (
              <>
                <button type="button" className={btnCls} aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>{`${BEFORE_YOU_SEND} (${count})`}</button>
                <a href={`/api/aeo-outbound/reports/${id}/view?mode=preview`} target="_blank" rel="noopener noreferrer" className={`${btnCls} inline-flex items-center gap-1`}>
                  Open full size<ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </>
            )}
          </div>
          )}
        </div>
        {status === 'draft' && mode === 'edit' && <p role="status" className="mt-2 text-xs text-[#60FFEA]">{EDIT_BANNER}</p>}
        {locked && <p role="status" className="mt-2 text-xs text-[#FFFC60]">{locked.text}</p>}
      </div>

      {status === 'generating' && (
        <div className={cardCls}>
          <ProgressChecklist step={ownLive.step} startedAtMs={Date.parse(props.createdAt)} />
        </div>
      )}
      {status === 'failed' && <div className={cardCls}><p className="text-sm text-[#FF6B6B]">{failureText(props.errorCode, props.error, id)}</p></div>}
      {props.unreadable && <div className={cardCls}><p className="text-sm text-[#FF6B6B]">{UNREADABLE}</p></div>}

      {showsReport && (
        <div className="relative">
          {viewError && (
            <p className="mb-2 flex items-center gap-2 text-sm text-[#FF6B6B]">
              {viewError}
              {viewError !== GONE && <button type="button" className={btnCls} onClick={() => window.location.reload()}>Reload</button>}
            </p>
          )}
          {/* Spec v1.1 §19.7: mounted only with its report, a new element per load, so no load adds a history entry. */}
          {html !== null && <iframe key={loads} ref={iframeRef} title={brand} sandbox={REPORT_SANDBOX} srcDoc={html} className="w-full rounded-lg bg-black" style={{ height: 'calc(100vh - 140px)' }} />}
          {html === null && !viewError && <div className="flex items-center justify-center rounded-lg bg-black text-sm text-text-muted" style={{ height: 'calc(100vh - 140px)' }}>{LOADING_REPORT}</div>}
          {panelOpen && (
            <BeforeYouSend
              needsValidation={needsValidation} notes={notes} titles={titles} about={props.about} ticks={ticks} ownTicks={ownTicks} highlight={highlight}
              onTick={(key) => setTicks((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n })}
              onOwnTick={(i) => setOwnTicks((t) => { const n = new Set(t); if (n.has(i)) n.delete(i); else n.add(i); return n })}
              onGoTo={goTo} onMinimize={() => setPanelOpen(false)}
            />
          )}
          {!panelOpen && status === 'draft' && (
            <button type="button" className="absolute right-6 top-2 z-10 rounded-full border border-white/[0.12] bg-bg-surface px-3 py-1 text-xs font-medium text-white shadow-lg" aria-label={`Show ${BEFORE_YOU_SEND} (${count})`} onClick={() => setPanelOpen(true)}>{`${BEFORE_YOU_SEND} (${count})`}</button>
          )}
        </div>
      )}

      {sent && (
        <section aria-label={OPENS_TITLE} className={`${cardCls} mt-4`}>
          <h2 className="mb-1 text-sm font-semibold text-white">{OPENS_TITLE}</h2>
          <p className="mb-2 text-xs text-text-muted">{OPENS_CAVEAT}</p>
          {props.opens.length === 0 ? <p className="text-xs text-text-muted">{NO_OPENS}</p> : (
            <table className="w-full text-left text-xs text-white">
              <thead className="text-text-muted"><tr><th className="py-1">Opened</th><th>Browser</th><th>Likely</th><th>Why</th></tr></thead>
              <tbody>
                {props.opens.map((o, i) => (
                  <tr key={i} className="border-t border-white/[0.06]">
                    <td className="py-1">{fmtEasternDateTime(new Date(o.openedAt))}</td>
                    <td>{o.uaFamily}</td>
                    <td>{o.likelyAutomated ? AUTOMATED : PERSON}</td>
                    <td>{o.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {props.opens.length === OPENS_SHOWN && <p className="mt-2 text-xs text-text-muted">{OPENS_CAPPED}</p>}
          {notClassifiedCount > 0 && <p className="mt-2 text-xs text-text-muted">{notClassified(notClassifiedCount)}</p>}
        </section>
      )}

      {dialog?.kind === 'approve' && (
        <ConfirmDialog
          title={APPROVE_CONFIRM} confirmLabel={APPROVE_AND_CREATE} cancelLabel={CANCEL} initialFocus="input"
          busy={dialog.sending} error={dialog.error} confirmDisabled={!dialog.recipient.trim()}
          onCancel={() => setDialog(null)} onConfirm={() => void onConfirmApprove()}
        >
          <label htmlFor="aeo-recipient" className="mb-1 block text-xs text-text-muted">{RECIPIENT_LABEL}</label>
          <input
            id="aeo-recipient" className={`${inputCls} w-full`} maxLength={MAX_RECIPIENT} placeholder={RECIPIENT_EXAMPLE}
            value={dialog.recipient} disabled={dialog.sending}
            onChange={(e) => setDialog({ ...dialog, recipient: e.target.value, error: null })}
          />
        </ConfirmDialog>
      )}
      {dialog?.kind === 'revoke' && (
        <ConfirmDialog title={revokeTitle(brand, props.recipient)} confirmLabel={REVOKE_LINK} cancelLabel={KEEP_LINK} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doRevoke() }} />
      )}
      {dialog?.kind === 'discard' && (
        <ConfirmDialog title={discardTitle(brand)} confirmLabel={DISCARD_SNAPSHOT} cancelLabel={KEEP_SNAPSHOT} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doDiscard() }} />
      )}
      {dialog?.kind === 'rerun' && (
        <ConfirmDialog title={rerunTitle(brand)} confirmLabel={MAKE_NEW_DRAFT} cancelLabel={KEEP_DRAFT} onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void doRerun() }} />
      )}
      {dialog?.kind === 'leave' && (
        <ConfirmDialog title={LEAVE_UNSAVED} confirmLabel={LEAVE} cancelLabel={STAY} onCancel={() => setDialog(null)} onConfirm={() => { const then = dialog.then; setDialog(null); then() }} />
      )}
    </div>
  )
}
