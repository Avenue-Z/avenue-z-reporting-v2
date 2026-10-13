'use client'
// Live progress for one generation (spec v1.1 §16.3): polls GET /api/aeo-outbound/progress every second while a target is
// set. By project (a Generate or Rerun request in flight): a null before any row was seen means "not started yet", a row
// created more than OTHER_RUN_MS before the click is another tab's run, and a null after a row means it finished. The click
// is moved onto the server's clock per poll with the answer's `now` (offset 0 when it is missing or unreadable), so a
// browser clock ahead of the server never hides this tab's run (v1.1 §18.9). By id (a
// row already generating): the first null means it finished. A failed poll keeps the last state. Polling stops on finish,
// when the target clears, or POLL_LIMIT_MS after it started (the generation deadline plus 30 seconds). One poll at a time:
// a tick is skipped while one is in flight, and a poll that takes POLL_TIMEOUT_MS is aborted and counts as failed.
import { useEffect, useRef, useState } from 'react'

export const POLL_MS = 1000
export const POLL_LIMIT_MS = 300_000
export const OTHER_RUN_MS = 5000
export const POLL_TIMEOUT_MS = 5000

export type ProgressTarget = { id: string } | { projectId: string; clickedAt: number }
export interface LiveProgress { step: number; createdAt: string | null; finished: boolean }

export function useGenerationProgress(target: ProgressTarget | null, initialStep = 0, onFinished?: () => void): LiveProgress {
  const [state, setState] = useState<LiveProgress>({ step: initialStep, createdAt: null, finished: false })
  const finished = useRef(onFinished)
  finished.current = onFinished
  const key = target ? ('id' in target ? `id:${target.id}` : `project:${target.projectId}:${target.clickedAt}`) : null
  useEffect(() => {
    if (!target) {
      setState((s) => (s.step === initialStep && s.createdAt === null && !s.finished ? s : { step: initialStep, createdAt: null, finished: false }))
      return
    }
    setState({ step: initialStep, createdAt: null, finished: false })
    const byId = 'id' in target
    const url = byId ? `/api/aeo-outbound/progress?id=${encodeURIComponent(target.id)}` : `/api/aeo-outbound/progress?projectId=${encodeURIComponent(target.projectId)}`
    const started = Date.now()
    let seen = byId
    let stopped = false
    let inFlight = false
    let controller: AbortController | null = null
    const stop = () => { stopped = true; clearInterval(timer); controller?.abort() }
    const poll = async () => {
      if (stopped) return
      if (inFlight) return
      if (Date.now() - started >= POLL_LIMIT_MS) return stop()
      inFlight = true
      controller = new AbortController()
      const abort = controller
      const guard = setTimeout(() => abort.abort(), POLL_TIMEOUT_MS)
      try {
        const res = await fetch(url, { cache: 'no-store', signal: abort.signal })
        if (res.status !== 200) return
        const body: unknown = await res.json()
        if (stopped || !body || typeof body !== 'object') return
        const b = body as { step?: unknown; createdAt?: unknown; now?: unknown }
        if (b.step === null) {
          if (!seen) return
          stop()
          setState((s) => ({ ...s, finished: true }))
          finished.current?.()
          return
        }
        if (typeof b.step !== 'number' || typeof b.createdAt !== 'string') return
        const serverNow = typeof b.now === 'string' ? Date.parse(b.now) : NaN
        const offset = Number.isNaN(serverNow) ? 0 : serverNow - Date.now()
        if (!byId && Date.parse(b.createdAt) < target.clickedAt + offset - OTHER_RUN_MS) return
        seen = true
        setState({ step: b.step, createdAt: b.createdAt, finished: false })
      } catch { /* a failed or aborted poll keeps the last state; the next tick tries again */ } finally {
        clearTimeout(guard)
        inFlight = false
      }
    }
    const timer = setInterval(() => void poll(), POLL_MS)
    void poll()
    return stop
    // The target is compared by its key, so a new object for the same run doesn't restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
