// The tab's layout after the 2026-11-24 feedback (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md,
// Unit A: F1, F4, F7, F13). Every chart card has a full row of its own, an analysis box sits under its card and outside
// it, the top conversation themes box lives in the Themes section, and the owned-channels note has the team's wording.
// The setup mirrors section.snapshot.test.tsx (a made-up workbook through the real parser; the store and commentary read
// replaced; each analysis box is a marker naming its key).
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import type { SlExport, SlMonthData, SlTopic, SlUpload } from '@/lib/organic-social/social-listening/types'

const h = vi.hoisted(() => ({
  getClientBySlug: vi.fn(), getCommentaryForViewPrefix: vi.fn(), getSlMonth: vi.fn(),
  clock: { value: { today: '2026-11-19', lastCompleteUtcDay: '2026-11-18', liveDayInProgress: false } },
}))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug: h.getClientBySlug, getCommentaryForViewPrefix: h.getCommentaryForViewPrefix }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({ getSlMonth: h.getSlMonth }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => h.clock.value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/report-sections/commentary/monthly', () => ({
  monthlyCommentary: vi.fn(async ({ viewKey }: { viewKey: string }) => <div data-box={viewKey.split(':').at(-1)} />),
}))

import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { buildWorkbook } from '@/lib/organic-social/social-listening/test-workbook'
import { SocialListeningSection } from './section'

const SETTING = { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry', industrySample: 10 }
const CLIENT = {
  id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
  dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: SETTING },
}
const OCT = 'custom:2026-10-01,2026-10-31'

function parsed(topic: SlTopic): SlExport {
  const topicName = topic === 'brand' ? 'Made Up Brand' : 'Made Up Industry'
  const r = parseTalkwalkerExport(buildWorkbook({ topic, topicName, month: '2026-10' }), { topic, topicName, month: '2026-10' })
  if (!r.ok) throw new Error(`the test workbook did not parse: ${JSON.stringify(r.failed)}`)
  return r.data
}
const up = (id: string, data: SlExport): SlUpload => ({ id, month: data.month, topic: data.topic, data, beforeOpen: true, uploadedAt: new Date('2026-11-02T00:00:00Z') })
const monthData = (): SlMonthData => ({ uploads: [up('u-brand', parsed('brand')), up('u-industry', parsed('industry'))], history: [], posts: [], trends: null })

