import type { Severity, SourceIssue, TaIssueSource } from './types'

/** Ranking weights (spec §6.4). */
export const SEVERITY_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 }
const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high']
const SOURCE_ORDER: TaIssueSource[] = ['ahrefs', 'sf', 'gsc_indexing', 'gsc_cwv']

export type IssueMap = Map<string, { key: string; name: string }>

export interface MergedIssue {
  key: string
  name: string
  severity: Severity
  urls: number
  sources: TaIssueSource[]
  detail: { source: TaIssueSource; nativeName: string; urlCount: number }[]
  needsMapping: boolean
  priority: number
}

/** Case/dash/whitespace-insensitive form used for label and map lookups. */
export function normalizeLabel(s: string): string {
  return s.replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase()
}

const GSC_INDEXING_SEVERITY = new Map<string, Severity>([
  ...[
    'Server error (5xx)', 'Not found (404)', 'Soft 404', 'Redirect error',
    'Blocked by robots.txt', 'Blocked due to unauthorized request (401)',
  ].map((n) => [normalizeLabel(n), 'high'] as const),
  ...[
    'Crawled - currently not indexed', 'Discovered - currently not indexed',
    'Duplicate without user-selected canonical', 'Duplicate, Google chose different canonical than user',
    'Google chose different canonical than user',
  ].map((n) => [normalizeLabel(n), 'medium'] as const),
  ...[
    'Alternate page with proper canonical tag', 'Page with redirect', "Excluded by 'noindex' tag",
  ].map((n) => [normalizeLabel(n), 'low'] as const),
])

const TOOL_LABEL: Record<string, Severity> = {
  error: 'high', warning: 'medium', notice: 'low',
  high: 'high', medium: 'medium', low: 'low',
}

/** Spec Appendix A.2. Anything unrecognised is `medium` (conservative; GSC reasons are flagged elsewhere). */
export function normalizeSeverity(source: TaIssueSource, nativeName: string, nativeSeverity: string): Severity {
  const sev = normalizeLabel(nativeSeverity)
  switch (source) {
    case 'ahrefs':
    case 'sf':
      return TOOL_LABEL[sev] ?? 'medium'
    case 'gsc_indexing':
      return GSC_INDEXING_SEVERITY.get(normalizeLabel(nativeName)) ?? 'medium'
    case 'gsc_cwv':
      return sev === 'poor' ? 'high' : 'medium'
  }
}

/** weight(sev) x log10(urls + 1) x (1 + 0.25 x (sources - 1)). */
export function priorityOf(severity: Severity, urls: number, sourceCount: number): number {
  return SEVERITY_WEIGHT[severity] * Math.log10(urls + 1) * (1 + 0.25 * (sourceCount - 1))
}

const maxSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b

/**
 * Merge per-tool issues into one ranked list. URLs = max across contributors (never the sum),
 * severity = highest contributor. Zero/invalid-count rows are dropped (nothing to investigate).
 */
export function mergeIssues(issues: SourceIssue[], map: IssueMap): MergedIssue[] {
  let normalizedIndex: Map<string, { key: string; name: string }> | undefined
  const lookup = (source: TaIssueSource, nativeName: string) => {
    const exact = map.get(`${source}:${nativeName}`)
    if (exact) return exact
    if (!normalizedIndex) {
      normalizedIndex = new Map()
      for (const [k, v] of map) normalizedIndex.set(normalizeLabel(k), v)
    }
    return normalizedIndex.get(normalizeLabel(`${source}:${nativeName}`))
  }

  const groups = new Map<string, MergedIssue>()
  for (const issue of issues) {
    if (!Number.isFinite(issue.urlCount) || issue.urlCount <= 0) continue
    const mapped = lookup(issue.source, issue.nativeName)
    const key = mapped?.key ?? `${issue.source}:${issue.nativeName}`
    const severity = normalizeSeverity(issue.source, issue.nativeName, issue.nativeSeverity)
    let g = groups.get(key)
    if (!g) {
      g = {
        key, name: mapped?.name ?? issue.nativeName, severity, urls: 0,
        sources: [], detail: [], needsMapping: !mapped, priority: 0,
      }
      groups.set(key, g)
    }
    g.severity = maxSeverity(g.severity, severity)
    g.urls = Math.max(g.urls, issue.urlCount)
    if (!g.sources.includes(issue.source)) g.sources.push(issue.source)
    const existing = g.detail.find((d) => d.source === issue.source && d.nativeName === issue.nativeName)
    if (existing) existing.urlCount = Math.max(existing.urlCount, issue.urlCount)
    else g.detail.push({ source: issue.source, nativeName: issue.nativeName, urlCount: issue.urlCount })
  }

  const out = [...groups.values()]
  for (const g of out) {
    g.sources.sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))
    g.detail.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))
    g.priority = priorityOf(g.severity, g.urls, g.sources.length)
  }
  return out.sort(
    (a, b) => b.priority - a.priority || b.urls - a.urls || a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
  )
}
