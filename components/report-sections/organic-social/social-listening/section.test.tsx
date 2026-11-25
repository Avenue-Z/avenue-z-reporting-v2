// The Social Listening section end to end on the server side: a made-up workbook parsed by the real parser, the store and
// the commentary read replaced. The rules themselves are tested in lib/organic-social/social-listening/view-model.test.ts;
// this proves the page renders them (spec sections 5 and 9, R2-1).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SlExport, SlMonthData, SlTopic, SlUpload } from '@/lib/organic-social/social-listening/types'
import type { CommentaryEntry } from '@/lib/commentary/types'

const h = vi.hoisted(() => ({
  getClientBySlug: vi.fn(), getCommentaryForViewPrefix: vi.fn(), getSlMonth: vi.fn(),
  clock: { value: { today: '2026-11-19', lastCompleteUtcDay: '2026-11-18', liveDayInProgress: false } },
}))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug: h.getClientBySlug, getCommentaryForViewPrefix: h.getCommentaryForViewPrefix }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({ getSlMonth: h.getSlMonth }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => h.clock.value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
// Each analysis box is a marker naming its key; the commentary panel has its own tests.
vi.mock('@/components/report-sections/commentary/monthly', () => ({
  monthlyCommentary: vi.fn(async ({ viewKey }: { viewKey: string }) => <div data-box={viewKey.split(':').at(-1)} />),
}))

import { parseTalkwalkerExport } from '@/lib/organic-social/social-listening/export-parse'
import { buildWorkbook } from '@/lib/organic-social/social-listening/test-workbook'
import { NOT_READY_TEXT } from '@/lib/organic-social/social-listening/view-model'
import { SocialListeningSection } from './section'

const SETTING = { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry', industrySample: 10 }
const client = (sl: unknown = SETTING) => ({
  id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
  dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: sl },
})
const OCT = 'custom:2026-10-01,2026-10-31'

function parsed(topic: SlTopic, month = '2026-10'): SlExport {
  const r = parseTalkwalkerExport(buildWorkbook({ topic, topicName: topic === 'brand' ? 'Made Up Brand' : 'Made Up Industry', month }), {
    topic, topicName: topic === 'brand' ? 'Made Up Brand' : 'Made Up Industry', month,
  })
  if (!r.ok) throw new Error(`the test workbook did not parse: ${JSON.stringify(r.failed)}`)
  return r.data
}
let n = 0
const up = (data: SlExport, beforeOpen = true): SlUpload => ({ id: `u${n++}`, month: data.month, topic: data.topic, data, beforeOpen, uploadedAt: new Date('2026-11-02T00:00:00Z') })
const monthData = (uploads: SlUpload[], over: Partial<SlMonthData> = {}): SlMonthData => ({ uploads, history: [], posts: [], trends: null, ...over })
const approvedBox = (box: string): CommentaryEntry => ({
  id: `e-${box}`, viewKey: `organic-social:social-listening:${box}` as CommentaryEntry['viewKey'], bodyHtml: '<p>x</p>',
  periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'approved', updatedBy: 's@avenuez.com', updatedAt: '2026-11-03T00:00:00.000Z',
  approvedBy: 'a@avenuez.com', approvedAt: '2026-11-03T00:00:00.000Z', deletedAt: null, deletedBy: null,
})

const show = async (o: Partial<Parameters<typeof SocialListeningSection>[0]> = {}) => {
  const el = await SocialListeningSection({ clientSlug: 'a-client', servedRange: OCT, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com', topic: 'brand', exporting: false, ...o })
  return render(<>{el}</>)
}
const boxes = (c: HTMLElement) => [...c.querySelectorAll('[data-box]')].map((e) => e.getAttribute('data-box'))
const h2s = () => screen.queryAllByRole('heading', { level: 2 }).map((e) => e.textContent)

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  h.getClientBySlug.mockResolvedValue(client())
  h.getCommentaryForViewPrefix.mockResolvedValue([])
  h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand')), up(parsed('industry'))]))
  h.clock.value = { today: '2026-11-19', lastCompleteUtcDay: '2026-11-18', liveDayInProgress: false }
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { warn.mockRestore() })

describe('staff, brand', () => {
  test('every section in the spec order, every brand box, the pills and the re-upload control', async () => {
    const { container } = await show()
    expect(h2s()).toEqual(['Data', 'Sentiment', 'Year to date', 'Media types', 'Themes', 'Top influencers', 'Most relevant posts', 'Key takeaways', 'Keyword appendix'])
    expect(boxes(container)).toEqual([
      'b-kpis', 'b-daily', 'b-sent', 'b-owned', 'b-cross', 'b-ytd', 'b-posneu', 'b-reddit', 'b-media', 'b-mediasent', 'b-themes', 'b-trends',
      'b-conv', 'b-authors', 'b-posts', 'b-takeaways', 'b-keywords',
    ])
    expect(screen.getByRole('button', { name: /Brand: Made Up Brand/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Industry: Made Up Industry/ })).toBeTruthy()
    expect(screen.getByText('Upload a new brand export for October 2026')).toBeTruthy()
    expect(screen.getByText('Without brand-owned channels')).toBeTruthy()
    // Every box on this tab is the mockup's analysis box.
    const { monthlyCommentary } = await import('@/components/report-sections/commentary/monthly')
    const { SlAnalysis } = await import('./analysis')
    expect(vi.mocked(monthlyCommentary).mock.calls.every(([a]) => (a as { Panel?: unknown }).Panel === SlAnalysis)).toBe(true)
    expect(h.getSlMonth).toHaveBeenCalledWith('client-uuid', ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  })

  test('a media type the app has no colour for still renders: its row, share and an n/a change', async () => {
    const { container } = await show()
    // The test workbook's media types are Instagram, Reddit and News; News is not in MEDIA_COLORS. The share bars are
    // all cyan, as the approved mockup draws them.
    const head = [...container.querySelectorAll('span')].find((e) => e.textContent === 'Media type')!.parentElement!
    const row = [...head.parentElement!.children].find((r) => r.textContent?.startsWith('News'))!
    expect(row.textContent).toMatch(/%n\/a$/)
  })

  test('the owned-channels card is absent without the optional widget', async () => {
    const data = parsed('brand')
    delete data.ownedExcluded
    h.getSlMonth.mockResolvedValue(monthData([up(data)]))
    const { container } = await show()
    expect(screen.queryByText('Without brand-owned channels')).toBeNull()
    expect(boxes(container)).not.toContain('b-owned')
  })

  test('no brand upload: the upload control in place of the data, every other section still there', async () => {
    h.getSlMonth.mockResolvedValue(monthData([]))
    await show()
    expect(screen.getByText('Upload the brand export for October 2026')).toBeTruthy()
    expect(h2s()).toEqual(['Themes', 'Most relevant posts', 'Key takeaways', 'Keyword appendix'])
  })

  test('the live month: upload opens when it ends (R2-13)', async () => {
    h.getSlMonth.mockResolvedValue(monthData([]))
    await show({ servedRange: 'custom:2026-11-01,2026-11-18' })
    expect(screen.getByText('Upload opens when November 2026 ends.')).toBeTruthy()
    expect(screen.queryByText(/Upload the brand export/)).toBeNull()
  })

  test('staff notes: a re-upload after the month opened', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'), true), { ...up(parsed('brand'), false), uploadedAt: new Date('2026-11-20T00:00:00Z') }]))
    await show()
    expect(screen.getByText(/uploaded after the month opened to the client/)).toBeTruthy()
  })
})

describe('the client view (a client role, or any export)', () => {
  test('a client: no controls, no staff notes, no analysis-only section without approved text, only approved boxes', async () => {
    h.getCommentaryForViewPrefix.mockResolvedValue([approvedBox('b-kpis'), approvedBox('b-takeaways')])
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'), true), { ...up(parsed('brand'), false), uploadedAt: new Date('2026-11-20T00:00:00Z') }]))
    const { container } = await show({ role: 'CLIENT_VIEWER', email: 'someone@client.test' })
    expect(container.querySelector('input, textarea, select')).toBeNull()
    expect(screen.queryByText(/Upload/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Add post|Edit|Approve/ })).toBeNull()
    expect(screen.queryByText(/uploaded after the month opened/)).toBeNull()
    expect(boxes(container)).toEqual(['b-kpis', 'b-takeaways'])
    expect(h2s()).toEqual(['Data', 'Sentiment', 'Year to date', 'Media types', 'Themes', 'Top influencers', 'Key takeaways'])
  })

  test('a client without a brand upload sees only the not-ready text, and no pills', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('industry'))]))
    await show({ role: 'CLIENT_VIEWER', email: null })
    expect(screen.getByText(NOT_READY_TEXT)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('a client on the Industry pill in a month without a brand upload sees the not-ready text, not a blank tab (#476)', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('industry'))]))
    const { container } = await show({ role: 'CLIENT_VIEWER', email: null, topic: 'industry' })
    expect(screen.getByText(NOT_READY_TEXT)).toBeTruthy()
    expect(container.innerHTML).not.toBe('')
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('the industry half of an export prints nothing when there is no brand upload either', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('industry'))]))
    const { container } = await show({ exporting: true, topic: 'industry' })
    expect(container.innerHTML).toBe('')
  })

  test('a client without an industry upload gets no Industry pill', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'))]))
    await show({ role: 'CLIENT_VIEWER', email: null })
    expect(screen.queryByRole('button', { name: /Industry/ })).toBeNull()
  })

  test('a staff export prints the client view: no controls, no staff notes, a topic heading, no pills', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'), true), { ...up(parsed('brand'), false), uploadedAt: new Date('2026-11-20T00:00:00Z') }]))
    const { container } = await show({ exporting: true })
    expect(container.querySelector('input, textarea, select')).toBeNull()
    expect(screen.queryByText(/Upload/)).toBeNull()
    expect(screen.queryByText(/uploaded after the month opened/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Brand: Made Up Brand' })).toBeTruthy()
    expect(boxes(container)).toEqual([])
  })

  test('the industry half of an export prints nothing when industry has no upload', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'))]))
    const { container } = await show({ exporting: true, topic: 'industry' })
    expect(container.innerHTML).toBe('')
  })
})