const page = async (o: Partial<Parameters<typeof SocialListeningSection>[0]> = {}) => {
  const el = await SocialListeningSection({ clientSlug: 'a-client', servedRange: OCT, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com', topic: 'brand', exporting: false, ...o })
  return render(<>{el}</>).container
}

const cls = (el: Element, name: string) => Array.from(el.classList).some((c) => c === name || c.startsWith(`_${name}_`))
const cards = (root: Element) => Array.from(root.querySelectorAll('h3')).map((h3) => h3.closest('div[class]')!.parentElement!)
  .filter((card) => cls(card, 'card'))
const cardTitled = (root: Element, title: string) => cards(root).find((c) => c.querySelector('h3')?.textContent?.startsWith(title))
const sectionTitled = (root: Element, title: string) => Array.from(root.querySelectorAll('section'))
  .find((s) => s.querySelector('h2')?.textContent === title)

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  h.getClientBySlug.mockResolvedValue(CLIENT)
  h.getCommentaryForViewPrefix.mockResolvedValue([])
  h.getSlMonth.mockResolvedValue(monthData())
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { warn.mockRestore() })

/** The two-column rows that hold chart cards, each as the titles of its cards. */
const pairedRows = (root: Element) => Array.from(root.querySelectorAll('div[class]')).filter((d) => cls(d, 'g2') && d.querySelector('h3'))
  .map((row) => ({ row, titles: Array.from(row.querySelectorAll('h3')).map((h) => h.textContent) }))

describe('rows', () => {
  test('brand: the two donuts stay side by side, as on the approved tab, in an aligned pair row; nothing else is paired', async () => {
    const rows = pairedRows(await page())
    expect(rows.map((r) => r.titles)).toEqual([['Share of sentiment', 'Without brand-owned channels']])
    expect(cls(rows[0].row, 'pair')).toBe(true)
  })

  test('industry: share of sentiment and the month-by-month chart stay side by side, as on the approved tab; nothing else is paired', async () => {
    const rows = pairedRows(await page({ topic: 'industry' }))
    expect(rows.map((r) => r.titles)).toEqual([['Share of sentiment', 'Sentiment, October']])
    expect(cls(rows[0].row, 'pair')).toBe(true)
  })

  test('the donuts keep the approved markup inside their cards', async () => {
    for (const topic of ['brand', 'industry'] as const) {
      const body = cardTitled(await page({ topic }), 'Share of sentiment')!.querySelector('ul')!.parentElement!
      expect(body.className.replace(/_([A-Za-z][\w-]*)_[0-9a-f]{6}/g, '$1')).toBe('cardBody donutWrap')
    }
  })
})

describe.each(['brand', 'industry'] as const)('%s topic layout', (topic) => {
  test('every analysis box of a chart card sits under its card, outside it, in one export block with it', async () => {
    const root = await page({ topic })
    for (const card of cards(root)) {
      expect(card.querySelector('[data-box]')).toBeNull()
      const cell = card.nextElementSibling
      expect(cell?.querySelector('[data-box]')).not.toBeNull()
      expect(card.hasAttribute('data-export-block')).toBe(false)
      expect(card.parentElement!.hasAttribute('data-export-block')).toBe(true)
    }
  })

  test('the top conversation themes box sits inside the Themes section, with no section of its own', async () => {
    const root = await page({ topic })
    const themes = sectionTitled(root, 'Themes')!
    expect(themes.querySelector(`[data-box="${topic === 'brand' ? 'b' : 'i'}-conv"]`)).not.toBeNull()
    expect(themes.textContent).toContain('Top conversation themes')
    expect(sectionTitled(root, 'Top conversation themes')).toBeUndefined()
  })
})

describe('brand copy', () => {
  test("the owned-channels note has the team's wording", async () => {
    const card = cardTitled(await page(), 'Without brand-owned channels')!
    expect(card.textContent).toContain("Excludes results from the brand's owned channels")
    expect(card.textContent).not.toContain('what everyone else said')
  })
})

describe('industry month-by-month card (Q3: stays until Savannah answers)', () => {
  test('it is still drawn, on a full row of its own', async () => {
    const root = await page({ topic: 'industry' })
    const card = cardTitled(root, 'Sentiment, ')
    expect(card).toBeDefined()
    expect(card!.nextElementSibling?.querySelector('[data-box]')?.getAttribute('data-box')).toBe('i-ytd')
  })

  test('the conversation box still shows for staff when the month has no industry upload', async () => {
    h.getSlMonth.mockResolvedValue({ ...monthData(), uploads: [up('u-brand', parsed('brand'))] })
    const root = await page({ topic: 'industry' })
    expect(root.querySelector('[data-box="i-conv"]')).not.toBeNull()
  })
})

// Unit C (plan 2026-11-24, F8, F14, D2, D3): the Line / Columns toggle.
describe('line views and the toggle', () => {
  const toggleOf = (card: Element) => Array.from(card.querySelectorAll('button')).map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`)
  const ariaOf = (card: Element) => card.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? ''

  test('brand: Sentiment year to date and Reddit start on the line, with the toggle; positive + neutral has no toggle', async () => {
    const root = await page()
    for (const title of ['Sentiment, ', 'Reddit sentiment']) {
      const card = cardTitled(root, title)!
      expect(toggleOf(card)).toEqual(['Line:true', 'Columns:false'])
      expect(ariaOf(card)).toMatch(/^Positive: /)
    }
    expect(toggleOf(cardTitled(root, 'Positive + neutral combined')!)).toEqual([])
  })

  test('industry: sentiment over time and the month-by-month chart start on the line, with the toggle', async () => {
    const root = await page({ topic: 'industry' })
    expect(toggleOf(cardTitled(root, 'Sentiment over time')!)).toEqual(['Line:true', 'Columns:false'])
    expect(ariaOf(cardTitled(root, 'Sentiment over time')!)).toBe('Results per day by sentiment, as lines')
    expect(toggleOf(cardTitled(root, 'Sentiment, ')!)).toEqual(['Line:true', 'Columns:false'])
  })

  test('a chart the URL set to columns starts on its columns, which are the chart as it was before', async () => {
    const root = await page({ cols: ['b-ytd', 'b-reddit'] })
    const ytd = cardTitled(root, 'Sentiment, ')!
    expect(toggleOf(ytd)).toEqual(['Line:false', 'Columns:true'])
    expect(ariaOf(ytd)).toMatch(/^Brand sentiment by month, /)
    expect(ariaOf(cardTitled(root, 'Reddit sentiment')!)).toBe('Reddit sentiment by month')
    const industry = await page({ topic: 'industry', cols: ['i-sentday'] })
    expect(ariaOf(cardTitled(industry, 'Sentiment over time')!)).toBe('Results per day by sentiment')
  })

  test('the PDF prints the view the URL named, with no toggle buttons', async () => {
    const root = await page({ exporting: true, cols: ['b-ytd'] })
    expect(ariaOf(cardTitled(root, 'Sentiment, ')!)).toMatch(/^Brand sentiment by month, /)
    expect(ariaOf(cardTitled(root, 'Reddit sentiment')!)).toMatch(/^Positive: /)
    expect(root.querySelectorAll('button')).toHaveLength(0)
  })
})
