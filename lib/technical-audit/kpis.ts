import type { MetricsRow } from './store'

/** The metric columns only: no row id, snapshot id or timestamps. */
export type ViewMetrics = Omit<MetricsRow, 'id' | 'snapshotId'>

export function toViewMetrics(m: MetricsRow | null): ViewMetrics | null {
  if (!m) return null
  const { id: _id, snapshotId: _snapshotId, ...cols } = m
  return cols
}

export type KpiKey = 'health' | 'sf_issue_types' | 'indexed' | 'not_indexed' | 'cwv_poor_mobile' | 'cwv_good_pct_mobile'
export type KpiDef = { key: KpiKey; label: string; better: 'higher' | 'lower'; unit: 'pts' | 'count' | 'pct' }

/** Spec Appendix A.1. */
export const KPI_DEFS: readonly KpiDef[] = [
  { key: 'health', label: 'Health Score', better: 'higher', unit: 'pts' },
  { key: 'sf_issue_types', label: 'Issues (issue types)', better: 'lower', unit: 'count' },
  { key: 'indexed', label: 'Indexed pages', better: 'higher', unit: 'count' },
  { key: 'not_indexed', label: 'Not indexed pages', better: 'lower', unit: 'count' },
  { key: 'cwv_poor_mobile', label: 'Poor CWV URLs (mobile)', better: 'lower', unit: 'count' },
  { key: 'cwv_good_pct_mobile', label: 'Good CWV URLs % (mobile)', better: 'higher', unit: 'pct' },
]

export function kpiValue(key: KpiKey, m: ViewMetrics | null): number | null {
  if (!m) return null
  switch (key) {
    case 'health': return m.ahrefsHealthScore
    case 'sf_issue_types': return m.sfIssueTypesIssue
    case 'indexed': return m.gscIndexed
    case 'not_indexed': return m.gscNotIndexed
    case 'cwv_poor_mobile': return m.cwvMobilePoor
    case 'cwv_good_pct_mobile': {
      const { cwvMobilePoor: poor, cwvMobileNi: ni, cwvMobileGood: good } = m
      if (poor === null || ni === null || good === null) return null
      const total = poor + ni + good
      return total === 0 ? null : (good / total) * 100
    }
  }
}

export function kpiDelta(cur: number | null, prev: number | null): number | null {
  return cur === null || prev === null ? null : cur - prev
}

export function deltaTone(key: KpiKey, delta: number | null): 'good' | 'bad' | 'flat' | null {
  if (delta === null) return null
  if (delta === 0) return 'flat'
  const better = KPI_DEFS.find((d) => d.key === key)?.better
  return (delta > 0) === (better === 'higher') ? 'good' : 'bad'
}
