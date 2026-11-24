// Option B of the design overhaul (docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3): a client
// gets the design kit only on months on or after its own `dash_social_config.designFrom`. Pure and synchronous, no I/O:
// the config is jsonb and untrusted at runtime, so every input is `unknown`. Written only by the guarded pin script.
import { parseReportingMonths, resolveLockedRange, type Clock } from './reporting-months'

export type DesignFrom = { kind: 'absent' } | { kind: 'ok'; month: string } | { kind: 'malformed'; value: unknown }

// The same month format as reporting-months.ts (not exported there; that file is on Renaissance's path and untouched).
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Absent = no OWN designFrom key on a plain dash_social_config (the same test as hasReportingMonths). Any present value
 *  that is not `YYYY-MM`, `null` included, is malformed. */
export function parseDesignFrom(client: unknown): DesignFrom {
  const cfg = isPlainObject(client) ? client.dashSocialConfig : undefined
  if (!isPlainObject(cfg) || !hasOwn(cfg, 'designFrom')) return { kind: 'absent' }
  const value = cfg.designFrom
  return typeof value === 'string' && MONTH_RE.test(value) ? { kind: 'ok', month: value } : { kind: 'malformed', value }
}

/** The one rule: the kit applies only to a served month on or after a valid designFrom. Absent, malformed, or no served
 *  month: the old look. Month keys compare as strings. */
export function kitActive(client: unknown, monthKey: string | null): boolean {
  const d = parseDesignFrom(client)
  return d.kind === 'ok' && monthKey !== null && monthKey >= d.month
}

const escapeLineSeparators = (s: string) => s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** The slug and the bad value only (cut to 32 characters, JSON-escaped): the config holds the brand id, never logged. */
export function logMalformedDesignFrom(slug: string, value: unknown): void {
  const raw = typeof value === 'string' ? value : String(value)
  console.error(`[organic-social] designFrom setting is invalid slug=${slug} value=${escapeLineSeparators(JSON.stringify(raw.slice(0, 32)))}`)
}

/** Why the pin script must not write `designFrom` into this dash_social_config, or null when it may. Refuses a value
 *  that is not `YYYY-MM`, a config that already has designFrom (moving a start month is its own change), a config whose
 *  reportingMonths is missing or does not parse, and a month at or before the newest month a client can already see
 *  (that would redraw a delivered month in the kit). */
export function designFromWriteProblem(dashSocialConfig: unknown, designFrom: string, clock: Clock): string | null {
  if (typeof designFrom !== 'string' || !MONTH_RE.test(designFrom)) return `designFrom must be YYYY-MM, got ${JSON.stringify(designFrom)}`
  if (!isPlainObject(dashSocialConfig)) return 'dash_social_config is not an object'
  if (hasOwn(dashSocialConfig, 'designFrom')) return `dash_social_config already has designFrom (${JSON.stringify(dashSocialConfig.designFrom)}); moving it is its own change`
  if (!hasOwn(dashSocialConfig, 'reportingMonths')) return 'dash_social_config has no reportingMonths, so the client would never get the kit'
  if (!parseReportingMonths(dashSocialConfig.reportingMonths).ok) return 'dash_social_config.reportingMonths does not parse'
  const seen = resolveLockedRange(dashSocialConfig.reportingMonths, 'client', clock, undefined).months
  const newest = seen[0]?.key
  if (newest !== undefined && newest >= designFrom) return `a client can already see ${newest}, so designFrom ${designFrom} would redraw a delivered month`
  return null
}