describe('industry', () => {
  test('the industry sections in order, the sample line and points changes', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('industry')), up(parsed('industry', '2026-09'))]))
    const { container } = await show({ topic: 'industry' })
    expect(h2s()).toEqual(['Data', 'Sentiment', 'Themes', 'Key takeaways', 'Keyword appendix'])
    expect(screen.getByText('The industry topic is a 10% sample of the conversation, by design.')).toBeTruthy()
    expect(boxes(container)).toEqual(['i-kpis', 'i-daily', 'i-sent', 'i-ytd', 'i-sentday', 'i-cross', 'i-themes', 'i-conv', 'i-takeaways', 'i-keywords'])
    expect(screen.getAllByText(/pts|0 pts/).length).toBeGreaterThan(0)
  })
  test('an industry request for a client without an industry topic shows brand', async () => {
    h.getClientBySlug.mockResolvedValue(client({ enabled: true, brandTopic: 'Made Up Brand' }))
    await show({ topic: 'industry' })
    expect(h2s()[0]).toBe('Data')
    expect(screen.queryByRole('button', { name: /Industry/ })).toBeNull()
    expect(screen.getByText('Without brand-owned channels')).toBeTruthy()
  })
})

describe('the setting', () => {
  test('a malformed setting renders nothing and logs one warning naming the key', async () => {
    h.getClientBySlug.mockResolvedValue(client({ enabled: true, brandTopic: 'x', typo: 1 }))
    const { container } = await show()
    expect(container.innerHTML).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('slug=a-client: unknown key typo')
  })
  test('a client without the setting renders nothing and logs nothing', async () => {
    h.getClientBySlug.mockResolvedValue(client(null))
    const { container } = await show()
    expect(container.innerHTML).toBe('')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('Preview as client (the artifact\'s toggle)', () => {
  const twoUploads = () => monthData([up(parsed('brand'), true), { ...up(parsed('brand'), false), uploadedAt: new Date('2026-11-20T00:00:00Z') }])
  test('staff get the toggle; turned on, the page is the client view, with Back to editing', async () => {
    h.getSlMonth.mockResolvedValue(twoUploads())
    h.getCommentaryForViewPrefix.mockResolvedValue([approvedBox('b-kpis')])
    await show()
    expect(screen.getByRole('button', { name: 'Preview as client' })).toBeTruthy()
    document.body.innerHTML = ''
    const { container } = await show({ preview: true })
    expect(screen.getByRole('button', { name: 'Back to editing' }).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('input, textarea, select')).toBeNull()
    expect(screen.queryByText(/Upload/)).toBeNull()
    expect(screen.queryByText(/uploaded after the month opened/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Add post|Edit/ })).toBeNull()
    expect(boxes(container)).toEqual(['b-kpis'])
    // Each box is rendered as the client would see it.
    const { monthlyCommentary } = await import('@/components/report-sections/commentary/monthly')
    expect(vi.mocked(monthlyCommentary).mock.calls.at(-1)![0]).toMatchObject({ role: 'CLIENT_VIEWER', email: null })
  })
  test('a preview of a month with no brand upload shows the not-ready text and keeps Back to editing', async () => {
    h.getSlMonth.mockResolvedValue(monthData([]))
    await show({ preview: true })
    expect(screen.getByText(NOT_READY_TEXT)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to editing' })).toBeTruthy()
  })
  test('a client never gets the toggle, and the PDF ignores it', async () => {
    await show({ role: 'CLIENT_VIEWER', email: null, preview: true })
    expect(screen.queryByRole('button', { name: /Preview as client|Back to editing/ })).toBeNull()
    document.body.innerHTML = ''
    await show({ exporting: true, preview: true })
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the artifact\'s details', () => {
  test('authors table: the real count in the title, a vs column for last month and a sentiment bar per author', async () => {
    await show()
    expect(screen.getByText(/^Top \d authors$/)).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'vs Sep' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Sentiment' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /positive, .* neutral, .* negative/ }).length).toBeGreaterThan(0)
  })
  test('YTD titles start at the first month with data; the card is Positive + neutral combined', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand')), up(parsed('brand', '2026-05'))]))
    await show()
    expect(screen.getByText('Sentiment, May to October')).toBeTruthy()
    expect(screen.getByText('Positive + neutral combined')).toBeTruthy()
  })
  test('a year to date of one month is titled by that month alone', async () => {
    h.getSlMonth.mockResolvedValue(monthData([up(parsed('brand'))]))
    await show()
    expect(screen.getByText('Sentiment, October')).toBeTruthy()
  })
})
