import { expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
import { InfluencerGrid } from './influencer-grid'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const post = (id: number, engagements: number, impressions: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-09-02', caption: `cap-${id}`, url: null, mediaType: 'IMAGE',
  mediaGroup: null, creative: null, sourceType: 'influencer', metrics: { effectiveness: null, engagementRate: 0.1, engagements, impressions },
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
