'use client'
// Live progress for one generation (spec v1.1 §16.3): polls GET /api/aeo-outbound/progress every second while a target is
// set. By project (a Generate or Rerun request in flight): a null before any row was seen means "not started yet", a row
// created more than OTHER_RUN_MS before the click is another tab's run, and a null after a row means it finished. By id (a
// row already generating): the first null means it finished. A failed poll keeps the last state. Polling stops on finish,
// when the target clears, or POLL_LIMIT_MS after it started (the generation deadline plus 30 seconds).
import { useEffect, useRef, useState } from 'react'

export const POLL_MS = 1000
export const POLL_LIMIT_MS = 300_000
export const OTHER_RUN_MS = 5000

export type ProgressTarget = { id: string } | { projectId: string; clickedAt: number }
export interface LiveProgress { step: number; createdAt: string | null; finished: boolean }

export function useGenerationProgress(target: ProgressTarget | null, initialStep = 0, onFinished?: () => void): LiveProgress {
  const [state, setState] = useState<LiveProgress>({ step: initialStep, createdAt: null, finished: false })
  const finished = useRef(onFinished)
  finished.current = onFinished
  const key = target ? ('id' in target ? `id:${target.id}` : `project:${target.projectId}:${target.clickedAt}`) : null
  useEffect(() => {
    if (!target) return
    setState({ step: initialStep, createdAt: null, finished: false })
    const byId = 'id' in target
    const url = byId ? `/api/aeo-outbound/progress?id=${encodeURIComponent(target.id)}` : `/api/aeo-outbound/progress?projectId=${encodeURIComponent(target.projectId)}`
    const started = Date.now()
    let seen = byId
    let stopped = false
    const stop = () => { stopped = true; clearInterval(timer) }
    const poll = async () => {
      if (stopped) return
      if (Date.now() - started >= POLL_LIMIT_MS) return stop()
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (res.status !== 200) return
        const body: unknown = await res.json()
        if (stopped || !body || typeof body !== 'object') return
        const b = body as { step?: unknown; createdAt?: unknown }
        if (b.step === null) {
          if (!seen) return
          stop()
          setState((s) => ({ ...s, finished: true }))
          finished.current?.()
          return
        }
        if (typeof b.step !== 'number' || typeof b.createdAt !== 'string') return
        if (!byId && Date.parse(b.createdAt) < target.clickedAt - OTHER_RUN_MS) return
        seen = true
        setState({ step: b.step, createdAt: b.createdAt, finished: false })
      } catch { /* a failed poll keeps the last state; the next tick tries again */ }
    }
    const timer = setInterval(() => void poll(), POLL_MS)
    void poll()
    return stop
    // The target is compared by its key, so a new object for the same run doesn't restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}
