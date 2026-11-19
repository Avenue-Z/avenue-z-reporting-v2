import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { SlPost } from '@/lib/organic-social/social-listening/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
import { fireEvent } from '@testing-library/react'
vi.mock('@/app/actions/social-listening', () => ({
  addPostImageAction: vi.fn(), approvePostAction: vi.fn(), deletePostDraftAction: vi.fn(), removePostImageAction: vi.fn(),
  revokePostAction: vi.fn(), savePostAction: vi.fn(),
}))

import { PostsSection } from './posts'
import { changeText, pctText, pointsText, short } from '@/lib/organic-social/social-listening/format'
import { roundDelta } from '@/lib/delta-rounding'

// Made-up posts only.
const post = (over: Partial<SlPost> = {}): SlPost => ({
  id: 'p1', month: '2026-10', group: 'social', platform: 'X', author: 'someone', url: 'https://example.com/p', engagements: 12,
  sentiment: 'Positive', note: 'A made-up note', position: 0, status: 'approved', replacesId: null,
  imageIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'], ...over,
})
const NONE = { canEdit: false, canApprove: false }
const STAFF = { canEdit: true, canApprove: true }

describe('PostsSection', () => {
  test('note is stored and rendered as text: markup shows as typed and never runs', () => {
    const { container } = render(<PostsSection posts={[post({ note: '<script>alert(1)</script><b>bold</b>' })]} clientSlug="a" range="r" caps={NONE} />)
    expect(screen.getByText('<script>alert(1)</script><b>bold</b>')).toBeTruthy()
    expect(container.querySelector('script, b')).toBeNull()
  })
  test('a client gets no controls and no empty group; every image from the image route', () => {
    const { container } = render(<PostsSection posts={[post()]} clientSlug="a" range="r" caps={NONE} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Forum posts')).toBeNull()
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      '/api/social-listening/image/11111111-1111-4111-8111-111111111111', '/api/social-listening/image/22222222-2222-4222-8222-222222222222',
    ])
    expect(screen.getByRole('link', { name: 'View post ↗' }).getAttribute('rel')).toBe('noopener noreferrer')
  })
  test('the PDF prints each post\'s first image at print size, with no controls even for staff', () => {
    const { container } = render(<ExportModeProvider><PostsSection posts={[post()]} clientSlug="a" range="r" caps={STAFF} /></ExportModeProvider>)
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/api/social-listening/image/11111111-1111-4111-8111-111111111111?print=1'])
    expect(screen.queryByRole('button')).toBeNull()
  })
  test('staff see every group with Add post, and a draft carries its state and Approve for an approver', () => {
    render(<PostsSection posts={[post({ status: 'draft' })]} clientSlug="a" range="r" caps={STAFF} />)
    expect(screen.getAllByRole('button', { name: '+ Add post' })).toHaveLength(3)
    expect(screen.getByText('Draft, not shown to the client')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })
})

describe('format', () => {
  test('numbers as the tab shows them', () => {
    expect(pctText(61.7)).toBe('61.7%')
    expect(pctText(50)).toBe('50%')
    expect(pointsText(1.25)).toBe('+1.3 pts')
    expect(pointsText(-3)).toBe('-3 pts')
    expect(pointsText(0)).toBe('0 pts')
    expect(short(1234567)).toBe('1.2M')
    expect(changeText(-23.73, roundDelta)).toBe('-24%')
    expect(changeText(0.42, roundDelta)).toBe('+0.4%')
  })
})

describe('the artifact\'s post groups', () => {
  test('each group has its title with the count, its line, and slide arrows once it holds more than one post', () => {
    const scrollBy = vi.fn()
    Element.prototype.scrollBy = scrollBy as never
    render(<PostsSection posts={[post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c', group: 'web' })]} clientSlug="a" range="r" caps={NONE} />)
    expect(screen.getByText('Social posts')).toBeTruthy()
    expect(screen.getByText('(2)')).toBeTruthy()
    expect(screen.getByText('The most engaged posts, and a typical negative one')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next social posts' }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 332, behavior: 'smooth' })
    expect(screen.queryByRole('button', { name: 'Next web posts' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'View post ↗' }).length).toBe(3)
  })
  test('the post form picks the platform from the artifact\'s list, defaulting by group', () => {
    render(<PostsSection posts={[]} clientSlug="a" range="r" caps={STAFF} />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add post' })[1])
    const select = screen.getByRole('combobox', { name: 'Platform' }) as HTMLSelectElement
    expect(select.value).toBe('Reddit')
    expect([...select.options].map((o) => o.value)).toEqual(['Facebook', 'Instagram', 'LinkedIn', 'X', 'Reddit', 'YouTube', 'TikTok', 'Web article', 'Other'])
  })
})

describe('networkLabel', () => {
  test('Talkwalker source types read as the mockup names them', async () => {
    const { networkLabel } = await import('./brand')
    expect(networkLabel('SOCIALMEDIA_INSTAGRAM')).toBe('Instagram')
    expect(networkLabel('SOCIALMEDIA_LINKEDIN')).toBe('LinkedIn')
    expect(networkLabel('SOCIALMEDIA_YOUTUBE')).toBe('YouTube')
    expect(networkLabel('SOCIALMEDIA_TWITTER')).toBe('X')
    expect(networkLabel('X')).toBe('X')
    expect(networkLabel('SOME_NEW_TYPE')).toBe('Some new type')
  })
})
