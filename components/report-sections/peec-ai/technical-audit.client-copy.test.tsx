import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { SFData, SFSnapshot } from '@/lib/screaming-frog/types'

// Every data source returns nothing: the subject is the empty states' copy, which clients see on the page and in the PDF.
const { getSFData } = vi.hoisted(() => ({ getSFData: vi.fn(async (): Promise<SFData | null> => null) }))
vi.mock('@/lib/screaming-frog/client', () => ({ getSFData }))
vi.mock('@/lib/sitebulb/client', async (orig) => ({ ...(await orig<object>()), getSitebulbData: vi.fn(async () => null) }))
vi.mock('@/lib/peec/agent-analytics', async (orig) => ({ ...(await orig<object>()), getAgentAnalytics: vi.fn(async () => null) }))
vi.mock('@/lib/peec/url-citations', () => ({ getUrlCitations: vi.fn(async () => []) }))
vi.mock('@/lib/ga4/client', async (orig) => ({ ...(await orig<object>()), ga4Query: vi.fn(async () => ({ rows: [] })) }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ slug: 'acme', domain: 'acme.com' })) }))

import { TooltipProvider } from '@/components/ui/tooltip'
import { TechnicalAuditReport } from './technical-audit'

const renderReport = async () => render(<TooltipProvider>{await TechnicalAuditReport({ clientSlug: 'acme' })}</TooltipProvider>)

// Thomas, #350 (technical-audit.tsx:409, :443): the empty states told the reader to "configure sfPrevCsvFileId in database"
// and named env vars. Clients read this page, and since the server PDF export it prints in their deliverables.
// Setup text: config keys, env vars, "for client", and instructions to configure or upload. The footer's data-source
// attribution (Screaming Frog, Sitebulb, Peec) stays: it's how a client learns where the numbers come from.
const INTERNAL = /sfPrevCsvFileId|PEEC_AI_|CUSTOMER_TOKEN|PROJECT_ID|database|configured for client|for client|upload a prior crawl|Requires both/i

test('with no crawl and no bot analytics, the empty states say what is missing in client terms, with no setup detail', async () => {
  const { container } = await renderReport()
  expect(container.textContent).not.toMatch(INTERNAL)
  expect(container.textContent).toContain("Site crawl data isn't available yet.")
  expect(container.textContent).toContain("AI bot activity isn't available for this site yet.")
  expect(container.textContent).toContain("The AEO checklist isn't available for this site yet.")
  expect(container.textContent).toContain('Needs both site crawl data and AI bot activity.')
  expect(container.textContent).toMatch(/Data sources: Screaming Frog CSV/)
})

test('with one crawl, the trend note says changes appear after the next crawl, with no setup detail', async () => {
  const snapshot: SFSnapshot = { crawlDate: '2026-09-01', totalUrls: 10, htmlUrls: 8, criticalCount: 0, highCount: 1, mediumCount: 2, lowCount: 3,
    totalIssues: 6, topIssues: [], issueSummaries: [] }
  getSFData.mockResolvedValueOnce({ current: snapshot, prev: null, delta: [], newIssues: 0, resolvedIssues: 0, persistentIssues: 0, weightedScore: 1, prevWeightedScore: null })
  const { container } = await renderReport()
  expect(container.textContent).not.toMatch(INTERNAL)
  expect(container.textContent).toContain('Only one crawl so far. Changes over time appear after the next crawl.')
  expect(container.textContent).toContain('Changes appear after the next crawl.')
})
