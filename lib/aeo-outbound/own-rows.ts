// The brand's own domain rows: one definition for the pull and the metrics (spec 2026-11-02 S2), so the extra call by
// answer and the stats it feeds always agree on which sites are the brand's.
const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, '')

/** The own domains as rows are matched against: bare, with empty entries dropped so one can never match by suffix. */
export const ownDomainMatch = (domains: readonly string[] | null | undefined): string[] => (domains ?? []).map(bare).filter(Boolean)

/** A row is own when Peec classifies it OWN, or its domain is an own domain or a subdomain of one (spec 18.2). */
export function ownRowsOf<R extends { domain: string; classification: string }>(rows: readonly R[], ownDomains: readonly string[] | null | undefined): R[] {
  const match = ownDomainMatch(ownDomains)
  return rows.filter((r) => {
    if (r.classification === 'OWN') return true
    const d = bare(r.domain)
    return match.some((od) => d === od || d.endsWith(`.${od}`))
  })
}
