// @vitest-environment node
// The Technical Audit staff actions. The session, client lookup, store and GSC parsers are replaced; what is checked
// is who may act, which client's snapshot is touched, and what is written.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/technical-audit/store', () => ({
  getSnapshotBundle: vi.fn(), completeRun: vi.fn(), setSnapshotStatus: vi.fn(), setOverride: vi.fn(),
}))
vi.mock('@/lib/technical-audit/gsc-export', () => ({
  MAX_GSC_BYTES: 2_097_152, parseGscPageIndexing: vi.fn(), parseGscCwv: vi.fn(),
}))

import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import { completeRun, getSnapshotBundle, setOverride, setSnapshotStatus } from '@/lib/technical-audit/store'
import { parseGscCwv, parseGscPageIndexing } from '@/lib/technical-audit/gsc-export'
import { publishSnapshot, setIssueOverride, unpublishSnapshot, uploadGscExport } from './tech-audit'

const SNAP = '3f0c2a52-7a53-4a55-9c1e-1b1f2f3a4b5c'
const FILE_NAME = 'private-file-name.xlsx'
const as = (email: string | null, role = 'INTERNAL_ANALYST') =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(email ? { user: { email, role } } : null)

function form(over: Record<string, string | File | undefined> = {}, bytes = new Uint8Array([1, 2, 3])) {
  const f = new FormData()
  const fields = {
    clientSlug: 'a-client', snapshotId: SNAP, slot: 'gsc_indexing',
    file: new File([bytes], FILE_NAME), ...over,
  }
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.set(k, v)
  return f
}

let warn: ReturnType<typeof vi.spyOn>
let info: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  as('writer@avenuez.com')
  vi.mocked(getClientBySlug).mockResolvedValue({ id: 'client-1', slug: 'a-client' } as never)
  vi.mocked(getSnapshotBundle).mockResolvedValue({ snapshot: { id: SNAP, snapshotDate: '2026-11-01' } } as never)
  vi.mocked(parseGscPageIndexing).mockReturnValue({
    ok: true, value: { exportDate: '2026-11-21', indexed: 1080, notIndexed: 934, issues: [] },
  })
})
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); info.mockRestore(); error.mockRestore() })

const logged = () => JSON.stringify([...warn.mock.calls, ...info.mock.calls, ...error.mock.calls])

describe('non-staff is refused', () => {
  test.each<[string, string | null, string | undefined]>([
    ['no session', null, undefined],
    ['a non-Avenue Z email', 'someone@example.com', 'INTERNAL_ADMIN'],
    ['a client role with an @avenuez.com email', 'writer@avenuez.com', 'CLIENT_ADMIN'],
    ['a client viewer with an @avenuez.com email', 'writer@avenuez.com', 'CLIENT_VIEWER'],
    ['no role', 'writer@avenuez.com', ''],
  ])('every action refuses %s and touches nothing', async (_n, email, role) => {
    as(email, role)
    const results = [
      await uploadGscExport(form()),
      await publishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP }),
      await unpublishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP }),
      await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', hidden: true }),
    ]
    for (const r of results) expect(r).toEqual({ ok: false, error: 'forbidden' })
    expect(getClientBySlug).not.toHaveBeenCalled()
    expect(completeRun).not.toHaveBeenCalled()
    expect(setSnapshotStatus).not.toHaveBeenCalled()
    expect(setOverride).not.toHaveBeenCalled()
  })
})

