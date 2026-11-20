// ─── Content performance rows (D-5, D-17) ───────────────────────────────────
// One pure builder for the merged content table, both scopes. Missing or
// incomplete source data is null (rendered `--`), never 0.
// ─────────────────────────────────────────────────────────────────────────────

import { labelFromPath } from '@/lib/url'
import type { AzBadge, CalendarPage } from '@/lib/content-calendar/pages'
import type { OwnedUrlCitations, UrlCitation } from './url-citations'
import { urlPromptIds } from './url-citations'
import type { CoverageProjection } from './coverage-projection'

export type PathMetrics = {
  aiReferred: number | null
  organic: number | null
  engagementRate: number | null
}

export type ContentPerformanceRow = {
  key: string
  title: string
  url: string
  slug: string
  badge: AzBadge | null
  publishDate: string | null
  lastOptimizedDate: string | null
  promptCoverage: number | null
  promptCoverageDelta: number | null
  citationShare: number | null
  citationShareDelta: number | null
  aiReferred: number | null
  aiReferredDelta: number | null
  organic: number | null
  organicDelta: number | null
  engagementRate: number | null
  engagementRateDelta: number | null
  scopes: ('az' | 'all')[]
}

/** Trailing-slash-insensitive path key (same rule content-impact.tsx uses locally). */
export function normPath(p: string): string {
  return p.replace(/\/$/, '') || '/'
}

/** Session-weighted mean engagement rate per normalised path (D-17). */
export function engagementRateByPath(
  rows: { pagePath: unknown; sessions: unknown; engagementRate: unknown }[],
): Map<string, number> {
  const acc = new Map<string, { w: number; sum: number }>()
  for (const r of rows) {
    const s = Number(r.sessions)
    const er = r.engagementRate == null ? NaN : Number(r.engagementRate)
    if (!Number.isFinite(er) || !Number.isFinite(s) || s <= 0) continue
    const p = normPath(String(r.pagePath ?? ''))
    const a = acc.get(p) ?? { w: 0, sum: 0 }
    a.w += s
    a.sum += er * s
    acc.set(p, a)
  }
  const out = new Map<string, number>()
  for (const [p, a] of acc) if (a.w > 0) out.set(p, a.sum / a.w)
  return out
}

function pathOf(url: string, urlKey: string): string {
  try { return normPath(new URL(url).pathname) }
  catch { return normPath('/' + urlKey.split('/').slice(1).join('/')) }
}

function pctChange(cur: number | null, prior: number | null): number | null {
  if (cur == null || prior == null || prior === 0) return null
  return ((cur - prior) / prior) * 100
}
function diff(cur: number | null, prior: number | null, scale = 1): number | null {
  if (cur == null || prior == null) return null
  return (cur - prior) * scale
}

function coveragePct(cov: CoverageProjection | null, key: string, total: number): number | null {
  if (!cov || !cov.complete || total <= 0) return null
  return (urlPromptIds(cov, key).length / total) * 100
}

function sharePct(o: OwnedUrlCitations | null, key: string): number | null {
  if (!o || !o.complete || o.totalCitationCount <= 0) return null
  const n = o.rows.find((r) => r.urlKey === key)?.citationCount ?? 0
  return (n / o.totalCitationCount) * 100
}

export function buildContentPerformanceRows(input: {
  pages: CalendarPage[]
  owned: OwnedUrlCitations
  ownedPrior: OwnedUrlCitations | null
  coverage: CoverageProjection
  coveragePrior: CoverageProjection | null
  totalTrackedPrompts: number
  current: (path: string) => PathMetrics
  prior: ((path: string) => PathMetrics) | null
}): ContentPerformanceRow[] {
  const { pages, owned, ownedPrior, coverage, coveragePrior, totalTrackedPrompts, current, prior } = input

  const az = new Map<string, CalendarPage>()
  for (const p of pages) if (p.published && !az.has(p.urlKey)) az.set(p.urlKey, p)
  const cited = new Map<string, UrlCitation>()
  for (const r of owned.rows) if (r.citationCount > 0 && !cited.has(r.urlKey)) cited.set(r.urlKey, r)

  const keys = [...az.keys(), ...[...cited.keys()].filter((k) => !az.has(k))]

  return keys.map((key): ContentPerformanceRow => {
    const cal = az.get(key)
    const peec = cited.get(key) ?? owned.rows.find((r) => r.urlKey === key)
    const url = cal?.url ?? peec?.url ?? `https://${key}`
    const path = pathOf(url, key)
    const cur = current(path)
    const pri = prior ? prior(path) : null

    const promptCoverage = coveragePct(coverage, key, totalTrackedPrompts)
    const citationShare = sharePct(owned, key)
    const engagementRate = cur.engagementRate

    return {
      key,
      title: cal?.topic || peec?.title || labelFromPath(url),
      url,
      slug: path,
      badge: cal ? cal.badge : null,
      publishDate: cal?.publishDate ?? null,
      lastOptimizedDate: cal?.lastOptimizedDate ?? null,
      promptCoverage,
      promptCoverageDelta: diff(promptCoverage, coveragePct(coveragePrior, key, totalTrackedPrompts)),
      citationShare,
      citationShareDelta: diff(citationShare, sharePct(ownedPrior, key)),
      aiReferred: cur.aiReferred,
      aiReferredDelta: pctChange(cur.aiReferred, pri?.aiReferred ?? null),
      organic: cur.organic,
      organicDelta: pctChange(cur.organic, pri?.organic ?? null),
      engagementRate,
      engagementRateDelta: diff(engagementRate, pri?.engagementRate ?? null, 100),
      scopes: cal ? ['az', 'all'] : ['all'] // All = union: every AZ row is also in All,
    }
  })
}

const NULLABLE_COLUMNS = [
  'promptCoverage', 'promptCoverageDelta', 'citationShare', 'citationShareDelta',
  'aiReferred', 'aiReferredDelta', 'organic', 'organicDelta',
  'engagementRate', 'engagementRateDelta', 'publishDate', 'lastOptimizedDate',
] as const

/** Null-cell count per nullable column (F-5). */
export function blankCountsByColumn(rows: ContentPerformanceRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of NULLABLE_COLUMNS) out[c] = rows.filter((r) => r[c] == null).length
  return out
}
