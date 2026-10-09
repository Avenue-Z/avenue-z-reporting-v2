import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
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
  // Final review, Minor 2 (re-graded: a stranded title): the window line stays with the tiles, so the h2 can't strand with it.
  expect(screen.getByText(/Open pipeline is as of today/).hasAttribute('data-export-keep-with-next')).toBe(true)
  expect(screen.getAllByTestId('owner-row')[0].parentElement?.hasAttribute('data-export-wrap')).toBe(true)
})

test('contact pacing prints as one block', () => {
  const { container } = render(<ContactPacing data={CONTACTS} />)
  expect((container.firstElementChild as HTMLElement).hasAttribute('data-export-block')).toBe(true)
})

// Final review, Important 1: each bar's hover tooltip is a w-max absolute span that pokes ~150 px past the content
// width; Chromium's print then shrinks every page ~11% to fit it. Hidden (display: none) in the export, none overflow.
test("contact pacing's bar tooltips are hidden in the export", () => {
  const { container } = render(<ContactPacing data={CONTACTS} />)
  const tips = [...container.querySelectorAll('span.absolute')].filter((s) => s.textContent?.startsWith('Week of'))
  expect(tips).toHaveLength(CONTACTS.weeks.length)
  expect(tips.every((t) => t.hasAttribute('data-export-hide'))).toBe(true)
})

// Thomas, #354 index.tsx:229: the placeholders were not blocks, so for a client with no CRM "CRM not connected" could print
// at a page foot and "Connect your CRM…" at the next page's head.
test('the NeedsConnection, LoadFailed and NoData cards each print whole', async () => {
  const { NeedsConnection } = await import('./needs-connection')
  const { LoadFailed, NoData } = await import('./no-data')
  for (const ui of [<NeedsConnection key="n" sourceName="CRM" />, <LoadFailed key="l" />, <NoData key="d" />]) {
    const { container, unmount } = render(ui)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-export-block')).toBe(true)
    unmount()
  }
})

// Thomas, #354 contact-pacing.tsx:187: the CRM bars are brand green (#60FF80) drawn off any chart panel, about 1.4:1 on
// white paper, and the in-progress week at 20% alpha nearly vanishes. Under the export theme, inside the blocks marked
// data-export-bars, they print darkened. Checked on the server's own markup (the style strings the export page receives),
// with the stylesheet's own selectors.
const css = readFileSync(join(process.cwd(), 'app/export/export-theme.css'), 'utf8')
const barRules = [...css.matchAll(/^\.export-theme ([^{]*\[data-export-bars\][^{]*)\{([^}]*)\}/gm)]
  .map(([, sel, body]) => ({ selectors: sel.split(',').map((s) => s.trim().replace(/^\.export-theme\s+/, '')), body }))
const printedAs = (el: Element) => barRules.filter((r) => r.selectors.some((s) => el.matches(`.export-theme ${s}`))).map((r) => r.body.trim())
const mount = (html: string) => { document.body.innerHTML = `<div class="export-theme">${html}</div>`; return document.body }

test('the contact bars and the owner bars print darkened on paper, the in-progress week still visible', () => {
  const pacing = mount(renderToStaticMarkup(<ContactPacing data={CONTACTS} />))
  const full = pacing.querySelector('[data-week]:not([data-partial])')!
  const partial = pacing.querySelector('[data-partial]')!
  expect(printedAs(full).join(' ')).toMatch(/background-color: #15803d !important/)
  expect(printedAs(partial).join(' ')).toMatch(/background-color: rgb\(21 128 61 \/ 0\.25\) !important/)
  expect(printedAs(partial).join(' ')).toMatch(/border-top-color: #15803d !important/)
  const owners = mount(renderToStaticMarkup(<PipelinePerformance data={PIPELINE} />))
  expect(printedAs(owners.querySelector('[data-testid="owner-row"] .bg-brand-green')!).join(' ')).toMatch(/background-color: #15803d !important/)
})
