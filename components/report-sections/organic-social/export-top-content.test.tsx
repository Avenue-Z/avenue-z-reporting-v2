import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'

vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))

import { SortableTopContent, type PlatformGroup } from './sortable-top-content'
import { PostCard } from './post-card'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const mk = (id: number, engagements: number, extra: Partial<TopContentPost> = {}): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-09-01',
  caption: `cap-${id}`, url: `https://www.instagram.com/p/${id}/`, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: id }, sourceType: 'organic', ...extra,
})
const groups = (n: number, platform = 'Instagram'): PlatformGroup[] => [{ platform, posts: Array.from({ length: n }, (_, i) => mk(i + 1, 100 - i)) }]
const exportTop = (props: Partial<Parameters<typeof SortableTopContent>[0]>) => render(
  <TooltipProvider><ExportModeProvider>
    <SortableTopContent owned={groups(12)} influencer={[]} clientSlug="c" canEdit heading="Top Content" {...props} />
  </ExportModeProvider></TooltipProvider>,
)
const captionsIn = (el: Element) => [...el.querySelectorAll('p')].map((p) => p.textContent).filter((t) => /^cap-/.test(t ?? ''))

test('cards print in rows of five, each row an unbreakable block, first page in the default sort', () => {
  const { container } = exportTop({ owned: groups(17) })
  const blocks = [...container.querySelectorAll('[data-export-block]')]
  expect(blocks.map(captionsIn)).toEqual([
    ['cap-1', 'cap-2', 'cap-3', 'cap-4', 'cap-5'],
    ['cap-6', 'cap-7', 'cap-8', 'cap-9', 'cap-10'],
    ['cap-11', 'cap-12', 'cap-13', 'cap-14', 'cap-15'],
  ])
  expect(blocks[0].querySelector('.grid-cols-5')).not.toBeNull()
})

test("the section title, sort line and first platform's label share the first row's block", () => {
  const { container } = exportTop({})
  const first = container.querySelector('[data-export-block]') as HTMLElement
  expect(within(first).getByRole('heading', { name: 'Top Content' })).toBeTruthy()
  expect(within(first).getByText('Sorted by Engagements ↓')).toBeTruthy()
  expect(within(first).getByRole('heading', { name: 'Instagram' })).toBeTruthy()
})

test("each later platform's label is glued to its own first row", () => {
  const { container } = exportTop({ owned: [...groups(3), ...groups(2, 'Facebook')] })
  const blocks = [...container.querySelectorAll('[data-export-block]')] as HTMLElement[]
  expect(blocks).toHaveLength(2)
  expect(within(blocks[1]).getByRole('heading', { name: 'Facebook' })).toBeTruthy()
})

test('no sort buttons, pager or staff-only hidden posts in the export', () => {
  exportTop({ owned: groups(17), hiddenInfluencer: groups(2) })
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.queryByText(/Show posts hidden from clients/)).toBeNull()
})

test('the influencer section keeps its title with its first row', () => {
  const { container } = exportTop({ influencer: groups(2, 'Facebook'), influencerHeading: 'Partnership Posts' })
  const blocks = [...container.querySelectorAll('[data-export-block]')] as HTMLElement[]
  expect(within(blocks.at(-1)!).getByRole('heading', { name: 'Partnership Posts' })).toBeTruthy()
})

test('in the export the whole card links to the post, reads as a link, and has no staff toggle', () => {
  render(<TooltipProvider><ExportModeProvider><PostCard post={mk(7, 10)} clientSlug="c" canEdit /></ExportModeProvider></TooltipProvider>)
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('https://www.instagram.com/p/7/')
  expect(within(link).getByText('cap-7')).toBeTruthy()
  expect(within(link).getByText('View post ↗')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})

test('a post whose URL is not http(s) is not a link', () => {
  render(<TooltipProvider><ExportModeProvider><PostCard post={mk(8, 10, { url: 'javascript:alert(1)' })} clientSlug="c" canEdit={false} /></ExportModeProvider></TooltipProvider>)
  expect(screen.queryByRole('link')).toBeNull()
})

test("a video prints its poster frame, not a player", () => {
  const post = mk(9, 10, { mediaType: 'VIDEO', creative: { kind: 'video', src: 'https://cdn.example/v.mp4', poster: 'https://cdn.example/p.jpg' } as never })
  const { container } = render(<TooltipProvider><ExportModeProvider><PostCard post={post} clientSlug="c" canEdit={false} /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/p.jpg')
})

// Two card rows must fit one landscape page (739px): measured at 979px, square images made a row 387px,
// so every row took a page of its own. A 4:3 crop brings a row to ~341px.
test('export cards crop their image to 4:3 so two rows fit a page', () => {
  const post = mk(10, 10, { creative: { kind: 'image', thumb: 'https://cdn.example/t.jpg', full: 'https://cdn.example/f.jpg' } as never })
  const { container } = render(<TooltipProvider><ExportModeProvider><PostCard post={post} clientSlug="c" canEdit={false} /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('img')?.className).toContain('aspect-[4/3]')
})
