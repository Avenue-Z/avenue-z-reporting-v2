/**
 * Sample SFData for demo mode. Used when demoMode is on AND the real
 * Screaming Frog fetch returned null (no sfCsvFileId configured) or
 * errored. Powers Sections A (KPIs), B (delta table), C (trends), and
 * E (page overlap) in Technical Audit so the demo shows realistic
 * crawl-health data.
 */
import type {
  SFData, SFSnapshot, SFIssueSummary, SFIssueDelta, SFSeverity, SFOwner,
} from '@/lib/screaming-frog/types'

const CURRENT_DATE = '2026-06-01'
const PREV_DATE    = '2026-05-04'

// exampleUrl must be ABSOLUTE — downstream code calls `new URL(exampleUrl).pathname`
// which throws on relative paths. Real Screaming Frog exports always return
// absolute URLs, so the fixture matches that shape.
const ISSUE_SUMMARIES: SFIssueSummary[] = [
  { checkId: 'missing-meta-description', checkName: 'Missing Meta Description', category: 'Meta',         severity: 'Medium',   count: 47, exampleUrl: 'https://avenuez.com/services/aeo' },
  { checkId: 'duplicate-title-tag',      checkName: 'Duplicate Title Tag',      category: 'Meta',         severity: 'High',     count: 12, exampleUrl: 'https://avenuez.com/about' },
  { checkId: 'broken-internal-link',     checkName: 'Broken Internal Link',     category: 'Links',        severity: 'Critical', count:  4, exampleUrl: 'https://avenuez.com/old/branding-services' },
  { checkId: 'images-missing-alt',       checkName: 'Images Missing Alt Text',  category: 'Accessibility',severity: 'Medium',   count: 89, exampleUrl: 'https://avenuez.com/blog/audit-brand-chatgpt' },
  { checkId: 'missing-canonical',        checkName: 'Missing Canonical Tag',    category: 'Indexing',     severity: 'High',     count: 18, exampleUrl: 'https://avenuez.com/pricing' },
  { checkId: 'redirect-chain-3plus',     checkName: 'Redirect Chain (3+)',      category: 'Redirects',    severity: 'Medium',   count:  6, exampleUrl: 'https://avenuez.com/services' },
  { checkId: 'h1-missing',               checkName: 'H1 Missing',               category: 'Content',      severity: 'High',     count:  8, exampleUrl: 'https://avenuez.com/methodology/brand-authority' },
  { checkId: 'low-word-count',           checkName: 'Low Word Count',           category: 'Content',      severity: 'Low',      count: 23, exampleUrl: 'https://avenuez.com/resources/geo-glossary' },
  { checkId: 'slow-load-time',           checkName: 'Slow Page Load (>3s)',     category: 'Performance', severity: 'High',     count: 14, exampleUrl: 'https://avenuez.com/case-studies/renaissance-benefits' },
  { checkId: 'mobile-viewport',          checkName: 'Mobile Viewport Issue',    category: 'Mobile',       severity: 'Critical', count:  2, exampleUrl: 'https://avenuez.com/press/techcrunch-feature' },
  { checkId: 'mixed-content-warning',    checkName: 'Mixed Content Warning',    category: 'Security',     severity: 'High',     count:  5, exampleUrl: 'https://avenuez.com/insights/2026-ai-trends' },
  { checkId: 'orphan-page',              checkName: 'Orphan Page',              category: 'Links',        severity: 'Low',      count: 11, exampleUrl: 'https://avenuez.com/blog/llm-citation-patterns' },
]

const PREV_ISSUE_SUMMARIES: SFIssueSummary[] = ISSUE_SUMMARIES.map(s => ({
  ...s,
  count: Math.max(0, s.count + ({Critical: 2, High: 5, Medium: -3, Low: 8}[s.severity as SFSeverity])),
}))

function sumBySeverity(items: SFIssueSummary[], sev: SFSeverity): number {
  return items.filter(i => i.severity === sev).reduce((s, i) => s + i.count, 0)
}

function snap(date: string, items: SFIssueSummary[]): SFSnapshot {
  const totalIssues = items.reduce((s, i) => s + i.count, 0)
  return {
    crawlDate: date,
    totalUrls: 1247,
    htmlUrls: 1098,
    criticalCount: sumBySeverity(items, 'Critical'),
    highCount:     sumBySeverity(items, 'High'),
    mediumCount:   sumBySeverity(items, 'Medium'),
    lowCount:      sumBySeverity(items, 'Low'),
    totalIssues,
    topIssues: items.slice().sort((a, b) => b.count - a.count).slice(0, 5),
    issueSummaries: items,
  }
}

function delta(items: SFIssueSummary[], prevItems: SFIssueSummary[]): SFIssueDelta[] {
  const owners: SFOwner[] = ['SEO', 'Dev', 'Content']
  return items.map((c, i) => {
    const prevCount = prevItems[i]?.count ?? 0
    const d = c.count - prevCount
    const status = d > 0 ? 'New' : d < 0 ? 'Improved' : 'Persistent'
    return {
      checkId: c.checkId,
      checkName: c.checkName,
      category: c.category,
      severity: c.severity,
      prevCount,
      currentCount: c.count,
      delta: d,
      status,
      exampleUrl: c.exampleUrl,
      recommendedAction: `Resolve ${c.checkName.toLowerCase()} on affected pages`,
      owner: owners[i % owners.length],
    }
  })
}

function weightedScore(items: SFIssueSummary[]): number {
  const weights: Record<SFSeverity, number> = { Critical: 10, High: 5, Medium: 2, Low: 1 }
  return items.reduce((s, i) => s + i.count * weights[i.severity], 0)
}

export function sampleSFData(): SFData {
  const current = snap(CURRENT_DATE, ISSUE_SUMMARIES)
  const prev    = snap(PREV_DATE, PREV_ISSUE_SUMMARIES)
  const deltas  = delta(ISSUE_SUMMARIES, PREV_ISSUE_SUMMARIES)
  return {
    current,
    prev,
    delta: deltas,
    newIssues:        deltas.filter(d => d.status === 'New').reduce((s, d) => s + d.delta, 0),
    resolvedIssues:   deltas.filter(d => d.status === 'Improved').reduce((s, d) => s + Math.abs(d.delta), 0),
    persistentIssues: deltas.filter(d => d.status === 'Persistent').length,
    weightedScore:     weightedScore(ISSUE_SUMMARIES),
    prevWeightedScore: weightedScore(PREV_ISSUE_SUMMARIES),
  }
}