describe('uploadGscExport', () => {
  test('stores the parsed indexing export, the export date, and revalidates both report routes', async () => {
    expect(await uploadGscExport(form())).toEqual({ ok: true })
    expect(completeRun).toHaveBeenCalledWith('client-1', SNAP, 'gsc_indexing', new Uint8Array([1, 2, 3]), {
      metrics: { gscIndexed: 1080, gscNotIndexed: 934 }, issues: [], snapshot: { gscExportDate: '2026-11-21' },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[clientSlug]/reports', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/portal/[clientSlug]/reports', 'page')
  })

  test('a CWV slot parses with its device and writes only that device columns; date falls back to today', async () => {
    const issues = [{ source: 'gsc_cwv' as const, nativeName: 'CLS', nativeSeverity: 'Poor', urlCount: 8, device: 'desktop' as const }]
    vi.mocked(parseGscCwv).mockReturnValue({
      ok: true, value: { exportDate: null, device: 'desktop', poor: 0, ni: 8, good: 164, issues },
    })
    expect(await uploadGscExport(form({ slot: 'gsc_cwv_desktop' }))).toEqual({ ok: true })
    expect(parseGscCwv).toHaveBeenCalledWith(expect.any(Uint8Array), 'desktop')
    expect(completeRun).toHaveBeenCalledWith('client-1', SNAP, 'gsc_cwv_desktop', expect.any(Uint8Array), {
      metrics: { cwvDesktopPoor: 0, cwvDesktopNi: 8, cwvDesktopGood: 164 }, issues, snapshot: { gscExportDate: '2026-11-25' },
    })
  })

  test('a mobile slot writes the mobile columns', async () => {
    vi.mocked(parseGscCwv).mockReturnValue({
      ok: true, value: { exportDate: '2026-11-21', device: 'mobile', poor: 1, ni: 2, good: 3, issues: [] },
    })
    await uploadGscExport(form({ slot: 'gsc_cwv_mobile' }))
    expect(vi.mocked(completeRun).mock.calls[0][4].metrics).toEqual({ cwvMobilePoor: 1, cwvMobileNi: 2, cwvMobileGood: 3 })
  })

  test('a snapshot from another client is refused and nothing is parsed or written', async () => {
    vi.mocked(getSnapshotBundle).mockResolvedValue(null)
    expect(await uploadGscExport(form())).toEqual({ ok: false, error: 'snapshot not found' })
    expect(getSnapshotBundle).toHaveBeenCalledWith('client-1', SNAP)
    expect(parseGscPageIndexing).not.toHaveBeenCalled()
    expect(completeRun).not.toHaveBeenCalled()
  })

  test('a wrong-report upload returns the parser reason and writes nothing', async () => {
    const reason = 'This is the Core Web Vitals mobile export; upload it in the mobile slot.'
    vi.mocked(parseGscCwv).mockReturnValue({ ok: false, reason })
    expect(await uploadGscExport(form({ slot: 'gsc_cwv_desktop' }))).toEqual({ ok: false, error: reason })
    expect(completeRun).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  test('an oversize file is refused before it is read or parsed', async () => {
    const big = new File([new Uint8Array(2_097_153)], FILE_NAME)
    const spy = vi.spyOn(big, 'arrayBuffer')
    expect(await uploadGscExport(form({ file: big }))).toEqual({ ok: false, error: 'The file is larger than 2 MB.' })
    expect(spy).not.toHaveBeenCalled()
    expect(parseGscPageIndexing).not.toHaveBeenCalled()
    expect(completeRun).not.toHaveBeenCalled()
  })

  test.each([
    ['a missing file', { file: undefined }],
    ['an empty file', { file: new File([], FILE_NAME) }],
    ['a file sent as text', { file: 'not a file' }],
    ['an unknown slot', { slot: 'sf' }],
    ['a missing slot', { slot: undefined }],
    ['a snapshot id that is not a uuid', { snapshotId: "x'; drop" }],
    ['a client slug sent as a file', { clientSlug: new File([], 'x') }],
  ])('%s is refused before any lookup', async (_n, over) => {
    const r = await uploadGscExport(form(over as Record<string, string | File | undefined>))
    expect(r.ok).toBe(false)
    expect(getSnapshotBundle).not.toHaveBeenCalled()
    expect(completeRun).not.toHaveBeenCalled()
  })

  test('an unknown client is refused', async () => {
    vi.mocked(getClientBySlug).mockResolvedValue(null as never)
    expect(await uploadGscExport(form())).toEqual({ ok: false, error: 'client not found' })
    expect(getSnapshotBundle).not.toHaveBeenCalled()
  })

  test('a parser that throws is refused with a plain message', async () => {
    vi.mocked(parseGscPageIndexing).mockImplementation(() => { throw new Error(`boom ${FILE_NAME}`) })
    expect(await uploadGscExport(form())).toEqual({ ok: false, error: "This isn't a Search Console export the page can read." })
    expect(completeRun).not.toHaveBeenCalled()
    expect(logged()).not.toContain(FILE_NAME)
  })

  test('a failed store write is a plain message; the log has the slug, slot and no database text', async () => {
    vi.mocked(completeRun).mockRejectedValue(new Error('DETAIL: Failing row contains (secret-row)'))
    expect(await uploadGscExport(form())).toEqual({ ok: false, error: 'Could not save the upload. Try again.' })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(logged()).toContain('[tech-audit] a-client 2026-11-01 gsc_indexing')
    expect(logged()).not.toContain('secret-row')
    expect(logged()).not.toContain(FILE_NAME)
  })
})

describe('publish and unpublish', () => {
  test('publish sets the status and the publisher, then revalidates', async () => {
    expect(await publishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP })).toEqual({ ok: true })
    expect(setSnapshotStatus).toHaveBeenCalledWith('client-1', SNAP, 'published', 'writer@avenuez.com')
    expect(revalidatePath).toHaveBeenCalledWith('/portal/[clientSlug]/reports', 'page')
  })
  test('unpublish sets draft', async () => {
    expect(await unpublishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP })).toEqual({ ok: true })
    expect(setSnapshotStatus).toHaveBeenCalledWith('client-1', SNAP, 'draft', 'writer@avenuez.com')
  })
  test('a snapshot from another client (store throws Snapshot not found) is refused', async () => {
    vi.mocked(setSnapshotStatus).mockRejectedValue(new Error('Snapshot not found'))
    expect(await publishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP })).toEqual({ ok: false, error: 'snapshot not found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  test('another failure is a plain message with no database text', async () => {
    vi.mocked(setSnapshotStatus).mockRejectedValue(new Error('connection to secret-host failed'))
    expect(await publishSnapshot({ clientSlug: 'a-client', snapshotId: SNAP })).toEqual({ ok: false, error: 'Could not save. Try again.' })
    expect(logged()).not.toContain('secret-host')
  })
  test('a non-uuid id and an unknown client write nothing', async () => {
    expect((await publishSnapshot({ clientSlug: 'a-client', snapshotId: 'nope' })).ok).toBe(false)
    vi.mocked(getClientBySlug).mockResolvedValue(null as never)
    expect(await publishSnapshot({ clientSlug: 'zzz', snapshotId: SNAP })).toEqual({ ok: false, error: 'client not found' })
    expect(setSnapshotStatus).not.toHaveBeenCalled()
  })
})

