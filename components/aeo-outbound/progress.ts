// What a generating row shows (spec v1.1 §16.3): every step in words as a checklist, and the time since it started.
// Usually 35 to 45 seconds (measured: 34.7 s in the dev run, 35.8 s and 40.6 s in the trials).
import { GENERATION_DEADLINE_MS } from '@/lib/aeo-outbound/config'

/** The eight rows, each the progress_step it stands for: pull.ts reports 1 to 6 and 8, generate.ts 9 (WRITING_STEP)
 *  and 10 (SECOND_ATTEMPT_STEP, shown on the last row). There is no step 7. */
export const PROGRESS_STEPS = [
  { step: 1, label: 'Finding the project in Peec' },
  { step: 2, label: 'Reading the brands tracked' },
  { step: 3, label: 'Reading the project profile' },
  { step: 4, label: 'Finding the days with data' },
  { step: 5, label: 'Loading brand visibility and AI models' },
  { step: 6, label: 'Loading the sources AI used' },
  { step: 8, label: "Loading Peec's recommendations" },
  { step: 9, label: 'Writing the copy' },
] as const
export const SECOND_ATTEMPT_LABEL = 'Writing the copy, second attempt'
/** Step 0: the row exists, or the request is on its way, and Peec has not been called yet. Shown with an ellipsis. */
export const STARTING = 'Starting'
export const USUALLY = 'Usually 35 to 45 seconds'
export const SLOW_AFTER_MS = 90_000
export const SLOW = `Taking longer than usual. It stops by itself after ${Math.floor(GENERATION_DEADLINE_MS / 60_000)} minutes ${(GENERATION_DEADLINE_MS % 60_000) / 1000} seconds.`
/** Whether a generation survives a closed tab is unverified (main spec §7a), so the copy says to keep it open. */
export const KEEP_OPEN = 'Keep this tab open until it finishes.'

export type RowState = 'done' | 'current' | 'waiting'
export interface ProgressView { rows: { label: string; state: RowState }[]; done: number; total: number; current: string }

/** m:ss, never negative: a browser clock behind the server shows 0:00. */
export function elapsedLabel(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const isSlow = (elapsedMs: number): boolean => elapsedMs >= SLOW_AFTER_MS

/** The checklist for a progress_step. Below 1 (or not a number): every row waiting, "Starting". 10 and above: the last row, second attempt. */
export function progressView(step: number): ProgressView {
  const s = Number.isFinite(step) ? step : 0
  const at = Math.min(s, 9)
  const rows = PROGRESS_STEPS.map((r) => ({
    label: r.step === 9 && s >= 10 ? SECOND_ATTEMPT_LABEL : r.label,
    state: (s < 1 ? 'waiting' : r.step < at ? 'done' : r.step === at ? 'current' : 'waiting') as RowState,
  }))
  return { rows, done: rows.filter((r) => r.state === 'done').length, total: rows.length, current: rows.find((r) => r.state === 'current')?.label ?? STARTING }
}

/** The one-line form, for rows not started in this tab: the current step, an ellipsis, then the clock. */
export function progressText(step: number, startedAtIso: string, nowMs: number): string {
  return `${progressView(step).current}… ${elapsedLabel(nowMs - Date.parse(startedAtIso))}`
}
