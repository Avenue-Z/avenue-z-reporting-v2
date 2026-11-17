import { BqUnavailable } from './errors'

export type BqSource = 'googleads' | 'linkedin'

const FLAG: Record<BqSource, string> = {
  googleads: 'DATA_BACKEND_GOOGLEADS',
  linkedin: 'DATA_BACKEND_LINKEDIN',
}

/** BigQuery serves a section only when its source is switched to `bq` AND the client is allowlisted. */
export function bqEnabled(source: BqSource, slug: string): boolean {
  if (process.env[FLAG[source]] !== 'bq') return false
  const allow = (process.env.BQ_CLIENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return allow.includes(slug)
}

/**
 * One greppable line per BigQuery miss, so a reviewer can see which client missed, and why, at 3am.
 * `served` says what the viewer got instead: live Supermetrics (LinkedIn), or nothing (Google Ads since C3).
 * The event keeps its C1 name so the `reason=error` acceptance count still finds it.
 */
export function logBqFallback(source: BqSource, slug: string, err: unknown, served: 'live' | 'none' = 'live'): void {
  const reason = err instanceof BqUnavailable ? err.reason : 'error'
  const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
  console.warn(JSON.stringify({ event: 'bq_fallback', source, slug, reason, served, detail }))
}
