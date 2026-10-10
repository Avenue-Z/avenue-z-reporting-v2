'use client'
// The New Business hub (spec §10): a "New snapshot" bar over the table of every snapshot. The table comes from the
// database through the page; this component only refreshes it (on mount, after every action, every 5s while a row
// is generating), because the client Router Cache would otherwise keep a stale list for 180s.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { copySnapshotAsDraftAction, discardSnapshotAction, revokeSnapshotAction } from '@/app/actions/aeo-outbound'
import { DEFAULT_WINDOW_DAYS } from '@/lib/aeo-outbound/config'
import { fmtEasternDay } from '@/lib/aeo-outbound/metrics'
import type { DisplayStatus } from '@/lib/aeo-outbound/store'
import { requestGenerate, type GenerateBody } from './generate-client'
import { ACTION_FAILED, DISCARD_CONFIRM, PEEC_DOWN_RETRY, REVOKE_CONFIRM, SCANNER_NOTE, actionError } from './messages'
import { STATUS_UI, actionsFor, snapshotUrl } from './status'

export type HubRow = {
  id: string
  brand: string
  projectId: string
  projectName: string
  status: DisplayStatus
  createdAt: string
  approvedAt: string | null
  error: string | null
  token: string | null
  recipient: string | null
  openCount: number
  firstOpenedAt: string | null
  lastOpenedAt: string | null
}

type Project = { id: string; name: string }

export const cardCls = 'rounded-lg border border-white/[0.06] bg-bg-surface p-5'
export const btnCls = 'rounded-md border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50'
const inputCls = 'rounded-md border border-white/[0.08] bg-bg-base px-2 py-1.5 text-sm text-white'
const day = (iso: string | null) => (iso ? fmtEasternDay(new Date(iso)) : '')

