import { BqUnavailable } from './errors'

export type BqSource = 'googleads' | 'linkedin'

const FLAG: Record<BqSource, string> = {
  googleads: 'DATA_BACKEND_GOOGLEADS',
  linkedin: 'DATA_BACKEND_LINKEDIN',
}

/** BigQuery serves a section only when its source is switched to `bq` AND the client is allowlisted. */
export function useBq(source: BqSource, slug: string): boolean {
  if (process.env[FLAG[source]] !== 'bq') return false
  const allow = (process.env.BQ_CLIENTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return allow.includes(slug)
}

/** One greppable line per fallback, so a reviewer can see which client fell back, and why, at 3am. */
export function logBqFallback(source: BqSource, slug: string, err: unknown): void {
  const reason = err instanceof BqUnavailable ? err.reason : 'error'
  const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
  console.warn(JSON.stringify({ event: 'bq_fallback', source, slug, reason, detail }))
}
