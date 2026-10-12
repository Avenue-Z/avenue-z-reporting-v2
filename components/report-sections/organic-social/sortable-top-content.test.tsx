import { expect, test, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Toggle import pulls a server action transitively; stub it (same pattern as the golden test).
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))

import { SortableTopContent, type PlatformGroup } from './sortable-top-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const mk = (id: number, engagements: number, impressions = id): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-07-01',
  caption: `cap-${id}`, url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions },
  sourceType: 'organic',
})
const group = (posts: TopContentPost[]): PlatformGroup[] => [{ platform: 'Instagram', posts }]
const view = (props: Partial<Parameters<typeof SortableTopContent>[0]>) =>
  render(
    <TooltipProvider>
      <SortableTopContent owned={[]} influencer={[]} clientSlug="c" canEdit={false} {...props} />
    </TooltipProvider>,
  )
const shownIn = (el: HTMLElement) => within(el).queryAllByText(/^cap-\d+$/).map((e) => e.textContent)

test('without ownedLimit the owned rows page at pageSize exactly as today', () => {
  view({ owned: group(Array.from({ length: 6 }, (_, i) => mk(i + 1, 6 - i))), pageSize: 5 })
  expect(shownIn(document.body)).toHaveLength(5)
  expect(screen.getByText(/1[\u2013-]5 of 6/)).toBeInTheDocument()
})

