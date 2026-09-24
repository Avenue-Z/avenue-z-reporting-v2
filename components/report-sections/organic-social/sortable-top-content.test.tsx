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
