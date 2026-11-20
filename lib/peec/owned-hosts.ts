// lib/peec/owned-hosts.ts
import { urlJoinKey } from '@/lib/url'

/** Join keys of the client's Own domains (Peec /reports/domains classification). */
export function ownedHostKeys(ownDomains: { domain: string }[]): Set<string> {
  return new Set(
    ownDomains.map((d) => urlJoinKey(d.domain)).filter((k): k is string => k !== null),
  )
}

/**
 * FB-050: parent-domain suffix match so blog.X.com counts as owned when X.com is
 * Own. Exact equality handles the root domain; the endsWith check catches all
 * subdomains. The dot-prefix prevents x.com from matching notx.com.
 */
export function isOwnedHost(hostKey: string | null, owned: Set<string>): boolean {
  if (!hostKey) return false
  for (const key of owned) {
    if (hostKey === key || hostKey.endsWith(`.${key}`)) return true
  }
  return false
}
