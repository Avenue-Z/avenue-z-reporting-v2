/**
 * ContentMatrix section — top pages with engagement + AI referral cross-ref.
 * GA4-only, no HubSpot — typically the fastest section to populate.
 */
import { ga4Query, parseDateRange } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import { ContentMatrix } from './content-matrix'
import type { MatrixPage } from './content-matrix'

interface Props {
  clientSlug: string
}

export async function ContentMatrixSection({ clientSlug }: Props) {
  const resolved = parseDateRange('last_30_days')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`

  const [pagesRes, aiRefRes] = await Promise.allSettled([
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions', 'engagementRate', 'averageSessionDuration'],
      dimensions: ['pagePath'],
      limit: 50,
    }),
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['pagePath', 'sessionSource'],
      limit: 500,
    }),
  ])

  const pageRows: MatrixPage[] = pagesRes.status === 'fulfilled'
    ? (pagesRes.value?.rows ?? [])
        .filter((r) => {
          const path = String(r.pagePath ?? '/')
          return ((r.sessions as number) ?? 0) >= 10 && path !== '/' && path !== '/home'
        })
        .slice(0, 30)
        .map((r) => ({
          path:           String(r.pagePath ?? '/'),
          sessions:       (r.sessions as number) ?? 0,
          engagementRate: (r.engagementRate as number) ?? 0,
          avgDuration:    (r.averageSessionDuration as number) ?? 0,
        }))
    : []

  const aiPageSessions: Record<string, number> = (() => {
    if (aiRefRes.status !== 'fulfilled') return {}
    const map: Record<string, number> = {}
    for (const r of aiRefRes.value?.rows ?? []) {
      const source = String(r.sessionSource ?? '').toLowerCase()
      if (!AI_REFERRER_DOMAINS.some((d) => source.includes(d))) continue
      const path     = String(r.pagePath ?? '/')
      const sessions = (r.sessions as number) ?? 0
      map[path] = (map[path] ?? 0) + sessions
    }
    return map
  })()

  return <ContentMatrix pages={pageRows} aiPageSessions={aiPageSessions} />
}
