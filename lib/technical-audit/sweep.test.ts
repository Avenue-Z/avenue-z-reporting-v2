// @vitest-environment node
// runSweep against an in-memory fake of the store and the two sources. No Drive, Ahrefs or database is touched.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { runSweep, SWEEP_BUDGET_MS } from './sweep'
import type { SweepDeps } from './sweep'
import type { AhrefsResult, Parsed, SfResult, TaSource } from './types'

const NOW = new Date('2026-11-25T06:20:00Z')
type Snap = { id: string; clientId: string; snapshotDate: string; sfRunFolderId: string | null; status: 'draft' | 'published' }
type Run = { status: 'pending' | 'complete' | 'failed' | 'missing'; started: boolean }

const sfOk: Parsed<SfResult> = {
  ok: true,
  value: { crawlDate: '2026-11-01', issueTypes: { issue: 1, warning: 2, opportunity: 3 }, urls: { issue: 4, warning: 5, opportunity: 6 }, issues: [] },
}
const ahOk = (): { raw: Uint8Array; result: Parsed<AhrefsResult> } => ({
  raw: new Uint8Array([1]),
  result: { ok: true, value: { crawlDate: '2026-11-01', healthScore: 77, issues: [] } },
})

function harness(over: Partial<SweepDeps> = {}, runsBySlug: Record<string, { date: string; folderId: string }[]> = {}) {
  const snaps: Snap[] = []
  const runs = new Map<string, Run>()
  const completed: { snapshotId: string; source: TaSource; write: Record<string, unknown> }[] = []
  const failed: { source: TaSource; status: string; reason: string }[] = []
  const key = (id: string, s: TaSource) => `${id}:${s}`
  const deps: SweepDeps = {
    listClients: async () => [
      { id: 'c1', slug: 'alpha', sfDriveFolderId: 'f-alpha', ahrefsProjectId: 'p-alpha' },
      { id: 'c2', slug: 'beta', sfDriveFolderId: 'f-beta', ahrefsProjectId: 'p-beta' },
    ],
    listSfRuns: async (folder) => runsBySlug[folder.replace('f-', '')] ?? [],
    fetchIssuesOverview: async () => ({ bytes: new TextEncoder().encode('csv') }),
    parseSfIssuesOverview: () => sfOk,
    fetchAhrefs: async () => ahOk(),
    ensureSnapshot: async (clientId, run) => {
      const hit = snaps.find((s) => s.clientId === clientId && s.snapshotDate === run.date)
      if (hit) return { id: hit.id, created: false }
      const id = `${clientId}-${run.date}`
      snaps.push({ id, clientId, snapshotDate: run.date, sfRunFolderId: run.folderId, status: 'draft' })
      runs.set(key(id, 'sf'), { status: 'pending', started: false })
      runs.set(key(id, 'ahrefs'), { status: 'pending', started: false })
      return { id, created: true }
    },
    getSnapshots: async (clientId) => snaps.filter((s) => s.clientId === clientId).map((s) => ({ ...s })) as never,
    claimRun: async (id, source, _stale, opts) => {
      const r = runs.get(key(id, source))
      if (!r) return false
      const ok = r.status === 'pending' || r.status === 'failed' || (r.status === 'missing' && opts?.includeMissing === true)
      if (!ok) return false
      r.started = true
      return true
    },
    completeRun: async (_c, snapshotId, source, _raw, write) => {
      runs.get(key(snapshotId, source))!.status = 'complete'
      completed.push({ snapshotId, source, write: write as Record<string, unknown> })
    },
    failRun: async (_c, snapshotId, source, status, reason) => {
      runs.get(key(snapshotId, source))!.status = status
      failed.push({ source, status, reason })
    },
    ...over,
  }
  return { deps, snaps, runs, completed, failed }
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { warn.mockRestore() })

const RUN = { date: '2026-11-01', folderId: 'run-1' }