test('with ownedLimit the owned row shows the top N by the active sort and no pager; influencer rows still page', () => {
  // engagements desc: ids 1..7; views desc: ids 7..1 (impressions = id).
  const influencer = group(Array.from({ length: 18 }, (_, i) => mk(100 + i, 18 - i)))
  view({ owned: group(Array.from({ length: 7 }, (_, i) => mk(i + 1, 7 - i))), influencer, ownedLimit: 5 })
  const inf = screen.getByRole('region', { name: 'Influencer posts' })
  const ownedShown = () => shownIn(document.body).filter((c) => !shownIn(inf).includes(c))
  expect(ownedShown()).toEqual(['cap-1', 'cap-2', 'cap-3', 'cap-4', 'cap-5'])
  expect(screen.queryByText(/of 7/)).toBeNull()
  expect(within(inf).getByText(/1[\u2013-]15 of 18/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(ownedShown()).toEqual(['cap-7', 'cap-6', 'cap-5', 'cap-4', 'cap-3'])
})

const sortButtons = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed')).map((b) => b.textContent)

test('T1 without sortKeys the toolbar shows all four metrics, Engagements active', () => {
  view({ owned: group([mk(1, 2), mk(2, 1)]) })
  expect(sortButtons()).toEqual(['Effectiveness', 'Engagement Rate', 'Engagements ↓', 'Views / Impr.'])
})

test('T2 sortKeys limits the toolbar to those metrics, in toolbar order, and Views sorts and flips', () => {
  // The two sorts order these posts oppositely: engagements 9 vs 1, impressions 1 vs 9.
  view({ owned: group([mk(1, 9, 1), mk(2, 1, 9)]), sortKeys: ['impressions', 'engagements'] })
  expect(sortButtons()).toEqual(['Engagements ↓', 'Views / Impr.'])
  expect(shownIn(document.body)).toEqual(['cap-1', 'cap-2'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(sortButtons()).toEqual(['Engagements', 'Views / Impr. ↓'])
  expect(shownIn(document.body)).toEqual(['cap-2', 'cap-1'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(sortButtons()).toEqual(['Engagements', 'Views / Impr. ↑'])
  expect(shownIn(document.body)).toEqual(['cap-1', 'cap-2'])
})

test('T3 a list without Engagements starts on the first toolbar metric', () => {
  view({ owned: group([mk(1, 9, 1), mk(2, 1, 9)]), sortKeys: ['impressions'] })
  expect(sortButtons()).toEqual(['Views / Impr. ↓'])
  expect(shownIn(document.body)).toEqual(['cap-2', 'cap-1'])
})

test('T3b with two keys and no Engagements, the start follows toolbar order, not the order the caller lists', () => {
  // SORT_METRICS puts Engagement Rate before Views / Impr., so that is the first button and the starting sort.
  view({ owned: group([mk(1, 1)]), sortKeys: ['impressions', 'engagementRate'] })
  expect(sortButtons()).toEqual(['Engagement Rate ↓', 'Views / Impr.'])
})

test('T4 an empty list does not type-check, so a toolbar can never be empty (make check runs tsc on this file)', () => {
  // @ts-expect-error an empty list is not a list: on an outline tab it would silently bring back all four buttons.
  const empty: Parameters<typeof SortableTopContent>[0]['sortKeys'] = []
  expect(empty).toEqual([])
})

test('T5 influencer rows sort by the listed metrics too', () => {
  const influencer = group([mk(100, 1, 50), mk(101, 5, 10)])
  view({ owned: group([mk(1, 1)]), influencer, sortKeys: ['engagements', 'impressions'] })
  const inf = screen.getByRole('region', { name: 'Influencer posts' })
  // One toolbar drives both sections, so it offers only the listed metrics for Influencer Posts too.
  expect(sortButtons()).toEqual(['Engagements ↓', 'Views / Impr.'])
  expect(shownIn(inf)).toEqual(['cap-101', 'cap-100'])
  fireEvent.click(screen.getByRole('button', { name: /Views \/ Impr\./i }))
  expect(shownIn(inf)).toEqual(['cap-100', 'cap-101'])
})

test('T8 the cards keep all four metrics under a list', () => {
  view({ owned: group([mk(1, 2)]), sortKeys: ['engagements', 'impressions'] })
  for (const label of ['Effectiveness', 'Engagement Rate']) {
    expect(screen.getAllByText(label).some((el) => !el.closest('button'))).toBe(true)
  }
})

test('the influencer heading and region name follow influencerHeading; absent, they are exactly today\'s', () => {
  const influencer = group([mk(100, 1)])
  const first = view({ influencer })
  expect(screen.getByRole('region', { name: 'Influencer posts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Influencer Posts' })).toBeInTheDocument()
  first.unmount()
  view({ influencer, influencerHeading: 'Partnership Posts' })
  expect(screen.getByRole('region', { name: 'Partnership Posts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Partnership Posts' })).toBeInTheDocument()
  expect(screen.queryByText('Influencer Posts')).toBeNull()
})

test('with no influencer rows left (a hidden platform was the only one), there is no influencer region and no heading', () => {
  view({ influencer: [], influencerHeading: 'Partnership Posts' })
  expect(screen.queryByRole('region')).toBeNull()
  expect(screen.queryByText('Partnership Posts')).toBeNull()
})

// PR #306 review: an empty heading falls back to today's text for both the heading and the region name.
test('an empty influencerHeading renders today\'s heading and region name', () => {
  view({ influencer: group([mk(100, 1)]), influencerHeading: '' })
  expect(screen.getByRole('region', { name: 'Influencer posts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Influencer Posts' })).toBeInTheDocument()
})

// PR #306 review: posts hidden from clients sit behind a closed, staff-only control, so a designation can be undone.
test('hiddenInfluencer renders a closed control with its post count and the rows inside', () => {
  const { container } = view({ canEdit: true, hiddenInfluencer: [{ platform: 'Instagram', posts: [mk(1, 5), mk(2, 3)] }, { platform: 'Facebook', posts: [mk(3, 1)] }] })
  const details = container.querySelector('details')!
  expect(details).not.toBeNull()
  expect(details.open).toBe(false)
  expect(details.querySelector('summary')!.textContent).toBe('Show posts hidden from clients (3)')
  const region = within(details).getByRole('region', { name: 'Hidden from clients' })
  expect(shownIn(region).sort()).toEqual(['cap-1', 'cap-2', 'cap-3'])
})

test('without hiddenInfluencer, or with no hidden posts, there is no control and the markup is today\'s', () => {
  const a = view({ influencer: group([mk(100, 1)]) })
  expect(a.container.querySelector('details')).toBeNull()
  expect(a.container.textContent).not.toContain('hidden from clients')
  a.unmount()
  const b = view({ hiddenInfluencer: [] })
  expect(b.container.querySelector('details')).toBeNull()
})

// Export PDF prints the page: a scrolling card row would be sliced at the page edge, so in print the
// row wraps and each card takes a quarter of the row (less its share of the three 12px gaps), so four
// fit across whatever width the print layout gives the row (every card on the page prints).
test('in print a card row wraps instead of scrolling, with cards sized to fit four across', () => {
  view({ owned: group(Array.from({ length: 6 }, (_, i) => mk(i + 1, 6 - i))) })
  const card = screen.getByText('cap-1').closest('.rounded-xl') as HTMLElement
  const row = card.parentElement!
  expect(row.className).toMatch(/\bprint:flex-wrap\b/)
  expect(row.className).toMatch(/\bprint:overflow-visible\b/)
  expect(card.className).toContain('print:w-[calc(25%-9px)]')
})
