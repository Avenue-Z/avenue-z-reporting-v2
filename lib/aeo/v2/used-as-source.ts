// "Used as a source %" per brand for the AEO Overview v2 (Peec). Pure: the fetcher pulls the rows, this works out the share.
// A brand's share is the share of the window's answers that retrieved one of its domains. One matching row gives it
// directly; several rows must be de-duplicated per answer (summing would count an answer that retrieved two of the
// brand's domains twice), so that case needs the distinct count from a per-answer pull.
import { bareDomain, sameOrSubdomain } from '@/lib/aeo-outbound/own-rows'

export type DomainShareRow = { domain: string; answers: number; totalAnswers: number }

type BrandDomains = { name: string; domains: readonly string[] }

/** The rows whose domain is one of the brand's domains or a subdomain of one (the AEO outbound report's match). */
export function brandDomainRows(domains: readonly string[], rows: readonly DomainShareRow[]): DomainShareRow[] {
  const sites = domains.map(bareDomain).filter(Boolean)
  if (sites.length === 0) return []
  return rows.filter((r) => {
    const d = bareDomain(r.domain)
    return sites.some((s) => sameOrSubdomain(d, s))
  })
}

export function usedAsSourceByBrand(
  brands: readonly BrandDomains[],
  rows: readonly DomainShareRow[],
  distinct?: ReadonlyMap<string, number>,
): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const b of brands) {
    if (b.domains.length === 0 || rows.length === 0) {
      out.set(b.name, null)
      continue
    }
    const matched = brandDomainRows(b.domains, rows)
    if (matched.length === 0) {
      out.set(b.name, 0)
    } else if (matched.length === 1) {
      const m = matched[0]
      out.set(b.name, m.totalAnswers > 0 ? (m.answers / m.totalAnswers) * 100 : null)
    } else {
      const n = distinct?.get(b.name)
      const total = matched[0].totalAnswers
      out.set(b.name, n === undefined || total <= 0 ? null : (n / total) * 100)
    }
  }
  return out
}

/** Brands with more than one matching row, with the matched row domains. */
export function multiRowBrands(
  brands: readonly BrandDomains[],
  rows: readonly DomainShareRow[],
): { name: string; domains: string[] }[] {
  const out: { name: string; domains: string[] }[] = []
  for (const b of brands) {
    const matched = brandDomainRows(b.domains, rows)
    if (matched.length > 1) out.push({ name: b.name, domains: matched.map((r) => r.domain) })
  }
  return out
}

/** Distinct answers (chat ids) per brand over its matched domains. */
export function distinctAnswersByBrand(
  multi: { name: string; domains: string[] }[],
  chatRows: readonly { domain: string; chat?: { id: string } }[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const b of multi) {
    const domains = new Set(b.domains.map(bareDomain))
    const ids = new Set<string>()
    for (const r of chatRows) {
      if (r.chat?.id && domains.has(bareDomain(r.domain))) ids.add(r.chat.id)
    }
    out.set(b.name, ids.size)
  }
  return out
}
