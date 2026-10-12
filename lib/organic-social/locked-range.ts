// Server glue for locked months (spec 4.2). `lockedRangeFor` returns null for any client without
// reportingMonths, and every caller treats null as "do exactly what you do today".
import { cache } from 'react'
import { clockFor, hasReportingMonths, resolveLockedRange, viewerForRole, type Clock, type LockedRange } from './reporting-months'

/** One clock per request, shared by the route, the picker, the section and Commentary (spec 3.2).
 *  Outside a request React's cache does not memoise, so callers pass the clock down explicitly. */
export const requestClock = cache((): Clock => clockFor(new Date()))

export function lockedRangeFor(client: unknown, role: unknown, requested: unknown, clock: Clock): LockedRange | null {
  if (!hasReportingMonths(client)) return null
  const cfg = (client as { dashSocialConfig: Record<string, unknown> }).dashSocialConfig.reportingMonths
  return resolveLockedRange(cfg, viewerForRole(role), clock, requested)
}

const escapeLineSeparators = (s: string) => s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** One line per hidden-month attempt, from exactly one layer per request. The request is untrusted:
 *  normalised to a string, cut to 64 characters, JSON-escaped. */
export function logHiddenMonthAttempt(slug: string, requested: unknown, served: string): void {
  const raw = typeof requested === 'string' ? requested : Array.isArray(requested) ? requested.map(String).join(',') : String(requested)
  const cut = escapeLineSeparators(JSON.stringify(raw.slice(0, 64)))
  console.warn(`[organic-social] hidden month attempt slug=${slug} served=${served} requested=${cut}`)
}

/** The slug and the key at fault only: the config holds the brand id and is never logged. */
export function logMalformedConfig(slug: string, key: string | null): void {
  console.error(`[organic-social] reportingMonths setting is invalid slug=${slug} key=${key ?? 'reportingMonths'}`)
}
