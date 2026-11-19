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
// The browser's canvas shrink is not in jsdom; the form's retry logic is what these tests are about.
vi.mock('./image-shrink', () => ({ shrinkScreenshot: vi.fn(async (f: File) => ({ bytes: new Blob([f.name]), print: new Blob([f.name]) })) }))

import { act, waitFor } from '@testing-library/react'
import { addPostImageAction, savePostAction } from '@/app/actions/social-listening'
import { shrinkScreenshot } from './image-shrink'
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
  test('the PDF loads screenshots eagerly; on the page they stay lazy (#475)', () => {
    const pdf = render(<ExportModeProvider><PostsSection posts={[post()]} clientSlug="a" range="r" caps={NONE} /></ExportModeProvider>)
    expect([...pdf.container.querySelectorAll('img')].map((i) => i.getAttribute('loading'))).toEqual([null])
    pdf.unmount()
    const page = render(<PostsSection posts={[post()]} clientSlug="a" range="r" caps={NONE} />)
    expect([...page.container.querySelectorAll('img')].map((i) => i.getAttribute('loading'))).toEqual(['lazy', 'lazy'])
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

describe('the post form after a screenshot fails (#473)', () => {
  const save = vi.mocked(savePostAction)
  const add = vi.mocked(addPostImageAction)
  const shrink = vi.mocked(shrinkScreenshot)
  const pick = (files: File[]) => fireEvent.change(screen.getByLabelText('Screenshots'), { target: { files } })
  const submit = async () => { await act(async () => { fireEvent.submit(screen.getByLabelText('Screenshots').closest('form')!) }) }
  const savedIds = () => save.mock.calls.map(([a]) => a.id)
  const uploaded = () => shrink.mock.calls.map(([f]) => f.name)
  const fail = (n: number) => { let i = 0; add.mockImplementation(async () => (++i === n ? { ok: false, error: 'The image is over 300 KB.' } : { ok: true, id: `img${i}` })) }

  test('a new post: the retry saves to the draft already made and sends only the screenshots not yet added', async () => {
    vi.clearAllMocks()
    save.mockResolvedValue({ ok: true, id: 'draft-1' })
    fail(2)
    render(<PostsSection posts={[]} clientSlug="a" range="r" caps={STAFF} />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add post' })[0])
    const files = [new File(['a'], 'one.png'), new File(['b'], 'two.png')]
    pick(files)
    await submit()
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(
      'Saved, but a screenshot was not added: The image is over 300 KB. Fix it and save again; the post is kept.'))
    expect(screen.getByRole('button', { name: 'Save post' })).toBeTruthy()

    add.mockResolvedValue({ ok: true, id: 'img-retry' })
    await submit()
    expect(savedIds()).toEqual([null, 'draft-1'])
    expect(uploaded()).toEqual(['one.png', 'two.png', 'two.png'])
    expect(add.mock.calls.every(([form]) => (form as FormData).get('postId') === 'draft-1')).toBe(true)
  })

  test('an approved post: the retry edits the draft the first save forked, never asks for a second edit', async () => {
    vi.clearAllMocks()
    save.mockResolvedValue({ ok: true, id: 'fork-1' })
    fail(1)
    render(<PostsSection posts={[post({ imageIds: [] })]} clientSlug="a" range="r" caps={STAFF} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    pick([new File(['a'], 'one.png')])
    await submit()
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Saved, but a screenshot was not added/))

    add.mockResolvedValue({ ok: true, id: 'img-retry' })
    await submit()
    expect(savedIds()).toEqual(['p1', 'fork-1'])
    expect(uploaded()).toEqual(['one.png', 'one.png'])
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
