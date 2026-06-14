// Pure data-transformation helpers for the AEO Technical Performance FixList.
// MUST NOT have a 'use client' directive — this file is imported by both the
// Technical Audit RSC (server) and the technical-audit-tables.tsx client file.
// Originally lived inside technical-audit-tables.tsx but the RSC's call to
// buildFixListRows() failed in production because Next.js forbids calling a
// client-file export from a server component.

import type { SFIssueDelta, SFDeltaStatus, SFData } from '@/lib/screaming-frog/types'
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'

export interface FixListRow {
  checkId: string
  checkName: string
  severity: string
  status: SFDeltaStatus
  exampleUrl: string
  recommendedAction: string
  owner: string
  priorityScore: number
  aiActive: boolean
  whyItMatters: string
  priorityLabel: string
}

function computeFixPriority(
  issue: SFIssueDelta,
  botPaths: Set<string>,
): number {
  const severityMap: Record<string, number> = { Critical: 1.0, High: 0.75, Medium: 0.5, Low: 0.25 }
  const persistenceMap: Record<string, number> = { New: 0.8, Persistent: 1.0, Improved: 0.3, Resolved: 0, Unchanged: 0.5 }

  const severity    = severityMap[issue.severity] ?? 0.25
  let hasAI = 0
  try {
    hasAI = issue.exampleUrl && botPaths.has(new URL(issue.exampleUrl).pathname) ? 1 : 0
  } catch {
    hasAI = 0
  }
  const humanFromAI = 0
  const persistence = persistenceMap[issue.status] ?? 0.5

  return 0.35 * severity + 0.25 * hasAI + 0.20 * humanFromAI + 0.20 * persistence
}

export function buildFixListRows(sfData: SFData, agentData: AgentAnalyticsData | null): { rows: FixListRow[]; hasDelta: boolean } {
  const botPaths = new Set<string>(agentData?.topPaths.map((p) => p.path) ?? [])
  const hasDelta = sfData.delta.length > 0

  function whyItMatters(fix: { severity: string; status: string }): string {
    if (fix.severity === 'Critical') return 'Blocks crawler access and AI indexing directly'
    if (fix.status === 'New') return 'Newly introduced this crawl — requires immediate investigation'
    if (fix.status === 'Persistent') return 'Unresolved across multiple crawls — systemic issue'
    if (fix.severity === 'High') return 'High-severity issue impacting AI crawlability'
    return 'Ongoing technical debt affecting crawl health'
  }

  function hasAIActivity(exampleUrl: string): boolean {
    if (!exampleUrl) return false
    try { return botPaths.has(new URL(exampleUrl).pathname) } catch { return false }
  }

  function priorityLabel(score: number, severity: string): string {
    if (!hasDelta) return severity
    return score >= 0.6 ? 'Critical' : score >= 0.4 ? 'High' : score >= 0.2 ? 'Medium' : 'Low'
  }

  const rows: FixListRow[] = hasDelta
    ? sfData.delta
        .filter((d) => d.status !== 'Resolved' && d.status !== 'Unchanged')
        .map((d) => {
          const priorityScore = computeFixPriority(d, botPaths)
          return {
            checkId: d.checkId,
            checkName: d.checkName,
            severity: d.severity,
            status: d.status,
            exampleUrl: d.exampleUrl ?? '',
            recommendedAction: d.recommendedAction,
            owner: d.owner,
            priorityScore,
            aiActive: hasAIActivity(d.exampleUrl ?? ''),
            whyItMatters: whyItMatters(d),
            priorityLabel: priorityLabel(priorityScore, d.severity),
          }
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 10)
    : sfData.current.topIssues.slice(0, 10).map((issue) => {
        const recommendedAction = (issue as unknown as { recommendedAction?: string }).recommendedAction ?? 'Review and remediate'
        const owner = (issue as unknown as { owner?: string }).owner ?? 'SEO'
        return {
          checkId: issue.checkId,
          checkName: issue.checkName,
          severity: issue.severity,
          status: 'Unchanged' as const,
          exampleUrl: '',
          recommendedAction,
          owner,
          priorityScore: 0,
          aiActive: false,
          whyItMatters: whyItMatters({ severity: issue.severity, status: 'Unchanged' }),
          priorityLabel: priorityLabel(0, issue.severity),
        }
      })

  return { rows, hasDelta }
}
