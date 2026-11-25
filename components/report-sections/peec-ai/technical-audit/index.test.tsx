// @vitest-environment jsdom
import { cloneElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { MetricsRow, RunRow, SnapshotRow } from '@/lib/technical-audit/store'

// Recharts draws nothing inside ResponsiveContainer in jsdom (it measures 0 by 0), so give it a size.
vi.mock('recharts', async (orig) => ({
  ...(await orig<object>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 300 }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/x' }))
vi.mock('@/app/actions/tech-audit', () => ({ publishSnapshot: vi.fn(), unpublishSnapshot: vi.fn(), uploadGscExport: vi.fn(), setIssueOverride: vi.fn() }))
vi.mock('@/lib/technical-audit/issue-map', () => ({ loadIssueMap: async () => new Map() }))

const h = vi.hoisted(() => ({ auth: vi.fn(), getSnapshots: vi.fn(), getSnapshotBundle: vi.fn(), sharedParts: vi.fn(), client: {} as Record<string, unknown> }))
vi.mock('@/auth', () => ({ auth: () => h.auth() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: async () => h.client, getCommentaryForView: async () => [] }))
vi.mock('@/components/report-sections/shared/shared-parts-header', () => ({
  SharedPartsHeader: (props: object) => { h.sharedParts(props); return <div data-testid="shared-parts" /> },
}))
vi.mock('@/lib/technical-audit/store', () => ({ getSnapshots: h.getSnapshots, getSnapshotBundle: h.getSnapshotBundle, getOverrides: async () => [] }))

import { TechnicalAuditPage } from './index'

const STAFF = { user: { role: 'INTERNAL_ADMIN', email: 'strategist@avenuez.com' } }
const CLIENT = { user: { role: 'CLIENT_VIEWER', email: 'someone@client.com' } }

const snap = (date: string, status: 'draft' | 'published' = 'published', over: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id: `id-${date}`, clientId: 'c1', snapshotDate: date, sfRunFolderId: null, sfCrawlDate: date, ahrefsCrawlDate: date,
  gscExportDate: null, ahrefsHealthScore: null, crawlSettingsChanged: false, status, publishedAt: null, publishedBy: null,
  createdAt: new Date(0), updatedAt: new Date(0), ...over,
})
const metrics = (over: Partial<MetricsRow> = {}): MetricsRow => ({
  id: 'm', snapshotId: 's', sfIssueTypesIssue: 4, sfIssueTypesWarning: 6, sfIssueTypesOpportunity: 3,
  sfUrlsIssue: 120, sfUrlsWarning: 300, sfUrlsOpportunity: 50, ahrefsHealthScore: 82, gscIndexed: null, gscNotIndexed: null,
  cwvMobilePoor: null, cwvMobileNi: null, cwvMobileGood: null, cwvDesktopPoor: null, cwvDesktopNi: null, cwvDesktopGood: null,
  ...over,
})
const run = (source: string, status = 'complete'): RunRow => ({
  id: `r-${source}`, snapshotId: 's', source, status, attempts: 1, lastError: null, uploadedBy: null,
  startedAt: null, finishedAt: null, createdAt: new Date(0), updatedAt: new Date(0),
})

let all: SnapshotRow[]
let metricsFor: (s: SnapshotRow) => MetricsRow

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
  all = [snap('2026-11-01'), snap('2026-10-01')]
  h.client = { id: 'c1', slug: 'acme' }
  metricsFor = () => metrics()
  h.getSnapshots.mockImplementation(async (_c: string, o: { publishedOnly: boolean }) =>
    o.publishedOnly ? all.filter((s) => s.status === 'published') : all)
  h.getSnapshotBundle.mockImplementation(async (_c: string, id: string) => {
    const snapshot = all.find((s) => s.id === id)
    return snapshot ? { snapshot, runs: [run('sf'), run('ahrefs')], metrics: metricsFor(snapshot), issues: [] } : null
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

async function show(session: unknown, { snapshot, exporting = false }: { snapshot?: string; exporting?: boolean } = {}) {
  h.auth.mockResolvedValue(session)
  const page = await TechnicalAuditPage({ clientSlug: 'acme', snapshot })
  return render(<TooltipProvider>{exporting ? <ExportModeProvider>{page}</ExportModeProvider> : page}</TooltipProvider>)
}

describe('TechnicalAuditPage', { timeout: 20_000 }, () => {
  test('renders the commentary header bound to the snapshot date as a one-day range', async () => {
    await show(STAFF, { snapshot: '2026-10-01' })
    expect(screen.getByTestId('shared-parts')).toBeTruthy()
    expect(h.sharedParts).toHaveBeenCalledWith({ viewKey: 'peec-ai:technical-audit', clientSlug: 'acme', requestedRange: '2026-10-01,2026-10-01' })
  })

  test('renders the checklist for staff and not for clients', async () => {
    await show(STAFF)
    expect(screen.getByText('Before you publish')).toBeTruthy()
    cleanup()
    await show(CLIENT)
    expect(screen.queryByText('Before you publish')).toBeNull()
  })

  test('the checklist lists Commentary only when the brand has opted into it', async () => {
    await show(STAFF)
    expect(screen.queryByText('Commentary')).toBeNull()
    cleanup()
    h.client = { id: 'c1', slug: 'acme', reportSectionConfig: { 'peec-ai:technical-audit': { sharedParts: [{ id: 'commentary', version: 1 }] } } }
    await show(STAFF)
    expect(screen.getByText('Commentary')).toBeTruthy()
  })

  test('shows No crawl since for a stale brand (team only)', async () => {
    all = [snap('2026-09-01'), snap('2026-08-01')]
    await show(STAFF)
    expect(screen.getByText('No crawl since Sep 1, 2026')).toBeTruthy()
    cleanup()
    await show(CLIENT)
    expect(screen.queryByText(/No crawl since/)).toBeNull()
  })

  test('GSC tiles show the team/client blank copy when not uploaded', async () => {
    await show(STAFF)
    // Indexing, CWV mobile and CWV desktop: each blank slot says what to do.
    expect(screen.getAllByText('Upload the GSC report to fill this tile')).toHaveLength(3)
    expect(screen.queryByText('Not available for this month')).toBeNull()
    cleanup()
    await show(CLIENT)
    expect(screen.getAllByText('Not available for this month')).toHaveLength(3)
    expect(screen.queryByText('Upload the GSC report to fill this tile')).toBeNull()
  })

  test('a staff export prints the client blank copy', async () => {
    await show(STAFF, { exporting: true })
    expect(screen.getAllByText('Not available for this month')).toHaveLength(3)
    expect(screen.queryByText('Upload the GSC report to fill this tile')).toBeNull()
  })

  test('CWV tile renders mobile and desktop together', async () => {
    metricsFor = () => metrics({ cwvMobilePoor: 12, cwvMobileNi: 30, cwvMobileGood: 400, cwvDesktopPoor: 2, cwvDesktopNi: 8, cwvDesktopGood: 432 })
    await show(CLIENT)
    const mobile = screen.getByRole('group', { name: 'Mobile' })
    const desktop = screen.getByRole('group', { name: 'Desktop' })
    expect(mobile.compareDocumentPosition(desktop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mobile.textContent).toContain('400')
    expect(desktop.textContent).toContain('432')
  })

  test('client export of a draft date renders the latest published snapshot', async () => {
    all = [snap('2026-11-01', 'draft'), snap('2026-10-01'), snap('2026-09-01')]
    await show(CLIENT, { snapshot: '2026-11-01', exporting: true })
    expect(screen.getByText('Oct 1, 2026 (latest)')).toBeTruthy()
    expect(screen.getByText('Compared with: Sep 1, 2026')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Nov 1, 2026')
  })

  // The PDF follows client visibility whoever exports it: rendered as the export page renders it.
  test('a staff export of a draft date prints the latest published snapshot, as a client sees it', async () => {
    all = [snap('2026-11-01', 'draft'), snap('2026-10-01'), snap('2026-09-01')]
    h.auth.mockResolvedValue(STAFF)
    const { exportReportElement } = await import('@/components/export/report-element')
    const el = exportReportElement({ section: 'peec-ai', subsectionId: 'technical-audit', channel: null, view: null, pageTitle: 'x' },
      { clientSlug: 'acme', dateRange: 'last_30_days', compareRange: null, models: null, snapshot: '2026-11-01' })
    const page = await TechnicalAuditPage(el.props as Parameters<typeof TechnicalAuditPage>[0])
    render(<TooltipProvider><ExportModeProvider>{page}</ExportModeProvider></TooltipProvider>)
    expect(screen.getByText('Oct 1, 2026 (latest)')).toBeTruthy()
    expect(document.body.textContent).not.toContain('(draft)')
    expect(document.body.textContent).not.toContain('Nov 1, 2026')
    expect(screen.queryByText('Before you publish')).toBeNull()
    expect(screen.queryByText('Upload the GSC report to fill this tile')).toBeNull()
  })

  test('the first snapshot is the baseline', async () => {
    all = [snap('2026-11-01')]
    await show(CLIENT)
    expect(screen.getByText('Baseline — first snapshot')).toBeTruthy()
  })
})