export function StatusPill({ status, error }: { status: DisplayStatus; error?: string | null }) {
  const ui = STATUS_UI[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ui.className}`}
      title={status === 'failed' && error ? error : undefined}
    >
      {status === 'generating' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {ui.label}
    </span>
  )
}

export function OutboundHub({ rows }: { rows: HubRow[] }) {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [projectsFailed, setProjectsFailed] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pending, setPending] = useState<{ projectId: string; projectName: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setProjectsFailed(false)
    try {
      const res = await fetch('/api/aeo-outbound/projects')
      if (res.status !== 200) throw new Error(String(res.status))
      const list: unknown = await res.json()
      if (!Array.isArray(list)) throw new Error('shape')
      setProjects(list.filter((p): p is Project => typeof p?.id === 'string' && typeof p?.name === 'string'))
    } catch {
      setProjectsFailed(true)
    }
  }, [])

  useEffect(() => {
    router.refresh()
    void loadProjects()
    // Mount only: router is a new object on each render in tests and stable in Next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProjects])

  const anyGenerating = rows.some((r) => r.status === 'generating')
  useEffect(() => {
    if (!anyGenerating) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyGenerating])

  async function generate(body: GenerateBody, projectName: string) {
    setMessage(null)
    setRangeError(null)
    setPending({ projectId: body.projectId, projectName })
    const out = await requestGenerate(body)
    setPending(null)
    // Every answer refreshes the list (spec §10 "after every action"), so a row the request created always shows.
    router.refresh()
    if (out.kind === 'open') {
      router.push(`/tools/new-business/${out.id}`)
      return
    }
    if (out.kind === 'range') {
      setRangeError(out.text)
      return
    }
    setMessage(out.text || null)
  }

  function onGenerate() {
    if (!projectId || pending) return
    const body: GenerateBody = { projectId }
    // Each filled date is sent, so a lone date reaches the route and its 400 bad-range shows inline (spec §7 step 4, §14).
    if (start) body.start = start
    if (end) body.end = end
    void generate(body, projects?.find((p) => p.id === projectId)?.name ?? projectId)
  }

  async function runAction(id: string, run: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, open?: boolean) {
    setMessage(null)
    setBusy(id)
    try {
      const r = await run()
      if (!r.ok) setMessage(actionError(r.error))
      else if (open && r.id) router.push(`/tools/new-business/${r.id}`)
    } catch {
      setMessage(ACTION_FAILED)
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  const showPending = pending && !rows.some((r) => r.projectId === pending.projectId && r.status === 'generating')

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AEO Outbound Snapshot</h1>
      </div>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold text-white">New snapshot</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="aeo-project" className="text-xs text-text-muted">Peec project</label>
            {projectsFailed ? (
              <button type="button" className={btnCls} onClick={() => void loadProjects()}>{PEEC_DOWN_RETRY}</button>
            ) : (
              <select id="aeo-project" className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!projects}>
                <option value="">Pick a Peec project</option>
                {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1" data-range>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Start date
                <input id="aeo-start" type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                End date
                <input id="aeo-end" type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            {rangeError && <p className="text-xs text-[#FF6B6B]">{rangeError}</p>}
          </div>
          <button
            type="button"
            className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onGenerate}
            disabled={!projectId || !!pending}
          >
            Generate
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">Left empty, the report covers the last {DEFAULT_WINDOW_DAYS} days.</p>
        {message && <p className="mt-2 text-sm text-[#FF6B6B]">{message}</p>}
      </section>

      <div className={`${cardCls} overflow-x-auto p-0`}>
        <table className="w-full text-left text-sm text-white">
          <thead className="text-xs text-text-muted">
            <tr>
              {['Brand', 'Peec project', 'Status', 'Created', 'Approved', 'For', 'Opens', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showPending && (
              <tr className="border-t border-white/[0.06]">
                <td className="px-4 py-3">{pending.projectName}</td>
                <td className="px-4 py-3">{pending.projectName}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_UI.generating.className}`}>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />Generating…
                  </span>
                </td>
                <td colSpan={5} />
              </tr>
            )}
            {rows.map((r) => {
              const sent = r.status === 'live' || r.status === 'revoked'
              return (
                <tr key={r.id} data-testid={`row-${r.id}`} className="border-t border-white/[0.06] align-top">
                  <td className="px-4 py-3 font-semibold">{r.brand}</td>
                  <td className="px-4 py-3 text-text-muted">{r.projectName}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} error={r.error} /></td>
                  <td className="px-4 py-3 text-text-muted">{day(r.createdAt)}</td>
                  <td className="px-4 py-3 text-text-muted">{day(r.approvedAt)}</td>
                  <td className="px-4 py-3">{sent ? r.recipient ?? '' : ''}</td>
                  <td className="px-4 py-3">
                    {sent && (
                      <div title={SCANNER_NOTE}>
                        <div>{r.openCount}</div>
                        {r.firstOpenedAt && <div className="text-xs text-text-muted">First opened {day(r.firstOpenedAt)}</div>}
                        {r.lastOpenedAt && <div className="text-xs text-text-muted">Last opened {day(r.lastOpenedAt)}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {actionsFor(r.status).map((a) => {
                        const disabled = busy === r.id || (a === 'rerun' && !!pending)
                        switch (a) {
                          case 'open':
                            return <Link key={a} href={`/tools/new-business/${r.id}`} className={btnCls}>Open</Link>
                          case 'copy':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={!r.token}
                                onClick={() => r.token && void navigator.clipboard?.writeText(snapshotUrl(window.location.origin, r.token))}>
                                Copy link
                              </button>
                            )
                          case 'revoke':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled}
                                onClick={() => window.confirm(REVOKE_CONFIRM) && void runAction(r.id, () => revokeSnapshotAction(r.id))}>
                                Revoke
                              </button>
                            )
                          case 'edit':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled}
                                onClick={() => void runAction(r.id, () => copySnapshotAsDraftAction(r.id), true)}>
                                Edit a copy
                              </button>
                            )
                          case 'rerun':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled}
                                onClick={() => void generate({ projectId: r.projectId, rerunOf: r.id }, r.projectName)}>
                                Rerun
                              </button>
                            )
                          case 'discard':
                            return (
                              <button key={a} type="button" className={btnCls} disabled={disabled}
                                onClick={() => window.confirm(DISCARD_CONFIRM) && void runAction(r.id, () => discardSnapshotAction(r.id))}>
                                Discard
                              </button>
                            )
                        }
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
