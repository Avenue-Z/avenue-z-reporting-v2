'use client'
// The New Business hub (spec §10; v1.1 §5, §6, §7, §11): an itinerary of every snapshot. Status tabs with the server's
// counts, one server-side search box (?q=), sortable columns, 50 rows a page, Show older, plain failure reasons, progress
// per generating row, opens split into likely people and likely automated, and in-app dialogs. The table comes from the
// database through the page; this component refreshes it (on mount, after every action, every 5s while a row is
// generating), because the client Router Cache would otherwise keep a stale list for 180s.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { MAX_LOOKBACK_DAYS } from '@/lib/aeo-outbound/config'
import type { HubRow } from '@/lib/aeo-outbound/hub-rows'
import { fmtDay, fmtEasternDateTime } from '@/lib/aeo-outbound/metrics'
import { defaultRange } from '@/lib/aeo-outbound/range'
import type { DisplayStatus, HubCounts, HubCursor, ProjectStat } from '@/lib/aeo-outbound/store'
import { ConfirmDialog } from './confirm-dialog'
import { CopyLink } from './copy-link'
import { failureText } from './failure-text'
import { requestGenerate, type GenerateBody } from './generate-client'
import {
  ACTION_FAILED, CLEAR_FILTERS, DISCARD_SNAPSHOT, EMPTY_FIRST, EMPTY_MATCH, HUB_SUBTITLE, KEEP_LINK, KEEP_SNAPSHOT, NEXT, NO_OPENS_SHORT, OLDER_FAILED, OPEN,
  OPENS_CAVEAT, PREVIOUS, REVOKE_LINK, SEARCH_LABEL, SEARCH_PLACEHOLDER, SETTINGS, SHOW_OLDER, actionError, createdByLine, discardTitle,
  draftReady, firstOpened, lastOpened, pageOf, revokeTitle,
} from './messages'
import { cleanSearch } from './search-text'
import { KEEP_OPEN, USUALLY, progressText } from './progress'
import { ProgressChecklist } from './progress-checklist'
import { ProjectPicker, type PickerProject } from './project-picker'
import { useGenerationProgress } from './use-generation-progress'
import { STATUS_UI, actionsFor } from './status'
import { TEST_LINK_NOTE, shareUrl } from '@/lib/aeo-outbound/share-link'
import { btnCls, cardCls, inputCls, primaryBtnCls } from './ui'

export { btnCls, cardCls }
export type { HubRow }

export interface OutboundHubProps {
  rows: HubRow[]
  counts: HubCounts
  cursor: HubCursor | null
  q: string
  projectStats: Record<string, ProjectStat>
  isAdmin: boolean
  /** The locked origin for this deployment, or null on a preview or local server (Task 3c, spec v1.1 §16.2). */
  shareOrigin: string | null
}

type Tab = 'all' | 'draft' | 'live' | 'revoked' | 'failed'
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'draft', label: 'Drafts' }, { id: 'live', label: 'Sent' }, { id: 'revoked', label: 'Revoked' }, { id: 'failed', label: 'Failed' },
]
type SortKey = 'brand' | 'project' | 'status' | 'created' | 'sent' | 'recipient' | 'opens'
const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'brand', label: 'Brand' }, { key: 'project', label: 'Peec project' }, { key: 'status', label: 'Status' }, { key: 'created', label: 'Created' },
  { key: 'sent', label: 'Sent' }, { key: 'recipient', label: 'Sent to' }, { key: 'opens', label: 'Opens' }, { key: null, label: 'Actions' },
]
const SORT_VALUE: Record<SortKey, (r: HubRow) => string | number> = {
  brand: (r) => r.brand.toLowerCase(), project: (r) => r.projectName.toLowerCase(), status: (r) => r.status, created: (r) => r.createdAt,
  sent: (r) => r.approvedAt ?? '', recipient: (r) => (r.recipient ?? '').toLowerCase(), opens: (r) => r.openCount,
}
const PAGE_SIZE = 50
type Pending = { projectName: string; startedAt: string; rerunOf: string | null }
type HubDialog = { kind: 'revoke' | 'discard'; row: HubRow }