describe('runSweep', () => {
  test('creates a draft for a new run folder and completes sf and ahrefs', async () => {
    const h = harness({}, { alpha: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(report.created).toBe(1)
    expect(report.completed.sort()).toEqual(['alpha 2026-11-01 ahrefs', 'alpha 2026-11-01 sf'])
    expect(report.failed).toEqual([])
    const sf = h.completed.find((c) => c.source === 'sf')!.write
    expect(sf.metrics).toMatchObject({ sfIssueTypesIssue: 1, sfIssueTypesWarning: 2, sfIssueTypesOpportunity: 3, sfUrlsIssue: 4, sfUrlsWarning: 5, sfUrlsOpportunity: 6 })
    expect(sf.snapshot).toEqual({ sfCrawlDate: '2026-11-01' })
    const ah = h.completed.find((c) => c.source === 'ahrefs')!.write
    expect(ah.metrics).toEqual({ ahrefsHealthScore: 77 })
    expect(ah.snapshot).toEqual({ ahrefsCrawlDate: '2026-11-01', ahrefsHealthScore: 77 })
  })

  test('first run for a brand creates a draft for every existing folder, oldest first', async () => {
    const h = harness({}, { alpha: [{ date: '2026-11-01', folderId: 'b' }, { date: '2026-10-01', folderId: 'a' }] })
    const report = await runSweep(h.deps, NOW)
    expect(report.created).toBe(2)
    expect(h.snaps.map((s) => s.snapshotDate)).toEqual(['2026-10-01', '2026-11-01'])
  })

  test('a 429 on Ahrefs marks only that run failed and other brands still complete', async () => {
    const h = harness({
      fetchAhrefs: async (project) => { if (project === 'p-alpha') throw new Error('Ahrefs 429'); return ahOk() },
    }, { alpha: [RUN], beta: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(report.failed).toEqual([{ slug: 'alpha', date: '2026-11-01', source: 'ahrefs', reason: 'Ahrefs 429' }])
    expect(report.completed.sort()).toEqual(['alpha 2026-11-01 sf', 'beta 2026-11-01 ahrefs', 'beta 2026-11-01 sf'])
    expect(h.failed).toEqual([{ source: 'ahrefs', status: 'failed', reason: 'Ahrefs 429' }])
    expect(warn).toHaveBeenCalledWith('[tech-audit] alpha 2026-11-01 ahrefs Ahrefs 429')
  })

  test('missing Issues Overview marks sf missing with its reason, and a later sweep re-checks it', async () => {
    let present = false
    const h = harness({ fetchIssuesOverview: async () => (present ? { bytes: new Uint8Array([1]) } : null) }, { alpha: [RUN] })
    await runSweep(h.deps, NOW)
    expect(h.failed.find((f) => f.source === 'sf')).toEqual({ source: 'sf', status: 'missing', reason: 'Issues Overview not in this crawl’s export' })
    present = true
    const second = await runSweep(h.deps, NOW)
    expect(second.completed).toEqual(['alpha 2026-11-01 sf'])
  })

  test('an unparseable Issues Overview is marked missing with the parser reason', async () => {
    const h = harness({ parseSfIssuesOverview: () => ({ ok: false, reason: 'Unreadable file' }) }, { alpha: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(h.failed).toContainEqual({ source: 'sf', status: 'missing', reason: 'Unreadable file' })
    expect(report.failed).toContainEqual({ slug: 'alpha', date: '2026-11-01', source: 'sf', reason: 'Unreadable file' })
  })

  test('a brand with no folder in 35 days is reported in staleCrawl', async () => {
    const h = harness({}, { alpha: [{ date: '2026-10-25', folderId: 'x' }], beta: [{ date: '2026-09-01', folderId: 'y' }] })
    const report = await runSweep(h.deps, NOW)
    expect(report.staleCrawl).toEqual(['beta'])
  })

  test('a brand with no folders at all is stale', async () => {
    const report = await runSweep(harness().deps, NOW)
    expect(report.staleCrawl.sort()).toEqual(['alpha', 'beta'])
  })

  test('running twice is idempotent', async () => {
    const h = harness({}, { alpha: [RUN] })
    await runSweep(h.deps, NOW)
    const second = await runSweep(h.deps, NOW)
    expect(second.created).toBe(0)
    expect(second.completed).toEqual([])
    expect(h.completed).toHaveLength(2)
  })

  test('published snapshots are never worked', async () => {
    const h = harness({}, { alpha: [RUN] })
    await runSweep(h.deps, NOW)
    h.snaps[0].status = 'published'
    h.runs.get(`${h.snaps[0].id}:sf`)!.status = 'missing'
    const claim = vi.spyOn(h.deps, 'claimRun')
    await runSweep(h.deps, NOW)
    expect(claim).not.toHaveBeenCalled()
  })

  test('a run folder dated in the future is ignored', async () => {
    const h = harness({}, { alpha: [{ date: '2099-01-01', folderId: 'bogus' }, RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(h.snaps.map((s) => s.snapshotDate)).toEqual(['2026-11-01'])
    expect(report.created).toBe(1)
  })

  test('at most 12 new snapshots per brand per sweep, the rest on the next one', async () => {
    const dates = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10))
    const folders = dates.map((date, i) => ({ date, folderId: `f${i}` })).sort((a, b) => (a.date < b.date ? 1 : -1))
    const h = harness({}, { alpha: folders })
    expect((await runSweep(h.deps, NOW)).created).toBe(12)
    expect((await runSweep(h.deps, NOW)).created).toBe(3)
  })

  test('a thrown Drive listing is reported and does not stop other brands', async () => {
    const h = harness({
      listSfRuns: async (folder) => { if (folder === 'f-alpha') throw new Error('Drive 500'); return [RUN] },
    })
    const report = await runSweep(h.deps, NOW)
    expect(report.failed).toEqual([{ slug: 'alpha', date: '2026-11-25', source: 'sf', reason: 'Drive 500' }])
    expect(report.completed).toContain('beta 2026-11-01 sf')
    expect(report.staleCrawl).not.toContain('alpha')
  })

  test('a throw while recording a failure still leaves other brands working', async () => {
    const h = harness({
      fetchAhrefs: async () => { throw new Error('boom') },
      failRun: async () => { throw new Error('db down') },
    }, { alpha: [RUN], beta: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(report.completed.filter((c) => c.endsWith(' sf')).sort()).toEqual(['alpha 2026-11-01 sf', 'beta 2026-11-01 sf'])
  })

  test('runs at most four brands at once', async () => {
    let live = 0
    let peak = 0
    const clients = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, slug: `b${i}`, sfDriveFolderId: `f-b${i}`, ahrefsProjectId: null }))
    const h = harness({
      listClients: async () => clients,
      listSfRuns: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return [] },
    })
    await runSweep(h.deps, NOW)
    expect(peak).toBe(4)
  })

  test('the default budget is 240 s, inside the route\'s 300 s', () => {
    expect(SWEEP_BUDGET_MS).toBe(240_000)
  })

  test('a spent time budget stops claiming new work and says so', async () => {
    const h = harness({ budgetMs: -1 }, { alpha: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(report.completed).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[tech-audit] budget spent'))
  })

  test('a store error never reaches the logs, the report or the stored reason', async () => {
    const h = harness({
      completeRun: async () => { throw new Error('Failed query: insert into x\nparams: secret-issue-text') },
    }, { alpha: [RUN] })
    const report = await runSweep(h.deps, NOW)
    const seen = JSON.stringify([warn.mock.calls, report, h.failed])
    expect(seen).not.toContain('secret-issue-text')
    expect(seen).not.toContain('Failed query')
    expect(h.failed.map((f) => f.reason)).toEqual(['database error', 'database error'])
    expect(report.failed.every((f) => f.reason === 'database error')).toBe(true)
  })

  test('a throwing claimRun or getSnapshots is reported without its message', async () => {
    const h = harness({ getSnapshots: async () => { throw new Error('Failed query: select params: secret-issue-text') } }, { alpha: [RUN] })
    const report = await runSweep(h.deps, NOW)
    expect(JSON.stringify([warn.mock.calls, report])).not.toContain('secret-issue-text')
    expect(report.failed.length).toBeGreaterThan(0)
  })

  test('missing sources are re-checked on drafts within 45 days, not on older ones', async () => {
    const h = harness({ fetchIssuesOverview: async () => null }, { alpha: [{ date: '2026-09-26', folderId: 'old' }, { date: '2026-11-15', folderId: 'new' }] })
    await runSweep(h.deps, NOW) // both go missing
    const modes: Record<string, boolean | undefined> = {}
    const orig = h.deps.claimRun
    h.deps.claimRun = async (id, source, stale, opts) => { if (source === 'sf') modes[id] = opts?.includeMissing; return orig(id, source, stale, opts) }
    await runSweep(h.deps, NOW)
    expect(modes['c1-2026-11-15']).toBe(true) // 10 days old
    expect(modes['c1-2026-09-26']).toBe(false) // 60 days old
  })

  test('log lines carry no newlines from the reason', async () => {
    const h = harness({ fetchAhrefs: async () => { throw new Error('bad\n[tech-audit] forged') } }, { alpha: [RUN] })
    await runSweep(h.deps, NOW)
    for (const [line] of warn.mock.calls) expect(String(line)).not.toContain('\n')
  })
})
