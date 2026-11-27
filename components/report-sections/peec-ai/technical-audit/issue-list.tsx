'use client'
// 03 · Issues to investigate (spec §5.5): one merged, ranked list across Ahrefs, Screaming Frog and GSC. Rows are
// already ranked, and a client's hidden rows already removed, by loadTechAuditView. Team view collapses hidden rows
// and adds Hide / note controls; the PDF export shows neither. Notes are plain text.
import { useState } from 'react'
import { useExportMode } from '@/components/export/export-mode'
import type { Severity, TaIssueSource } from '@/lib/technical-audit/types'
import type { ViewIssue, Viewer } from '@/lib/technical-audit/view'
import { fmtDate } from './format'
import { IssueRowControls } from './issue-row-controls'

const SOURCE_LABEL: Record<TaIssueSource, string> = {
  ahrefs: 'Ahrefs', sf: 'Screaming Frog', gsc_indexing: 'GSC Indexing', gsc_cwv: 'GSC CWV',
}
/** Short source labels for the per-issue detail line. */
const DETAIL_LABEL: Record<TaIssueSource, string> = { ahrefs: 'Ahrefs', sf: 'SF', gsc_indexing: 'GSC', gsc_cwv: 'GSC CWV' }
const SOURCE_FILTERS: { value: TaIssueSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(SOURCE_LABEL) as TaIssueSource[]).map((value) => ({ value, label: SOURCE_LABEL[value] })),
]
const SEVERITY_FILTERS: { value: Severity | 'all'; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
]
const SEVERITY_COLOR: Record<Severity, string> = { high: '#FF4444', medium: '#FFFC60', low: '#60FDFF' }
const SELECT = 'rounded-xl border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const TH = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-muted'

function HeadRow() {
  return (
    <thead>
      <tr>
        <th className={TH}>#</th><th className={TH}>Issue</th><th className={TH}>Severity</th>
        <th className={TH}>URLs affected</th><th className={TH}>Sources</th>
      </tr>
    </thead>
  )
}

function IssueRow({ issue, index, clientSlug, team }: { issue: ViewIssue; index?: number; clientSlug: string; team: boolean }) {
  return (
    <tr className="border-t border-white/[0.06] align-top" data-export-block="">
      <td className="px-3 py-3 text-sm text-text-muted">{index ?? ''}</td>
      <td className="px-3 py-3">
        <p className="text-sm font-bold text-white">
          {issue.name}
          {team && issue.needsMapping && (
            <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-xs font-normal text-text-muted">Needs mapping</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {issue.detail.map((d) => `${DETAIL_LABEL[d.source]}: ${d.nativeName} (${d.urlCount})`).join(' · ')}
        </p>
        {issue.note && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-text-muted">
            {issue.note}
            {team && issue.noteBy && (
              <span className="block opacity-70">{issue.noteBy}{issue.noteAt && ` · ${fmtDate(issue.noteAt.slice(0, 10))}`}</span>
            )}
          </p>
        )}
        {team && <IssueRowControls clientSlug={clientSlug} issueKey={issue.overrideKey ?? issue.key} hidden={issue.hidden} note={issue.note} />}
      </td>
      <td className="px-3 py-3 text-sm font-bold capitalize" style={{ color: SEVERITY_COLOR[issue.severity] }}>{issue.severity}</td>
      <td className="px-3 py-3 text-sm text-white">{issue.urls.toLocaleString('en-US')}</td>
      <td className="px-3 py-3 text-sm text-text-muted">{issue.sources.map((s) => SOURCE_LABEL[s]).join(', ')}</td>
    </tr>
  )
}

export function IssueList({ clientSlug, issues, viewer }: { clientSlug: string; issues: ViewIssue[]; viewer: Viewer }) {
  const exportMode = useExportMode()
  const [source, setSource] = useState<TaIssueSource | 'all'>('all')
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const team = viewer === 'team' && !exportMode

  const matches = (i: ViewIssue) => (source === 'all' || i.sources.includes(source)) && (severity === 'all' || i.severity === severity)
  const visible = issues.filter((i) => !i.hidden && matches(i))
  const hidden = team ? issues.filter((i) => i.hidden) : []

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6">
      {!exportMode && (
        <div data-print-hidden className="mb-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Source
            <select className={SELECT} value={source} onChange={(e) => setSource(SOURCE_FILTERS.find((f) => f.value === e.target.value)?.value ?? 'all')}>
              {SOURCE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Severity
            <select className={SELECT} value={severity} onChange={(e) => setSeverity(SEVERITY_FILTERS.find((f) => f.value === e.target.value)?.value ?? 'all')}>
              {SEVERITY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-text-muted">No issues to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <HeadRow />
            <tbody>
              {visible.map((i, n) => <IssueRow key={i.key} issue={i} index={n + 1} clientSlug={clientSlug} team={team} />)}
            </tbody>
          </table>
        </div>
      )}

      {hidden.length > 0 && (
        <details data-print-hidden className="mt-4">
          <summary className="cursor-pointer text-sm font-bold text-text-muted">Hidden by strategist ({hidden.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full">
              <HeadRow />
              <tbody>{hidden.map((i) => <IssueRow key={i.key} issue={i} clientSlug={clientSlug} team />)}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
