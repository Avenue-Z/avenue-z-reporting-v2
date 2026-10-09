import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The ten GA4/Peec fetches return nothing and no CRM is configured: the subject is the page's structure in the export.
vi.mock('@/lib/ga4/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ga4/client')>()),
  ga4Query: vi.fn(async () => ({ rows: [] })),
}))
vi.mock('@/lib/peec/client', () => ({ getPeecOverview: vi.fn(async () => null) }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ slug: 'renaissance' })) }))
vi.mock('@/lib/salesforce/pipeline', () => ({ getSalesforcePipeline: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/contacts', () => ({ getSalesforceWeeklyContacts: vi.fn(async () => null) }))
vi.mock('@/lib/salesforce/leads', () => ({ getSalesforceWeeklyLeads: vi.fn(async () => null) }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { ExecutiveOverviewReport } from './index'
import { PipelinePerformance } from './pipeline-performance'
import { ContactPacing } from './contact-pacing'
import type { PipelineData, WeeklyContacts } from '@/lib/salesforce/types'

const PIPELINE: PipelineData = {
  openDeals: { value: 297 }, totalPipeline: { value: 4_820_000 }, closedWon: { value: 1_375_000, delta: 15.7 }, weightedPipeline: { value: 2_140_000 },
  byOwner: [{ owner: 'Dana Reyes', count: 41, amount: 900_000 }, { owner: 'Sam Okonkwo', count: 18, amount: 410_000 }],
  ownersTruncated: false, stageTruncated: false, unrecognizedClosedFlags: 0, wonStageUnmatched: false, openUnavailable: false,
  wonUnavailable: false, campaignScoped: false, openCampaignUnmatched: false, wonCampaignUnmatched: false, ownerCampaignUnmatched: false,
  openValueUnknown: false, wonValueUnknown: false,
}
const CONTACTS: WeeklyContacts = {
  weeks: [{ week: '2026-W31', contacts: 240 }, { week: '2026-W32', contacts: 186 }, { week: '2026-W33', contacts: 52 }],
  currentWeek: 52, currentWeekPartial: true, daysElapsedInCurrentWeek: 3, previousWeek: 186, priorYearWeek: 149,
  completedWeekOverWeek: -22.5, campaignUnmatched: false,
}

// PDF export (spec 2026-10-09 §5): titles stay with what follows; KPI and CRM blocks stay whole.
test('every section title is kept with what follows, and the KPI grid is one block', async () => {
  render(<ExportModeProvider>{await ExecutiveOverviewReport({ clientSlug: 'renaissance' })}</ExportModeProvider>)
  // h2: the Journey's Web Analytics stage card carries the same words.
  for (const title of ['Web Analytics', 'Contact Creation', 'Pipeline Performance']) {
    expect(screen.getByText(title, { selector: 'h2' }).hasAttribute('data-export-keep-with-next')).toBe(true)
  }
  expect(screen.getByText('Last 30 days').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getByText('Sessions').closest('.grid')?.hasAttribute('data-export-block')).toBe(true)
}, 20_000) // the first render of the whole page pays its cold imports (seen at 6.9 s under a full parallel run)

test('a client with no CRM prints its Not connected cards and nothing waits on them', async () => {
  render(<ExportModeProvider>{await ExecutiveOverviewReport({ clientSlug: 'renaissance' })}</ExportModeProvider>)
  expect(screen.getAllByText('CRM not connected')).toHaveLength(2)
  expect(document.querySelector('[data-export-pending]')).toBeNull()
}, 20_000)

test('pipeline: tiles are one block, the owners title stays with the list, owner names wrap', () => {
  const { container } = render(<PipelinePerformance data={PIPELINE} />)
  expect(container.querySelector('.grid')?.hasAttribute('data-export-block')).toBe(true)
  expect(screen.getByText('Open Deals by Owner').hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getAllByTestId('owner-row')[0].parentElement?.hasAttribute('data-export-wrap')).toBe(true)
})

test('contact pacing prints as one block', () => {
  const { container } = render(<ContactPacing data={CONTACTS} />)
  expect((container.firstElementChild as HTMLElement).hasAttribute('data-export-block')).toBe(true)
})
