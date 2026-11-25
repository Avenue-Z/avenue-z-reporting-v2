import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { MetricsRow, RunRow, SnapshotRow } from './store'

const h = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  getSnapshots: vi.fn(),
  getSnapshotBundle: vi.fn(),
  getOverrides: vi.fn(),
  getCommentaryForView: vi.fn(),
  issueMap: new Map() as Map<string, { key: string; name: string }>,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: h.getClientBySlug, getCommentaryForView: h.getCommentaryForView }))
vi.mock('./store', () => ({ getSnapshots: h.getSnapshots, getSnapshotBundle: h.getSnapshotBundle, getOverrides: h.getOverrides }))
vi.mock('./issue-map', () => ({ loadIssueMap: async () => h.issueMap }))

import { loadTechAuditView } from './view'
import { ISSUE_MAP_FALLBACK } from './issue-map-fallback'

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
  h.issueMap = new Map()
  all = [snap('2026-11-01'), snap('2026-10-01'), snap('2026-09-01')]
  healthByDate = { '2026-11-01': 90, '2026-10-01': null, '2026-09-01': 80 }
  h.getClientBySlug.mockResolvedValue({ id: 'c1' })
  h.getOverrides.mockResolvedValue([])
  h.getCommentaryForView.mockResolvedValue([])
  h.getSnapshots.mockImplementation(async (_c: string, o: { publishedOnly: boolean }) =>
    o.publishedOnly ? all.filter((s) => s.status === 'published') : all)
  h.getSnapshotBundle.mockImplementation(async (_c: string, id: string) => {
    const snapshot = all.find((s) => s.id === id)
    if (!snapshot) return null
    return { snapshot, runs: [run('sf', 'boom')], metrics: metrics(healthByDate[snapshot.snapshotDate] ?? null), issues: [] }
  })
})