describe('setIssueOverride', () => {
  test('hides a row for the client; the note is trimmed', async () => {
    expect(await setIssueOverride({ clientSlug: 'a-client', issueKey: 'sf:404', hidden: true, note: '  fixed in Dec  ' })).toEqual({ ok: true })
    expect(setOverride).toHaveBeenCalledWith('client-1', 'sf:404', { hidden: true, note: 'fixed in Dec' }, 'writer@avenuez.com')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/[clientSlug]/reports', 'page')
  })
  test('an empty or blank note clears it (null); an omitted note is left alone', async () => {
    await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', note: '   ' })
    expect(setOverride).toHaveBeenLastCalledWith('client-1', 'k', { note: null }, 'writer@avenuez.com')
    await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', hidden: false })
    expect(setOverride).toHaveBeenLastCalledWith('client-1', 'k', { hidden: false }, 'writer@avenuez.com')
  })
  test('a note over 280 characters is refused; exactly 280 is kept', async () => {
    expect(await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', note: 'x'.repeat(281) }))
      .toEqual({ ok: false, error: 'The note is longer than 280 characters.' })
    expect(setOverride).not.toHaveBeenCalled()
    expect((await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', note: 'x'.repeat(280) })).ok).toBe(true)
  })
  test.each([
    ['an empty issue key', { issueKey: '' }],
    ['an over-long issue key', { issueKey: 'k'.repeat(301) }],
    ['a hidden that is not a boolean', { hidden: 'yes' }],
    ['a note that is not a string', { note: 5 }],
    ['nothing to change', {}],
  ])('%s is refused and writes nothing', async (_n, over) => {
    const r = await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', ...over } as never)
    expect(r.ok).toBe(false)
    expect(setOverride).not.toHaveBeenCalled()
  })
  test('a null input is a result, not a throw', async () => {
    expect(await setIssueOverride(null as never)).toEqual({ ok: false, error: 'invalid request' })
    expect(await publishSnapshot(null as never)).toEqual({ ok: false, error: 'invalid request' })
  })
  test('a failed write is a plain message', async () => {
    vi.mocked(setOverride).mockRejectedValue(new Error('secret-row'))
    expect(await setIssueOverride({ clientSlug: 'a-client', issueKey: 'k', hidden: true })).toEqual({ ok: false, error: 'Could not save. Try again.' })
    expect(logged()).not.toContain('secret-row')
  })
})
