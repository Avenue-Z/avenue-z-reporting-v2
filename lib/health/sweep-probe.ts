/**
 * The probe half of the health sweep: ask one report URL how it is, under two
 * budgets.
 *
 * Lives beside derive/diff/slack rather than inside the route so the budget
 * behaviour is testable without standing up cron auth, Neon and Slack — in
 * particular the distinction that matters most here, between "asked and it
 * failed" (down) and "never asked" (unknown). The route keeps what is genuinely
 * route-shaped: auth, the unit list, the diff, the Slack post and the upsert.
 */
import { deriveStatus } from './derive'
import type { ProbeResult, Surface } from './types'

/**
 * Ceiling on a single probe's render.
 *
 * Without one, a probe fetch waits indefinitely and a single hung unit consumes
 * the whole sweep's maxDuration — taking every other unit's result down with
 * it, so a sweep that was meant to report one section down reports nothing at
 * all. That became easy to hit once every Salesforce query took a 60s ceiling
 * (SALESFORCE_TIMEOUT_MS in lib/salesforce/pipeline.ts): one cold, failing
 * Executive Overview render is the entire sweep budget on its own.
 *
 * 25s is well clear of a healthy render and well inside the 60s function
 * budget. The crons are ordered so this is not a close call: cache-warm runs at
 * :30 and the sweeps at :15 and :45 (vercel.json), both inside the 1-hour TTL
 * it writes, so a probe reads warm entries and answers in seconds. A probe that
 * needs 25s is not a cold cache, it is a section in trouble — which is a `down`
 * worth reporting, not a reason to lose the run.
 *
 * A probe never gets more than SWEEP_BUDGET_MS has left, so late probes are cut
 * shorter than this and the phase as a whole cannot run past its deadline.
 */
export const PROBE_TIMEOUT_MS = 25_000

/**
 * Ceiling on the probe phase as a whole, leaving the rest of the route's
 * maxDuration (60s) for the work that turns probes into an outcome: the
 * health_state read, the diff, the Slack post and the upsert.
 *
 * This is the cap that actually protects the run. PROBE_TIMEOUT_MS narrows the
 * original failure — it takes three hung probes rather than one to blow the
 * budget — but it does not close it: wall time is ceil(units / CONCURRENCY) ×
 * PROBE_TIMEOUT_MS, which at the ~20 units scripts/seed.ts already yields is
 * 3 × 25s = 75s against a 60s maxDuration. And overrunning is the worst outcome
 * available, because mapWithConcurrency resolves once or not at all: the
 * function is killed mid-flight and EVERY unit's result is discarded, including
 * the ones that answered fine. Three sick sections would silence the sweep
 * entirely instead of being reported.
 *
 * With one deadline over the phase, partial results survive: whatever was
 * probed is diffed, announced and stored, and the rest is skipped.
 */
export const SWEEP_BUDGET_MS = 45_000

export interface Unit {
  url: string
  surface: Surface
  clientSlug: string
  section: string
}

/**
 * Probes one unit, or returns null when the sweep deadline left no room to try.
 *
 * null and 'down' are deliberately different answers. A unit we never asked is
 * unknown: reporting it down would post a 🔴 transition for a section that may
 * be perfectly healthy, and page whoever is on call for our own budget
 * overrunning. Returning null leaves its stored status untouched — diffHealth
 * only walks the units it is given — so the next sweep picks it up.
 */
export async function probe(u: Unit, cookieHeader: string, deadline: number): Promise<ProbeResult | null> {
  const budget = Math.min(PROBE_TIMEOUT_MS, deadline - Date.now())
  if (budget <= 0) return null
  try {
    const res = await fetch(u.url, {
      headers: { Cookie: cookieHeader },
      redirect: 'manual',
      signal: AbortSignal.timeout(budget),
    })
    const html = await res.text()
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: res.status, html })
  } catch {
    // Includes the abort. httpStatus: null is deriveStatus's 'fetch failed' ->
    // down path, which is the right verdict for a section that WAS asked and
    // could not answer inside its window. A unit never asked at all returns
    // above, before this.
    return deriveStatus({ surface: u.surface, clientSlug: u.clientSlug, section: u.section, httpStatus: null, html: '' })
  }
}