describe('loadTechAuditView', () => {
  const thirty = () => Array.from({ length: 30 }, (_, i) => snap(new Date(Date.UTC(2026, 10, 30) - i * 86_400_000).toISOString().slice(0, 10)))

  test('series covers only the 24 most recent snapshots', async () => {
    all = thirty()
    const v = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(v?.series.health).toHaveLength(24)
    expect(v?.series.health[23].date).toBe(all[0].snapshotDate)
    expect(v?.snapshots).toHaveLength(30)
  })

  test('bundles are read only for the window plus selected and previous', async () => {
    all = thirty()
    const v = await loadTechAuditView('x', all[27].snapshotDate, 'team', NOW)
    const ids = h.getSnapshotBundle.mock.calls.map((c: string[]) => c[1])
    expect(new Set(ids)).toEqual(new Set([...all.slice(0, 24), all[27], all[28]].map((s) => s.id)))
    expect(ids).toHaveLength(26)
    expect(v?.selected.snapshotDate).toBe(all[27].snapshotDate)
    expect(v?.previous?.snapshotDate).toBe(all[28].snapshotDate)
    expect(v?.metrics).not.toBeNull()
  })

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

  test('team and client compare a published month against the same published month, skipping drafts', async () => {
    all = [snap('2026-11-01'), ...['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01'].map((d) => snap(d, 'draft'))]
    for (const viewer of ['team', 'client'] as const) {
      const v = await loadTechAuditView('x', '2026-11-01', viewer, NOW)
      expect(v?.previous, viewer).toBeNull()
      expect(v?.prevMetrics, viewer).toBeNull()
      expect(v?.series.health.map((p) => p.date), viewer).toEqual(['2026-11-01'])
    }
    all[1] = snap('2026-10-01') // Oct published
    for (const viewer of ['team', 'client'] as const) {
      const v = await loadTechAuditView('x', '2026-11-01', viewer, NOW)
      expect(v?.previous?.snapshotDate, viewer).toBe('2026-10-01')
      expect(v?.series.health.map((p) => p.date), viewer).toEqual(['2026-10-01', '2026-11-01'])
    }
  })

  test('a team draft previews against the latest published month, with only itself added to the series', async () => {
    all = [snap('2026-12-01', 'draft'), snap('2026-11-01', 'draft'), snap('2026-10-01'), snap('2026-09-01', 'draft'), snap('2026-08-01')]
    const v = await loadTechAuditView('x', '2026-11-01', 'team', NOW)
    expect(v?.previous?.snapshotDate).toBe('2026-10-01')
    expect(v?.series.health.map((p) => p.date)).toEqual(['2026-08-01', '2026-10-01', '2026-11-01'])
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

  test('client view has no staff or timestamp keys on snapshots or runs', async () => {
    all = [snap('2026-11-01', 'published', { publishedBy: 'a@b.c', publishedAt: new Date(1) }), snap('2026-10-01')]
    const v = await loadTechAuditView('x', undefined, 'client', NOW)
    for (const s of [v!.selected, v!.previous!]) {
      for (const k of ['publishedBy', 'publishedAt', 'createdAt', 'updatedAt', 'sfRunFolderId', 'clientId']) expect(s).not.toHaveProperty(k)
    }
    for (const k of ['uploadedBy', 'startedAt', 'finishedAt', 'createdAt', 'updatedAt', 'attempts', 'lastError', 'id', 'snapshotId']) {
      expect(v!.runs[0]).not.toHaveProperty(k)
    }
    expect(v!.runs[0]).toEqual({ source: 'sf', status: 'failed' })
    for (const m of [v!.metrics!, v!.prevMetrics!]) {
      for (const k of ['id', 'snapshotId', 'createdAt', 'updatedAt']) expect(m).not.toHaveProperty(k)
      expect(m).toHaveProperty('ahrefsHealthScore')
    }
    const team = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(team!.selected.publishedBy).toBe('a@b.c')
    expect(team!.selected).not.toHaveProperty('createdAt')
  })

  test('exposes crawlSettingsChanged and an empty issues list', async () => {
    all = [snap('2026-11-01', 'published', { crawlSettingsChanged: true })]
    const v = await loadTechAuditView('x', undefined, 'team', NOW)
    expect(v?.crawlSettingsChanged).toBe(true)
    expect(v?.issues).toEqual([])
  })

  describe('issues', () => {
    const src = (nativeIssueName: string, urlCount: number) =>
      ({ id: nativeIssueName, snapshotId: 's', source: 'sf', nativeIssueName, nativeSeverity: 'error', urlCount, device: null })
    const override = (issueKey: string, over: Record<string, unknown>) =>
      ({ id: 'o', clientId: 'c1', issueKey, hidden: false, note: null, updatedBy: 'strategist@avenuez.com', updatedAt: new Date('2026-11-02T00:00:00Z'), ...over })
    beforeEach(() => {
      h.getSnapshotBundle.mockImplementation(async (_c: string, id: string) => {
        const snapshot = all.find((s) => s.id === id)
        return snapshot ? { snapshot, runs: [], metrics: metrics(90), issues: [src('Big problem', 1000), src('Small problem', 3)] } : null
      })
    })

    test('client view never receives a hidden row even when it ranks #1', async () => {
      h.getOverrides.mockResolvedValue([override('sf:Big problem', { hidden: true })])
      const v = await loadTechAuditView('x', undefined, 'client', NOW)
      expect(v!.issues.map((i) => i.name)).toEqual(['Small problem'])
      const t = await loadTechAuditView('x', undefined, 'team', NOW)
      expect(t!.issues.map((i) => [i.name, i.hidden])).toEqual([['Big problem', true], ['Small problem', false]])
    })

    const ahrefsRow = (nativeIssueName: string, urlCount: number) =>
      ({ id: nativeIssueName, snapshotId: 's', source: 'ahrefs', nativeIssueName, nativeSeverity: 'error', urlCount, device: null })
    const withIssues = (rows: ReturnType<typeof ahrefsRow>[]) => h.getSnapshotBundle.mockImplementation(async (_c: string, id: string) => {
      const snapshot = all.find((s) => s.id === id)
      return snapshot ? { snapshot, runs: [], metrics: metrics(90), issues: rows } : null
    })

    test('a row hidden under its canonical key stays hidden when the page falls back to the built-in map', async () => {
      // Hidden while the Sheet mapped "302 redirect" to its canonical key; now the Sheet is down.
      h.getOverrides.mockResolvedValue([override('302-redirect', { hidden: true })])
      h.issueMap = new Map(ISSUE_MAP_FALLBACK.map((r) => [`${r.source}:${r.native}`, { key: r.key, name: r.name }]))
      withIssues([ahrefsRow('302 redirect', 500), ahrefsRow('Some other thing', 2)])
      const v = await loadTechAuditView('x', undefined, 'client', NOW)
      expect(v!.issues.map((i) => i.key)).toEqual(['ahrefs:Some other thing'])
    })

    test('a row hidden while unmapped stays hidden once the map gives it a canonical key', async () => {
      h.getOverrides.mockResolvedValue([override('ahrefs:X', { hidden: true, note: 'known' })])
      h.issueMap = new Map([['ahrefs:X', { key: 'x-key', name: 'X issue' }]])
      withIssues([ahrefsRow('X', 500), ahrefsRow('Y', 2)])
      const v = await loadTechAuditView('x', undefined, 'client', NOW)
      expect(v!.issues.map((i) => i.key)).toEqual(['ahrefs:Y'])
      const t = await loadTechAuditView('x', undefined, 'team', NOW)
      expect(t!.issues.find((i) => i.key === 'x-key')).toMatchObject({ hidden: true, note: 'known' })
    })

    test('the canonical-key override wins over a contributor override', async () => {
      h.getOverrides.mockResolvedValue([override('ahrefs:X', { hidden: true }), override('x-key', { hidden: false, note: 'shown' })])
      h.issueMap = new Map([['ahrefs:X', { key: 'x-key', name: 'X issue' }]])
      withIssues([ahrefsRow('X', 500)])
      const v = await loadTechAuditView('x', undefined, 'client', NOW)
      expect(v!.issues.map((i) => [i.key, i.note])).toEqual([['x-key', 'shown']])
    })

    test('client props carry no noteBy/noteAt; team keeps them', async () => {
      h.getOverrides.mockResolvedValue([override('sf:Small problem', { note: 'checking' })])
      const v = await loadTechAuditView('x', undefined, 'client', NOW)
      const row = v!.issues.find((i) => i.name === 'Small problem')!
      expect(row.note).toBe('checking')
      expect(row).not.toHaveProperty('noteBy')
      expect(row).not.toHaveProperty('noteAt')
      const t = await loadTechAuditView('x', undefined, 'team', NOW)
      expect(t!.issues.find((i) => i.name === 'Small problem')).toMatchObject({ noteBy: 'strategist@avenuez.com', noteAt: '2026-11-02T00:00:00.000Z' })
    })
  })
})

describe('loadTechAuditView commentary state', () => {
  const entry = (date: string, status: 'draft' | 'approved', over: Record<string, unknown> = {}) => ({
    id: `e-${date}-${status}`, viewKey: 'peec-ai:technical-audit', bodyHtml: '<p>x</p>', periodStart: date, periodEnd: date,
    status, updatedBy: 'a@avenuez.com', updatedAt: '2026-11-02', approvedBy: null, approvedAt: null, deletedAt: null, deletedBy: null, ...over,
  })
  const commentaryOf = async (viewer: 'team' | 'client' = 'team') => (await loadTechAuditView('x', '2026-11-01', viewer, NOW))?.commentary

  test('checklist reports draft commentary for the snapshot', async () => {
    h.getCommentaryForView.mockResolvedValue([entry('2026-11-01', 'draft')])
    expect(await commentaryOf()).toBe('draft')
    expect(h.getCommentaryForView).toHaveBeenCalledWith('c1', 'peec-ai:technical-audit')
  })

  test('an approved entry gives approved, even beside a draft', async () => {
    h.getCommentaryForView.mockResolvedValue([entry('2026-11-01', 'draft'), entry('2026-11-01', 'approved')])
    expect(await commentaryOf()).toBe('approved')
  })

  test('entries for another snapshot date, other ranges and deleted entries are ignored', async () => {
    h.getCommentaryForView.mockResolvedValue([
      entry('2026-10-01', 'approved'),
      entry('2026-11-01', 'approved', { periodEnd: '2026-11-30' }),
      entry('2026-11-01', 'approved', { deletedAt: '2026-11-03' }),
    ])
    expect(await commentaryOf()).toBe('none')
  })

  test('is not computed for client viewers', async () => {
    h.getCommentaryForView.mockResolvedValue([entry('2026-11-01', 'approved')])
    expect(await commentaryOf('client')).toBeUndefined()
    expect(h.getCommentaryForView).not.toHaveBeenCalled()
  })
})
