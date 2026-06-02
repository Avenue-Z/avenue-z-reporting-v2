/**
 * CitationBreakdown section — referral domains from GA4 + top citation
 * domains from Peec. No HubSpot, no rate-limit concerns.
 */
import { ga4Query, parseDateRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { CitationBreakdown } from './citation-breakdown'
import type { ReferralDomain } from './citation-breakdown'

interface Props {
  clientSlug: string
}

export async function CitationBreakdownSection({ clientSlug }: Props) {
  const resolved = parseDateRange('last_30_days')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`

  const [referralRes, peecRes] = await Promise.allSettled([
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionSource', 'sessionMedium'],
      limit: 100,
    }),
    getPeecOverview(clientSlug),
  ])

  const referralDomains: ReferralDomain[] = (() => {
    if (referralRes.status !== 'fulfilled') return []
    const sessionMap: Record<string, number> = {}
    for (const r of referralRes.value?.rows ?? []) {
      if (String(r.sessionMedium ?? '').toLowerCase() !== 'referral') continue
      const domain   = String(r.sessionSource ?? '').replace(/^www\./, '')
      const sessions = (r.sessions as number) ?? 0
      sessionMap[domain] = (sessionMap[domain] ?? 0) + sessions
    }
    return Object.entries(sessionMap)
      .map(([domain, sessions]) => ({ domain, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8)
  })()

  const peec = peecRes.status === 'fulfilled' ? peecRes.value : null
  const topDomains = peec?.domainsByRange?.['YTD']
    ?? peec?.domainsByRange?.['Last 30 Days']
    ?? []

  return (
    <CitationBreakdown
      referralDomains={referralDomains}
      topDomains={topDomains}
    />
  )
}