export function StatusPill({ status, error }: { status: DisplayStatus; error?: string | null }) {
  const ui = STATUS_UI[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ui.className}`} title={status === 'failed' && error ? error : undefined}>
      {status === 'generating' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {ui.label}
    </span>
  )
}

/** "3 opens: 1 likely person, 2 likely automated", plus opens from before v1.1 as "not classified" (v1.1 §6). */
export function opensSummary(r: Pick<HubRow, 'openCount' | 'opensPerson' | 'opensAutomated'>): string {
  if (r.openCount === 0) return NO_OPENS_SHORT
  const head = `${r.openCount} ${r.openCount === 1 ? 'open' : 'opens'}: ${r.opensPerson} likely ${r.opensPerson === 1 ? 'person' : 'people'}, ${r.opensAutomated} likely automated`
  const rest = r.openCount - r.opensPerson - r.opensAutomated
  return rest > 0 ? `${head}, ${rest} not classified` : head
}

/** The local row for a Generate request in flight in this tab: polls by project, clock from the click (spec v1.1 §16.3). */
function PendingProgress({ projectId, startedAt }: { projectId: string; startedAt: string }) {
  const clickedAt = Date.parse(startedAt)
  const live = useGenerationProgress({ projectId, clickedAt })
  return <ProgressChecklist step={live.step} startedAtMs={clickedAt} />
}

export function OutboundHub({ rows, counts, cursor, q, projectStats, isAdmin, shareOrigin }: OutboundHubProps) {
  const router = useRouter()
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [projects, setProjects] = useState<PickerProject[] | null>(null)
  const [projectsFailed, setProjectsFailed] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [limits, setLimits] = useState<{ min: string; max: string } | null>(null)
  const pendingRef = useRef<Record<string, Pending>>({})
  const [pending, setPendingState] = useState<Record<string, Pending>>({})
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(q)
  const [older, setOlder] = useState<{ q: string; rows: HubRow[]; cursor: HubCursor | null } | null>(null)
  const [olderLoading, setOlderLoading] = useState(false)
  const [olderError, setOlderError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<HubDialog | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [origin, setOrigin] = useState('')

  const loadProjects = useCallback(async () => {
    setProjectsFailed(false)
    try {
      const res = await fetch('/api/aeo-outbound/projects')
      if (res.status !== 200) throw new Error(String(res.status))
      const list: unknown = await res.json()
      if (!Array.isArray(list)) throw new Error('shape')
      setProjects(list.filter((p): p is PickerProject => typeof p?.id === 'string' && typeof p?.name === 'string').map((p) => ({ id: p.id, name: p.name, status: typeof p.status === 'string' ? p.status : '' })))
    } catch {
      setProjectsFailed(true)
    }
  }, [])

  useEffect(() => {
    router.refresh()
    void loadProjects()
    setOrigin(shareOrigin ?? window.location.origin)
    // v1.1 §9: the same bounds checkRange enforces, today minus MAX_LOOKBACK_DAYS through today (UTC).
    const r = defaultRange(Date.now())
    setLimits({ min: r.start, max: r.end })
    // Mount only: router is a new object on each render in tests and stable in Next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProjects])

  // v1.1 §5: search is server-side, through ?q=. The box follows the page's q (Back and Forward change it), and a push
  // starts only from typing, after a short pause, and only when the cleaned text differs from q.
  const qRef = useRef(q)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopSearchTimer = () => { if (searchTimer.current) { clearTimeout(searchTimer.current); searchTimer.current = null } }
  useEffect(() => { qRef.current = q; stopSearchTimer(); setSearch(q) }, [q])
  useEffect(() => stopSearchTimer, [])
  function onSearchInput(value: string) {
    setSearch(value)
    stopSearchTimer()
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null
      const next = cleanSearch(value) ?? ''
      if (next !== qRef.current) router.push(next ? `/tools/new-business?q=${encodeURIComponent(next)}` : '/tools/new-business')
    }, 300)
  }
  useEffect(() => { setPage(1) }, [q, tab, sort])

  const anyGenerating = rows.some((r) => r.status === 'generating')
  const anyPending = Object.keys(pending).length > 0
  useEffect(() => {
    if (!anyGenerating) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyGenerating])
  useEffect(() => {
    if (!anyGenerating && !anyPending) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [anyGenerating, anyPending])

  const setPending = (fn: (p: Record<string, Pending>) => Record<string, Pending>) => { pendingRef.current = fn(pendingRef.current); setPendingState(pendingRef.current) }

  async function generate(body: GenerateBody, projectName: string) {
    setMessage(null)
    setRangeError(null)
    setNow(Date.now())
    setPending((p) => ({ ...p, [body.projectId]: { projectName, startedAt: new Date().toISOString(), rerunOf: body.rerunOf ?? null } }))
    const out = await requestGenerate(body)
    setPending((p) => { const next = { ...p }; delete next[body.projectId]; return next })
    // Every answer refreshes the list (spec §10 "after every action"), so a row the request created always shows.
    router.refresh()
    // v1.1 §7: never jump Ryan to a page he left.
    if (!mounted.current) return
    if (out.kind === 'open') {
      // Another generation still running here: say this one is ready instead of leaving the hub.
      if (Object.keys(pendingRef.current).length) { setReady((r) => new Set(r).add(out.id)); return }
      router.push(`/tools/new-business/${out.id}`)
      return
    }
    if (out.kind === 'range') { setRangeError(out.text); return }
    setMessage(out.text || null)
  }

  function onGenerate() {
    if (!projectId || pending[projectId]) return
    const body: GenerateBody = { projectId }
    // Each filled date is sent, so a lone date reaches the route and its 400 bad-range shows inline (spec §7 step 4, §14).
    if (start) body.start = start
    if (end) body.end = end
    void generate(body, projects?.find((p) => p.id === projectId)?.name ?? projectId)
  }

  async function runAction(id: string, run: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, open?: boolean, onOk?: () => void) {
    setMessage(null)
    setBusy(id)
    try {
      const r = await run()
      if (!r.ok) setMessage(actionError(r.error))
      else {
        onOk?.()
        if (open && r.id) router.push(`/tools/new-business/${r.id}`)
      }
    } catch {
      setMessage(ACTION_FAILED)
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  const olderRows = older && older.q === q ? older.rows : []
  const nextCursor = older && older.q === q ? older.cursor : cursor
  async function showOlder() {
    if (!nextCursor) return
    setOlderLoading(true)
    setOlderError(null)
    try {
      const qs = new URLSearchParams({ before: nextCursor.before, beforeId: nextCursor.beforeId, ...(q ? { q } : {}) })
      const res = await fetch(`/api/aeo-outbound/reports?${qs.toString()}`)
      if (res.status !== 200) throw new Error(String(res.status))
      const b = (await res.json()) as { rows?: unknown; cursor?: unknown }
      if (!Array.isArray(b.rows)) throw new Error('shape')
      setOlder({ q, rows: [...olderRows, ...(b.rows as HubRow[])], cursor: (b.cursor as HubCursor | null) ?? null })
    } catch {
      setOlderError(OLDER_FAILED)
    } finally {
      setOlderLoading(false)
    }
  }

  const all = useMemo(() => {
    // A row can come back from Show older after it moved to the live list: each row is listed once.
    const seen = new Set<string>()
    return [...rows, ...olderRows].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  }, [rows, olderRows])
  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key]
    return all.filter((r) => tab === 'all' || r.status === tab).sort((a, b) => {
      const x = value(a), y = value(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      return (sort.dir === 'asc' ? c : -c) || (a.id < b.id ? -1 : 1)
    })
  }, [all, tab, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = sorted.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created' || key === 'sent' || key === 'opens' ? 'desc' : 'asc' }))
  const clearFilters = () => { setTab('all'); stopSearchTimer(); setSearch(''); if (q) router.push('/tools/new-business') }
  const localPending = Object.entries(pending).filter(([pid]) => !rows.some((r) => r.projectId === pid && r.status === 'generating'))
  const generatingHere = !!projectId && (!!pending[projectId] || rows.some((r) => r.projectId === projectId && r.status === 'generating'))
  const rerunPending = (id: string) => Object.values(pending).some((p) => p.rerunOf === id)
  const progress = (step: number, startedAt: string) => (
    <div className="mt-1 text-xs text-text-muted">
      <div>{progressText(step, startedAt, now)}</div>
      <div>{USUALLY}</div>
      <div>{KEEP_OPEN}</div>
    </div>
  )

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AEO Outbound Snapshot</h1>
          <p className="mt-1 text-sm text-text-muted">{HUB_SUBTITLE}</p>
        </div>
        {isAdmin && <Link href="/tools/new-business/settings" className={btnCls}>{SETTINGS}</Link>}
      </div>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold text-white">New snapshot</h2>
        <div className="flex flex-wrap items-end gap-3">
          <ProjectPicker projects={projects} failed={projectsFailed} onRetry={() => void loadProjects()} value={projectId} onChange={setProjectId} stats={projectStats} />
          <div className="flex flex-col gap-1" data-range>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Start date
                <input id="aeo-start" type="date" className={inputCls} value={start} min={limits?.min} max={limits?.max} onChange={(e) => { setStart(e.target.value); setRangeError(null) }} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                End date
                <input id="aeo-end" type="date" className={inputCls} value={end} min={limits?.min} max={limits?.max} onChange={(e) => { setEnd(e.target.value); setRangeError(null) }} />
              </label>
            </div>
            {rangeError && <p className="text-xs text-[#FF6B6B]">{rangeError}</p>}
          </div>
          <button type="button" className={primaryBtnCls} onClick={onGenerate} disabled={!projectId || generatingHere}>Generate</button>
        </div>
        <p className="mt-2 text-xs text-text-muted">Left empty, the report covers the project's full history, up to {MAX_LOOKBACK_DAYS} days back.</p>
        {message && <p className="mt-2 text-sm text-[#FF6B6B]">{message}</p>}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Snapshot status" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${btnCls} ${tab === t.id ? 'bg-white/[0.08]' : ''}`} onClick={() => setTab(t.id)}>
              {`${t.label} (${counts[t.id]})`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          {SEARCH_LABEL}
          <input type="search" className={`${inputCls} w-72`} placeholder={SEARCH_PLACEHOLDER} value={search} onChange={(e) => onSearchInput(e.target.value)} />
        </label>
      </div>
      <p className="mb-2 text-xs text-text-muted">{OPENS_CAVEAT}</p>
      {shareOrigin === null && rows.some((r) => r.token) && <p className="mb-2 text-xs text-text-muted">{TEST_LINK_NOTE}</p>}

      <div className={`${cardCls} overflow-x-auto p-0`}>
        <table className="w-full text-left text-sm text-white">
          <thead className="text-xs text-text-muted">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} className="px-4 py-3 font-medium" aria-sort={c.key && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.key ? <button type="button" className="hover:text-white" onClick={() => toggleSort(c.key!)}>{c.label}</button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localPending.map(([pid, p]) => (
              <tr key={`pending-${pid}`} className="border-t border-white/[0.06] align-top">
                <td className="px-4 py-3">{p.projectName}</td>
                <td className="px-4 py-3">{p.projectName}</td>
                <td className="px-4 py-3"><StatusPill status="generating" /><PendingProgress projectId={pid} startedAt={p.startedAt} /></td>
                <td colSpan={5} />
              </tr>
            ))}
            {shown.map((r) => {
              const sentRow = r.status === 'live' || r.status === 'revoked'
              return (
                <tr key={r.id} data-testid={`row-${r.id}`} className="border-t border-white/[0.06] align-top">
                  <td className="px-4 py-3 font-semibold">{r.brand}</td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{r.projectName}</div>
                    {r.requestedStart && r.requestedEnd && <div className="text-xs">{`${fmtDay(r.requestedStart)} to ${fmtDay(r.requestedEnd)}`}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} error={r.error} />
                    {r.status === 'failed' && <p className="mt-1 max-w-xs text-xs text-[#FF6B6B]">{failureText(r.errorCode, r.error, r.id)}</p>}
                    {r.status === 'generating' && (pending[r.projectId] ? <PendingProgress projectId={r.projectId} startedAt={pending[r.projectId].startedAt} /> : progress(r.progressStep, r.createdAt))}
                    {ready.has(r.id) && (
                      <p className="mt-1 text-xs text-[#60FF80]">{draftReady(r.brand)} <Link href={`/tools/new-business/${r.id}`} className="underline">{OPEN}</Link></p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{fmtEasternDateTime(new Date(r.createdAt))}</div>
                    <div className="text-xs">{createdByLine(r.createdBy)}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{sentRow && r.approvedAt ? fmtEasternDateTime(new Date(r.approvedAt)) : ''}</td>
                  <td className="px-4 py-3">{sentRow ? r.recipient ?? '' : ''}</td>
                  <td className="px-4 py-3">
                    {sentRow && (
                      <div>
                        <div>{opensSummary(r)}</div>
                        {r.firstOpenedAt && <div className="text-xs text-text-muted">{firstOpened(fmtEasternDateTime(new Date(r.firstOpenedAt)))}</div>}
                        {r.lastOpenedAt && <div className="text-xs text-text-muted">{lastOpened(fmtEasternDateTime(new Date(r.lastOpenedAt)))}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {actionsFor(r.status).map((a) => {
                        const disabled = busy === r.id
                        switch (a) {
                          case 'open':
                            return <Link key={a} href={`/tools/new-business/${r.id}`} className={btnCls}>{OPEN}</Link>
                          case 'copy':
                            return r.token && origin ? <CopyLink key={a} url={shareUrl(origin, r.linkBrand, r.token)} /> : null
                          case 'revoke':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => setDialog({ kind: 'revoke', row: r })}>Revoke</button>
                          case 'edit':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => void runAction(r.id, () => copySnapshotAsDraftAction(r.id), true)}>Edit a copy</button>
                          case 'rerun':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled || rerunPending(r.id)}
                                onClick={() => void generate({ projectId: r.projectId, rerunOf: r.id }, r.projectName)}>Rerun</button>
                            )
                          case 'discard':
                            return <button key={a} type="button" className={btnCls} disabled={disabled} onClick={() => setDialog({ kind: 'discard', row: r })}>Discard</button>
                        }
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {counts.all === 0 && !q && all.length === 0 && localPending.length === 0 && <p className="px-4 py-6 text-sm text-text-muted">{EMPTY_FIRST}</p>}
        {!(counts.all === 0 && !q && all.length === 0) && sorted.length === 0 && localPending.length === 0 && (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted">
            {EMPTY_MATCH}
            <button type="button" className={btnCls} onClick={clearFilters}>{CLEAR_FILTERS}</button>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        {pages > 1 && (
          <>
            <button type="button" className={btnCls} disabled={cur <= 1} onClick={() => setPage(cur - 1)}>{PREVIOUS}</button>
            <span>{pageOf(cur, pages)}</span>
            <button type="button" className={btnCls} disabled={cur >= pages} onClick={() => setPage(cur + 1)}>{NEXT}</button>
          </>
        )}
        {nextCursor && <button type="button" className={btnCls} disabled={olderLoading} onClick={() => void showOlder()}>{SHOW_OLDER}</button>}
        {olderError && <span className="text-[#FF6B6B]">{olderError}</span>}
      </div>

      {dialog?.kind === 'revoke' && (
        <ConfirmDialog title={revokeTitle(dialog.row.brand, dialog.row.recipient)} confirmLabel={REVOKE_LINK} cancelLabel={KEEP_LINK}
          onCancel={() => setDialog(null)} onConfirm={() => { const r = dialog.row; setDialog(null); void runAction(r.id, () => revokeSnapshotAction(r.id)) }} />
      )}
      {dialog?.kind === 'discard' && (
        <ConfirmDialog title={discardTitle(dialog.row.brand)} confirmLabel={DISCARD_SNAPSHOT} cancelLabel={KEEP_SNAPSHOT}
          onCancel={() => setDialog(null)} onConfirm={() => { const r = dialog.row; setDialog(null); void runAction(r.id, () => discardSnapshotAction(r.id), false, () => setOlder((o) => (o ? { ...o, rows: o.rows.filter((x) => x.id !== r.id) } : o))) }} />
      )}
    </>
  )
}
