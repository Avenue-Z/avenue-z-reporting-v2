import { getClientBySlug } from '@/lib/db/queries'
import { KPI_DEFS, kpiValue } from './kpis'
import type { KpiKey } from './kpis'
import { getSnapshotBundle, getSnapshots } from './store'
import type { IssueRow, MetricsRow, RunRow, SnapshotRow } from './store'

export type Viewer = 'team' | 'client'
export type ViewRun = { source: RunRow['source']; status: RunRow['status']; lastError?: string | null }
/** Client-safe snapshot projection: no staff names, no row timestamps. publishedBy/publishedAt are team only. */
export type ViewSnapshot = {
  id: string
  snapshotDate: string
  status: 'draft' | 'published'
  sfCrawlDate: string | null
  ahrefsCrawlDate: string | null
  gscExportDate: string | null
  crawlSettingsChanged: boolean
  publishedBy?: string | null
  publishedAt?: Date | null
}
export type SeriesPoint = { date: string; value: number | null }

export interface TechAuditView {
  snapshots: { id: string; date: string; status: 'draft' | 'published' }[]
  selected: ViewSnapshot
  previous: ViewSnapshot | null
  metrics: MetricsRow | null
  prevMetrics: MetricsRow | null
  series: Record<KpiKey, SeriesPoint[]>
  runs: ViewRun[]
  /** Filled by the issue-list task. */
  issues: IssueRow[]
  /** Newest snapshot date when it is more than STALE_DAYS old; team viewers only. */
  staleSince: string | null
  crawlSettingsChanged: boolean
}

const STALE_DAYS = 35
const DAY_MS = 86_400_000

const asStatus = (v: string): 'draft' | 'published' => (v === 'published' ? 'published' : 'draft')

function toViewSnapshot(s: SnapshotRow, viewer: Viewer): ViewSnapshot {
  const base: ViewSnapshot = {
    id: s.id, snapshotDate: s.snapshotDate, status: asStatus(s.status), sfCrawlDate: s.sfCrawlDate,
    ahrefsCrawlDate: s.ahrefsCrawlDate, gscExportDate: s.gscExportDate, crawlSettingsChanged: s.crawlSettingsChanged,
  }
  return viewer === 'team' ? { ...base, publishedBy: s.publishedBy, publishedAt: s.publishedAt } : base
}

function daysBetween(date: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(`${date}T00:00:00Z`).getTime()) / DAY_MS)
}

/** `snapshotParam` is a snapshot date (YYYY-MM-DD) or id; an unknown or (for clients) draft value falls back to the latest visible. */
export async function loadTechAuditView(
  clientSlug: string,
  snapshotParam: string | undefined,
  viewer: Viewer,
  now: Date = new Date(),
): Promise<TechAuditView | null> {
  const client = await getClientBySlug(clientSlug)
  if (!client) return null

  const visible = await getSnapshots(client.id, { publishedOnly: viewer === 'client' })
  if (visible.length === 0) return null

  const selected = visible.find((s) => s.snapshotDate === snapshotParam || s.id === snapshotParam) ?? visible[0]
  const selectedIdx = visible.indexOf(selected)
  const previous = visible[selectedIdx + 1] ?? null

  const bundles = new Map(
    await Promise.all(
      visible.map(async (s) => [s.id, await getSnapshotBundle(client.id, s.id)] as const),
    ),
  )
  const metricsOf = (s: SnapshotRow | null): MetricsRow | null => (s ? bundles.get(s.id)?.metrics ?? null : null)

  const oldestFirst = [...visible].reverse()
  const series = Object.fromEntries(
    KPI_DEFS.map((d) => [d.key, oldestFirst.map((s) => ({ date: s.snapshotDate, value: kpiValue(d.key, metricsOf(s)) }))]),
  ) as Record<KpiKey, SeriesPoint[]>

  const runs: ViewRun[] = (bundles.get(selected.id)?.runs ?? []).map((r) =>
    viewer === 'team' ? { source: r.source, status: r.status, lastError: r.lastError } : { source: r.source, status: r.status })

  const newest = visible[0].snapshotDate
  return {
    snapshots: visible.map((s) => ({ id: s.id, date: s.snapshotDate, status: asStatus(s.status) })),
    selected: toViewSnapshot(selected, viewer),
    previous: previous ? toViewSnapshot(previous, viewer) : null,
    metrics: metricsOf(selected),
    prevMetrics: metricsOf(previous),
    series,
    runs,
    issues: [],
    staleSince: viewer === 'team' && daysBetween(newest, now) > STALE_DAYS ? newest : null,
    crawlSettingsChanged: selected.crawlSettingsChanged,
  }
}
