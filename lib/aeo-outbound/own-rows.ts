// The brand's own domain rows, and the domain match behind them: one definition for the pull, the metrics and the
// competitor gaps (spec 2026-11-02 S2; Paul, #431 review), so they always agree on which sites are the brand's.

/** A domain as rows are matched on: trimmed, lowercase, no leading "www.". */
export const bareDomain = (d: string): string => d.trim().toLowerCase().replace(/^www\./, '')

/** True when bare domain `d` is bare `site` or a subdomain of it (spec 18.2). */
export const sameOrSubdomain = (d: string, site: string): boolean => d === site || d.endsWith(`.${site}`)

/** The own domains as rows are matched against: bare, with empty entries dropped so one can never match by suffix. */
export const ownDomainMatch = (domains: readonly string[] | null | undefined): string[] => (domains ?? []).map(bareDomain).filter(Boolean)

/** A row is own when Peec classifies it OWN, or its domain is an own domain or a subdomain of one (spec 18.2). */
export function ownRowsOf<R extends { domain: string; classification: string }>(rows: readonly R[], ownDomains: readonly string[] | null | undefined): R[] {
  const match = ownDomainMatch(ownDomains)
  return rows.filter((r) => {
    if (r.classification === 'OWN') return true
    const d = bareDomain(r.domain)
    return match.some((od) => sameOrSubdomain(d, od))
  })
}
