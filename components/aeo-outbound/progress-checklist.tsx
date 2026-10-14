'use client'
// The step-by-step progress of one generation (spec v1.1 §16.3): the current step, the clock, a bar of finished rows out of
// eight, every row ticked, current or waiting, then the usual time (or the slow line after 90 seconds) and the keep-open advice.
import { useEffect, useState } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { KEEP_OPEN, SLOW, USUALLY, elapsedLabel, isSlow, progressView } from './progress'

export function ProgressChecklist({ step, startedAtMs }: { step: number; startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const v = progressView(step)
  const elapsed = now - startedAtMs
  return (
    <div className="mt-2 max-w-sm text-xs">
      <div className="flex items-center justify-between gap-3 text-sm text-white">
        <span role="status" aria-label="Generation progress">{`${v.current}…`}</span>
        <span className="tabular-nums text-text-muted">{elapsedLabel(elapsed)}</span>
      </div>
      <div role="progressbar" aria-label="Steps finished" aria-valuemin={0} aria-valuemax={v.total} aria-valuenow={v.done} className="mt-2 h-1.5 w-full rounded bg-white/10">
        <div className="h-1.5 rounded bg-[#60FFEA] transition-[width]" style={{ width: `${(v.done / v.total) * 100}%` }} />
      </div>
      <ol className="mt-2 space-y-1">
        {v.rows.map((r) => (
          <li key={r.label} data-state={r.state} className={`flex items-center gap-2 ${r.state === 'waiting' ? 'text-text-muted' : 'text-white'}`}>
            {r.state === 'done' && <Check className="h-3 w-3 text-[#60FF80]" aria-hidden />}
            {r.state === 'current' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {r.state === 'waiting' && <Circle className="h-3 w-3" aria-hidden />}
            {r.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-text-muted">{isSlow(elapsed) ? SLOW : USUALLY}</p>
      <p className="text-text-muted">{KEEP_OPEN}</p>
    </div>
  )
}
