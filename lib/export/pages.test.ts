import { expect, test } from 'vitest'
import { exportablePages } from './pages'

const RENAISSANCE_LIKE = {
  enabledReports: ['executive-overview', 'peec-ai', 'ga4', 'paid-media', 'organic-social', 'request-a-report'],
  hiddenReports: ['technical-audit', 'content-impact'],
  dashSocialConfig: { channels: ['INSTAGRAM', 'LINKEDIN'] },
}
const titles = (c: Parameters<typeof exportablePages>[0]) => exportablePages(c).map((p) => `${p.reportTitle} / ${p.title}`)

// Spec 2026-10-14 B2: the client's server-exportable pages, in sidebar order, tabs as the sidebar shows them.
test("a client's exportable pages, in sidebar order, with no GA4 or Request a Report", () => {
  expect(titles(RENAISSANCE_LIKE)).toEqual([
    'Executive Overview / Executive Overview',
    'Answer Engine Optimization / Answer Engine Optimization',
    'Answer Engine Optimization / PR Influence',
    'Paid Media / Overview',
    'Paid Media / Paid Search',
    'Paid Media / Meta Advertising',
    'Paid Media / LinkedIn Advertising',
    'Organic Social / Organic Social',
    'Organic Social / Influencer',
    'Organic Social / Instagram',
    'Organic Social / LinkedIn',
  ])
})

test('each page carries the section, the tab id and a unique key', () => {
  const pages = exportablePages(RENAISSANCE_LIKE)
  expect(pages[0]).toEqual({ key: 'executive-overview:', section: 'executive-overview', subsection: null, reportTitle: 'Executive Overview', title: 'Executive Overview', label: 'Executive Overview' })
  expect(pages.find((p) => p.title === 'PR Influence')).toMatchObject({ key: 'peec-ai:pr-influence', section: 'peec-ai', subsection: 'pr-influence' })
  expect(pages.find((p) => p.title === 'Instagram')).toMatchObject({ key: 'organic-social:organic-instagram', subsection: 'organic-instagram' })
  expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length)
})

// A hidden tab would export as its section's Overview again (resolveExportView), so it is never listed.
// The popover lists each page under its report by its sidebar label; the progress line names it by its page title.
test("each page's label is its sidebar tab label", () => {
  const pages = exportablePages(RENAISSANCE_LIKE)
  expect(pages.filter((p) => p.section === 'peec-ai').map((p) => p.label)).toEqual(['Overview', 'PR Influence'])
  expect(pages.filter((p) => p.section === 'organic-social').map((p) => p.label)).toEqual(['Overview', 'Influencer', 'Instagram', 'LinkedIn'])
})

test('a hidden Paid Media tab is not listed', () => {
  expect(titles({ ...RENAISSANCE_LIKE, hiddenReports: ['meta'] })).not.toContain('Paid Media / Meta Advertising')
})

test('a hidden Organic Social Overview is not listed: the report starts at Instagram, Influencer back under it', () => {
  const os = titles({ ...RENAISSANCE_LIKE, hiddenReports: ['organic-overview'] }).filter((t) => t.startsWith('Organic Social'))
  expect(os).toEqual(['Organic Social / Instagram', 'Organic Social / Influencer', 'Organic Social / LinkedIn'])
})

test('a hidden Influencer tab is not listed', () => {
  expect(titles({ ...RENAISSANCE_LIKE, hiddenReports: ['organic-influencer'] })).not.toContain('Organic Social / Influencer')
})

test('a hidden report is not listed at all', () => {
  expect(titles({ ...RENAISSANCE_LIKE, hiddenReports: ['paid-media'] }).some((t) => t.startsWith('Paid Media'))).toBe(false)
})

test('a client with no server-exportable report has no pages', () => {
  expect(exportablePages({ enabledReports: ['ga4', 'request-a-report'] })).toEqual([])
})
