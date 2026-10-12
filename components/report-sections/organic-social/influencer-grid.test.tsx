import { expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
import { InfluencerGrid } from './influencer-grid'
import { influencerCardMetrics } from './influencer-card'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const post = (id: number, engagements: number, impressions: number, rates: { effectiveness: number | null; engagementRate: number | null } = { effectiveness: null, engagementRate: 0.1 }): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-09-02', caption: `cap-${id}`, url: null, mediaType: 'IMAGE',
  mediaGroup: null, creative: null, sourceType: 'influencer', metrics: { ...rates, engagements, impressions },
})

test('cards sort by engagements first, then by views when chosen, in a wrapping grid, no pager', () => {
  const { container, getByRole, getAllByText } = render(
    <InfluencerGrid posts={[post(1, 5, 900), post(2, 9, 100), post(3, 7, 500)]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />,
  )
  const captions = () => getAllByText(/^cap-/).map((e) => e.textContent)
  expect(captions()).toEqual(['cap-2', 'cap-3', 'cap-1'])
  fireEvent.click(getByRole('button', { name: /Views/ }))
  expect(captions()).toEqual(['cap-1', 'cap-3', 'cap-2'])
  expect(container.querySelector('.grid')).not.toBeNull()
  expect(container.querySelector('.overflow-x-auto')).toBeNull()
  expect(container.querySelector('[aria-label="Next posts"]')).toBeNull()
})

test('the staff toggle appears only for editors', () => {
  const a = render(<InfluencerGrid posts={[post(1, 1, 1)]} clientSlug="c" canEdit sortKeys={['engagements', 'impressions']} />)
  expect(a.getByText(/Influencer · change/)).toBeTruthy()
  a.unmount()
  const b = render(<InfluencerGrid posts={[post(1, 1, 1)]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />)
  expect(b.queryByText(/· change/)).toBeNull()
})

test('no posts: one line, no toolbar', () => {
  const { getByText, queryByText } = render(<InfluencerGrid posts={[]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />)
  expect(getByText('No influencer posts for this period.')).toBeTruthy()
  expect(queryByText('Sort by')).toBeNull()
})

test('deck cards, two across on a wide screen: the post on the left, its numbers beside it', () => {
  const { container } = render(<InfluencerGrid posts={[post(1, 5, 900)]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />)
  expect(container.querySelector('.grid')!.className).toContain('xl:grid-cols-2')
  const card = container.querySelector('[data-influencer-card]')!
  expect(card.className).toContain('flex')
  expect(card.children[0].textContent).toContain('creative no longer available') // the media column comes first
  expect(card.children[1].textContent).toContain('cap-1')
})

test('a card hides the rows with nothing in them: no rate, and no views reported', () => {
  const rows = (p: TopContentPost) => influencerCardMetrics(p, 'engagements').map((m) => m.label)
  expect(rows(post(1, 31002, 0, { effectiveness: null, engagementRate: null }))).toEqual(['Engagements'])
  expect(rows(post(2, 40, 900, { effectiveness: 0.02, engagementRate: 0.05 }))).toEqual(['Effectiveness', 'Engagement Rate', 'Engagements', 'Views / Impr.'])
  expect(rows(post(3, 0, 0, { effectiveness: null, engagementRate: null }))).toEqual(['Engagements']) // engagements always shows, even 0
  const { container } = render(<InfluencerGrid posts={[post(1, 31002, 0, { effectiveness: null, engagementRate: null })]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />)
  const list = container.querySelector('[data-influencer-card] ul')!
  expect(list.textContent).toBe('Engagements31,002')
})

// #334 (task B7, Paul's review item 5): the grid's PDF form. No buttons; the sort it prints is stated; cards two
// across, each row one unbreakable block; the section's heading and totals (`lead`) ride in the first block so they
// never end a page alone; every card links to its post (http(s) only); no staff toggle.
const inPdf = (ui: React.ReactElement) => render(<ExportModeProvider>{ui}</ExportModeProvider>)

test('in the PDF: no buttons, the sort stated, rows of two cards as blocks, the lead in the first block', () => {
  const linked = (id: number, engagements: number) => ({ ...post(id, engagements, 0), url: `https://www.instagram.com/p/${id}` })
  const { container, queryAllByRole, getAllByText } = inPdf(
    <InfluencerGrid posts={[post(1, 5, 0), linked(2, 9), linked(3, 7)]} clientSlug="c" canEdit sortKeys={['engagements', 'impressions']}
      lead={<p>LEAD</p>} />,
  )
  expect(queryAllByRole('button')).toHaveLength(0)
  const blocks = [...container.querySelectorAll('[data-export-block]')]
  expect(blocks).toHaveLength(2)
  expect(blocks[0].textContent).toMatch(/^LEAD.*Sorted by Engagements ↓/)
  expect(getAllByText(/^cap-/).map((e) => e.textContent)).toEqual(['cap-2', 'cap-3', 'cap-1'])
  expect(blocks[0].querySelectorAll('a[data-export-link]')).toHaveLength(2)
  expect(blocks[1].querySelector('a')).toBeNull() // no safe URL: a plain card
  expect(container.querySelector('.grid')!.className).toContain('grid-cols-2')
  expect(container.textContent).not.toMatch(/· change/)
})

test('a PDF card keeps the empty rows hidden and prints the poster, never a video player', () => {
  const video = { ...post(1, 31002, 0, { effectiveness: null, engagementRate: null }), creative: { kind: 'video', src: 'https://x/v.mp4', poster: 'https://x/p.jpg' } } as TopContentPost
  const { container } = inPdf(<InfluencerGrid posts={[video]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} />)
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('img')!.getAttribute('src')).toBe('https://x/p.jpg')
  expect(container.querySelector('[data-export-block] ul')!.textContent).toBe('Engagements31,002')
})

test('in the PDF with no posts: one block holding the lead and the empty line', () => {
  const { container } = inPdf(<InfluencerGrid posts={[]} clientSlug="c" canEdit={false} sortKeys={['engagements', 'impressions']} lead={<p>LEAD</p>} />)
  const blocks = container.querySelectorAll('[data-export-block]')
  expect(blocks).toHaveLength(1)
  expect(blocks[0].textContent).toBe('LEADNo influencer posts for this period.')
})
