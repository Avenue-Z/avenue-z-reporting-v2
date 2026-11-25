export const TA_SOURCES = ['sf', 'ahrefs', 'gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'] as const
export type TaSource = (typeof TA_SOURCES)[number]
export type TaRunStatus = 'pending' | 'complete' | 'failed' | 'missing'
export type TaIssueSource = 'ahrefs' | 'sf' | 'gsc_indexing' | 'gsc_cwv'
export type Severity = 'high' | 'medium' | 'low'
export type Device = 'mobile' | 'desktop'

export interface SourceIssue {
  source: TaIssueSource
  nativeName: string
  nativeSeverity: string
  urlCount: number
  device?: Device
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string }

export interface SfResult {
  crawlDate: string
  issueTypes: { issue: number; warning: number; opportunity: number }
  urls: { issue: number; warning: number; opportunity: number }
  issues: SourceIssue[]
}
export interface AhrefsResult { crawlDate: string; healthScore: number; issues: SourceIssue[] }
export interface GscIndexingResult { exportDate: string | null; indexed: number; notIndexed: number; issues: SourceIssue[] }
export interface GscCwvResult { exportDate: string | null; device: Device; poor: number; ni: number; good: number; issues: SourceIssue[] }

export const isTaSource = (v: string): v is TaSource => (TA_SOURCES as readonly string[]).includes(v)
