// lib/peec/cited-urls.ts
// Peec side of the AEO Overview v2 Cited Sources URL table: one window of /reports/urls
// plus /reports/domains (source class and the window's chat total), mapped to the
// shared row shape in lib/aeo/cited-urls.ts.
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'
import {
  post,
  fetchAllPagesChecked,
  walkReportingDuplicates,
  hostOf,
  CITATION_PAGE_SIZE,
  CITATION_MAX_PAGES,
  type ApiUrlRow,
} from '@/lib/peec/url-citations'
import {
  emptyCitedUrls,
  joinWindows,
  windowTooLong,
  type CitedUrls,
  type IsoWindow,
  type SourceType,
  type UrlWindow,
  type UrlWindowRow,
} from '@/lib/aeo/cited-urls'

export type PeecDomainRow = {
  domain: string
  classification: string | null
  total_chat_count: number
}

const DOMAIN_PAGE_SIZE = 10_000
const DOMAIN_MAX_PAGES = 5

export function peecPageTypeLabel(c: string | null): string | null {
  if (c === null) return null
  if (c === 'HOW_TO_GUIDE') return 'How-to guide'
  if (c === 'UGC') return 'UGC'
  const s = c.toLowerCase().replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const THIRD_PARTY_LABELS: Record<string, string> = {
  CORPORATE: 'Corporate',
  EDITORIAL: 'Editorial',
  UGC: 'UGC',
  REFERENCE: 'Reference',
  INSTITUTIONAL: 'Institutional',
}

function classifySource(c: string | undefined): { sourceType: SourceType; sourceLabel: string } {
  if (c === 'OWN') return { sourceType: 'own', sourceLabel: 'Own' }
  if (c === 'COMPETITOR') return { sourceType: 'competitor', sourceLabel: 'Competitor' }
  return { sourceType: 'third_party', sourceLabel: (c && THIRD_PARTY_LABELS[c]) || 'Other' }
}

export function peecSource(
  host: string,
  classByDomain: Map<string, string>,
): { sourceType: SourceType; sourceLabel: string } {
  const parts = host.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    const c = classByDomain.get(parts.slice(i).join('.'))
    if (c !== undefined) return classifySource(c)
  }
  return classifySource(undefined)
}

export function mapPeecWindow(urls: ApiUrlRow[], domains: PeecDomainRow[], complete: boolean): UrlWindow {
  const classByDomain = new Map<string, string>()
  for (const d of domains) {
    if (d.classification) classByDomain.set(d.domain.trim().toLowerCase().replace(/^www\./, ''), d.classification)
  }
  const byKey = new Map<string, UrlWindowRow>()
  let totalCitations = 0
  for (const r of urls) {
    totalCitations += r.citation_count
    const key = urlJoinKey(r.url)
    if (!key) continue
    const seen = byKey.get(key)
    if (seen) {
      seen.answersUsing += r.retrieval_count
      seen.citations += r.citation_count
      continue
    }
    byKey.set(key, {
      key,
      url: r.url,
      title: r.title ?? null,
      ...peecSource(hostOf(r.url), classByDomain),
      pageType: peecPageTypeLabel(r.classification),
      answersUsing: r.retrieval_count,
      citations: r.citation_count,
    })
  }
  return {
    rows: [...byKey.values()],
    totalAnswers: domains[0]?.total_chat_count ?? 0,
    totalCitations,
    complete,
  }
}

async function fetchWindow(pid: string, w: IsoWindow): Promise<UrlWindow> {
  const range = { start_date: w.startDate, end_date: w.endDate }
  const [urls, domains] = await Promise.all([
    walkReportingDuplicates(
      () => fetchAllPagesChecked<ApiUrlRow>(
        (offset, limit) =>
          post<{ data: ApiUrlRow[]; totalCount?: number }>('/reports/urls', { ...range, limit, offset }, pid)
            .then((r) => ({ rows: r.data ?? [], totalCount: r.totalCount })),
        { pageSize: CITATION_PAGE_SIZE, maxPages: CITATION_MAX_PAGES, label: 'cited sources (urls)', rowKey: (r) => r.url },
      ),
      'cited sources urls',
    ),
    walkReportingDuplicates(
      () => fetchAllPagesChecked<PeecDomainRow>(
        (offset, limit) =>
          post<{ data: PeecDomainRow[]; totalCount?: number }>('/reports/domains', { ...range, limit, offset }, pid)
            .then((r) => ({ rows: r.data ?? [], totalCount: r.totalCount })),
        { pageSize: DOMAIN_PAGE_SIZE, maxPages: DOMAIN_MAX_PAGES, label: 'cited sources (domains)', rowKey: (r) => r.domain },
      ),
      'cited sources domains',
    ),
  ])
  return mapPeecWindow(urls.rows, domains.rows, urls.complete && domains.complete)
}

async function getPeecCitedUrlsImpl(
  clientSlug: string,
  current: IsoWindow,
  prior: IsoWindow | null,
): Promise<CitedUrls> {
  if (windowTooLong(current) || (prior && windowTooLong(prior))) return emptyCitedUrls('peec', { tooLong: true })
  const { getClientBySlug } = await import('@/lib/db/queries')
  const pid = (await getClientBySlug(clientSlug))?.peecCustomerProjectId
  if (!pid) return emptyCitedUrls('peec')
  try {
    const [cur, pri] = await Promise.all([
      fetchWindow(pid, current),
      prior ? fetchWindow(pid, prior) : Promise.resolve(null),
    ])
    return joinWindows('peec', cur, pri)
  } catch (e) {
    console.error('[cited-sources] peec fetch failed', {
      client: clientSlug, start: current.startDate, end: current.endDate,
    })
    throw e
  }
}

export const getPeecCitedUrls = cached('peec', 'getPeecCitedUrls', getPeecCitedUrlsImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug }),
})
