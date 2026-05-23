// ─── Screaming Frog X-Point Framework — Shared Types ────────────────────────

export type SFSeverity = 'Critical' | 'High' | 'Medium' | 'Low'
export type SFDeltaStatus = 'New' | 'Resolved' | 'Persistent' | 'Improved' | 'Unchanged'
export type SFOwner = 'SEO' | 'Dev' | 'Content'

export interface SFIssue {
  checkId: string
  checkName: string
  category: string
  severity: SFSeverity
  url: string
  detail: string
}

export interface SFIssueSummary {
  checkId: string
  checkName: string
  category: string
  severity: SFSeverity
  count: number
  exampleUrl: string
}

export interface SFIssueDelta {
  checkId: string
  checkName: string
  category: string
  severity: SFSeverity
  prevCount: number
  currentCount: number
  delta: number
  status: SFDeltaStatus
  exampleUrl: string
  recommendedAction: string
  owner: SFOwner
}

export interface SFSnapshot {
  crawlDate: string
  totalUrls: number
  htmlUrls: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  totalIssues: number
  topIssues: SFIssueSummary[]
  issueSummaries: SFIssueSummary[]
}

export interface SFData {
  current: SFSnapshot
  prev: SFSnapshot | null
  delta: SFIssueDelta[]
  newIssues: number
  resolvedIssues: number
  persistentIssues: number
  weightedScore: number
  prevWeightedScore: number | null
}
