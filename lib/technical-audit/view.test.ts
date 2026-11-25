import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { MetricsRow, RunRow, SnapshotRow } from './store'

const h = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  getSnapshots: vi.fn(),
  getSnapshotBundle: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: h.getClientBySlug }))
vi.mock('./store', () => ({ getSnapshots: h.getSnapshots, getSnapshotBundle: h.getSnapshotBundle }))

import { loadTechAuditView } from './view'

const snap = (date: string, status: 'draft' | 'published' = 'published', over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: `id-${date}`, clientId: 'c1', snapshotDate: date, sfRunFolderId: null, sfCrawlDate: null, ahrefsCrawlDate: null,
  gscExportDate: null, ahrefsHealthScore: null, crawlSettingsChanged: false, status, publishedAt: null, publishedBy: null,
  createdAt: new Date(0), updatedAt: new Date(0), ...over,
})
const metrics = (health: number | null, over: Partial<MetricsRow> = {}): MetricsRow => ({
  id: 'm', snapshotId: 's', sfIssueTypesIssue: 1, sfIssueTypesWarning: 0, sfIssueTypesOpportunity: 0,
  sfUrlsIssue: 0, sfUrlsWarning: 0, sfUrlsOpportunity: 0, ahrefsHealthScore: health, gscIndexed: null, gscNotIndexed: null,
  cwvMobilePoor: null, cwvMobileNi: null, cwvMobileGood: null, cwvDesktopPoor: null, cwvDesktopNi: null, cwvDesktopGood: null,
  ...over,
})
const run = (source: string, lastError: string | null = null): RunRow => ({
  id: `r-${source}`, snapshotId: 's', source, status: 'failed', attempts: 1, lastError, uploadedBy: null,
  startedAt: null, finishedAt: null, createdAt: new Date(0), updatedAt: new Date(0),
})

// Newest first, as the store returns them.
let all: SnapshotRow[]
let healthByDate: Record<string, number | null>
const NOW = new Date('2026-11-25T12:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  all = [snap('2026-11-01'), snap('2026-10-01'), snap('2026-09-01')]
  healthByDate = { '2026-11-01': 90, '2026-10-01': null, '2026-09-01': 80 }
  h.getClientBySlug.mockResolvedValue({ id: 'c1' })
  h.getSnapshots.mockImplementation(async (_c: string, o: { publishedOnly: boolean }) =>
    o.publishedOnly ? all.filter((s) => s.status === 'published') : all)
  h.getSnapshotBundle.mockImplementation(async (_c: string, id: string) => {
    const snapshot = all.find((s) => s.id === id)
    if (!snapshot) return null
    return { snapshot, runs: [run('sf', 'boom')], metrics: metrics(healthByDate[snapshot.snapshotDate] ?? null), issues: [] }
  })
})

describe('loadTechAuditView', () => {
  test('returns null for an unknown client or when a client viewer has nothing published', async () => {
    h.getClientBySlug.mockResolvedValueOnce(null)
    expect(await loadTechAuditView('nope', undefined, 'team', NOW)).toBeNull()
    all = [snap('2026-11-01', 'draft')]
    expect(await loadTechAuditView('x', undefined, 'client', NOW)).toBeNull()
  })

  test('client viewer requesting a draft date gets the latest published', async () => {
    all = [snap('2026-11-01', 'draft'), snap('2026-10-01'), snap('2026-09-01')]
    const v = await loadTechAuditView('x', '2026-11-01', 'client', NOW)
    expect(v?.selected.snapshotDate).toBe('2026-10-01')
    expect(v?.snapshots.map((s) => s.date)).toEqual(['2026-10-01', '2026-09-01'])
    expect(h.getSnapshots).toHaveBeenCalledWith('c1', { publishedOnly: true })
  })

  test('team viewer can select a draft by date', async () => {
    all = [snap('2026-11-01', 'draft'), snap('2026-10-01')]
    const v = await loadTechAuditView('x', '2026-11-01', 'team', NOW)
    expect(v?.selected.snapshotDate).toBe('2026-11-01')
    expect(v?.snapshots[0]).toEqual({ id: 'id-2026-11-01', date: '2026-11-01', status: 'draft' })
  })

  test('previous is the snapshot immediately before the selected one', async () => {
    const v = await loadTechAuditView('x', '2026-10-01', 'team', NOW)
    expect(v?.previous?.snapshotDate).toBe('2026-09-01')
    expect(v?.prevMetrics?.ahrefsHealthScore).toBe(80)
    const oldest = await loadTechAuditView('x', '2026-09-01', 'team', NOW)
    expect(oldest?.previous).toBeNull()
    expect(oldest?.prevMetrics).toBeNull()
  })

  test('series keeps nulls as gaps, oldest to newest', async () => {
    const v = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(v?.series.health).toEqual([
      { date: '2026-09-01', value: 80 }, { date: '2026-10-01', value: null }, { date: '2026-11-01', value: 90 },
    ])
    expect(v?.series.indexed.every((p) => p.value === null)).toBe(true)
  })

  test('staleSince is set when the newest snapshot is 36 days old and null at 30', async () => {
    all = [snap('2026-10-20')] // 36 days before 2026-11-25
    expect((await loadTechAuditView('x', undefined, 'team', NOW))?.staleSince).toBe('2026-10-20')
    all = [snap('2026-10-26')] // 30 days
    expect((await loadTechAuditView('x', undefined, 'team', NOW))?.staleSince).toBeNull()
  })

  test('staleSince is always null for client viewers', async () => {
    all = [snap('2026-10-01')]
    expect((await loadTechAuditView('x', undefined, 'client', NOW))?.staleSince).toBeNull()
  })

  test('client viewer runs omit lastError; team keeps it', async () => {
    const client = await loadTechAuditView('x', undefined, 'client', NOW)
    expect(client?.runs[0]).not.toHaveProperty('lastError')
    const team = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(team?.runs[0].lastError).toBe('boom')
    expect(team?.runs[0]).toMatchObject({ source: 'sf', status: 'failed' })
  })

  test('exposes crawlSettingsChanged and an empty issues list', async () => {
    all = [snap('2026-11-01', 'published', { crawlSettingsChanged: true })]
    const v = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(v?.crawlSettingsChanged).toBe(true)
    expect(v?.issues).toEqual([])
  })
})
