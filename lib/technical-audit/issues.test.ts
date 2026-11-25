import { describe, it, expect } from 'vitest'
import { mergeIssues, normalizeSeverity, type IssueMap } from './issues'
import type { SourceIssue } from './types'

const map: IssueMap = new Map([
  ['ahrefs:4XX page', { key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' }],
  ['sf:Internal Client Error (4xx)', { key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' }],
  ['gsc_indexing:Not found (404)', { key: 'broken-internal-4xx', name: 'Broken internal pages (4xx)' }],
])
const fourxx: SourceIssue[] = [
  { source: 'gsc_indexing', nativeName: 'Not found (404)', nativeSeverity: '', urlCount: 121 },
  { source: 'sf', nativeName: 'Internal Client Error (4xx)', nativeSeverity: 'High', urlCount: 148 },
  { source: 'ahrefs', nativeName: '4XX page', nativeSeverity: 'Error', urlCount: 132 },
]

describe('mergeIssues', () => {
  it('merges three tools\' 4xx rows into one with max URLs', () => {
    const [m, ...rest] = mergeIssues(fourxx, map)
    expect(rest).toHaveLength(0)
    expect(m.key).toBe('broken-internal-4xx')
    expect(m.urls).toBe(148)
    expect(m.sources).toEqual(['ahrefs', 'sf', 'gsc_indexing'])
    expect(m.detail.map((d) => [d.source, d.urlCount])).toEqual([['ahrefs', 132], ['sf', 148], ['gsc_indexing', 121]])
    expect(m.needsMapping).toBe(false)
  })

  it('severity is the highest contributor', () => {
    const m = mergeIssues([
      { source: 'ahrefs', nativeName: '4XX page', nativeSeverity: 'Notice', urlCount: 5 },
      { source: 'sf', nativeName: 'Internal Client Error (4xx)', nativeSeverity: 'Medium', urlCount: 3 },
    ], map)
    expect(m[0].severity).toBe('medium')
  })

  it("GSC 'Page with redirect' normalizes to low (dash/case variants too)", () => {
    expect(normalizeSeverity('gsc_indexing', 'Page with redirect', '')).toBe('low')
    expect(normalizeSeverity('gsc_indexing', 'Crawled – currently not indexed', '')).toBe('medium')
    expect(normalizeSeverity('gsc_indexing', 'Something new', '')).toBe('medium')
    expect(normalizeSeverity('gsc_cwv', 'LCP', 'Poor')).toBe('high')
    expect(normalizeSeverity('ahrefs', 'x', 'ERROR')).toBe('high')
  })

  it('priority matches the formula', () => {
    expect(mergeIssues(fourxx, map)[0].priority).toBeCloseTo(3 * Math.log10(149) * 1.5, 6)
  })

  it('unmapped issues keep their native name and are flagged', () => {
    const [m] = mergeIssues([{ source: 'ahrefs', nativeName: 'Weird thing', nativeSeverity: 'Warning', urlCount: 9 }], new Map())
    expect(m).toMatchObject({ key: 'ahrefs:Weird thing', name: 'Weird thing', needsMapping: true, severity: 'medium' })
  })

  it('empty input and zero-count rows yield an empty list', () => {
    expect(mergeIssues([], map)).toEqual([])
    expect(mergeIssues([{ source: 'ahrefs', nativeName: '4XX page', nativeSeverity: 'Error', urlCount: 0 }], map)).toEqual([])
  })

  it('duplicate rows from one source take the max, not the sum', () => {
    const [m] = mergeIssues([
      { source: 'ahrefs', nativeName: '4XX page', nativeSeverity: 'Error', urlCount: 10 },
      { source: 'ahrefs', nativeName: '4XX page', nativeSeverity: 'Error', urlCount: 40 },
    ], map)
    expect(m.urls).toBe(40)
    expect(m.detail).toHaveLength(1)
  })

  it('ties break by urls desc, then name', () => {
    const issues: SourceIssue[] = [
      { source: 'sf', nativeName: 'Beta', nativeSeverity: 'Low', urlCount: 5 },
      { source: 'sf', nativeName: 'Alpha', nativeSeverity: 'Low', urlCount: 5 },
      { source: 'sf', nativeName: 'Gamma', nativeSeverity: 'Low', urlCount: 5 },
    ]
    expect(mergeIssues(issues, new Map()).map((m) => m.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('looks up map entries tolerant of dash and case differences', () => {
    const m2: IssueMap = new Map([['gsc_indexing:Crawled - currently not indexed', { key: 'crawled-ni', name: 'Crawled, not indexed' }]])
    const [m] = mergeIssues([{ source: 'gsc_indexing', nativeName: 'Crawled – Currently not indexed', nativeSeverity: '', urlCount: 3 }], m2)
    expect(m.key).toBe('crawled-ni')
  })
})
