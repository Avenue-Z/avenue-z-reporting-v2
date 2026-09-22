import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is replaced by a stub that records its
// props: the dots are asserted on what the chart is handed.
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))

import { LineChart } from '@/components/charts/line-chart'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import { AnnotationCallouts } from './annotation-callouts'
import { ChannelTrendChart, EngagementTrend } from './trends'
import { FollowerGraph } from './follower-graph'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'
import type { TrendSeries } from '@/lib/organic-social/types'

// All numbers are made up.
const IMAGE: Creative = { kind: 'image', thumb: 'https://cdn.example.com/t.jpg', full: 'https://cdn.example.com/f.jpg' }
const thumb = (over: Partial<NonNullable<ChartAnnotation['thumb']>> = {}) =>
  ({ creative: IMAGE, mediaType: 'IMAGE' as const, url: 'https://example.com/p/1', ...over })
const A = (over: Partial<ChartAnnotation> = {}): ChartAnnotation =>
  ({ date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', thumb: thumb(), ...over })
const SERIES: TrendSeries = { channels: ['Instagram'], points: [{ date: '2026-08-10', Instagram: 50 }] }
// The chart's own legend could be a list too, so the annotations are found by name.
const annotationList = () => screen.queryByRole('list', { name: 'Annotations' })
const lastMarks = () => vi.mocked(LineChart).mock.lastCall?.[0].marks

test('each annotation shows its label', () => {
  render(<AnnotationCallouts items={[A(), A({ date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', thumb: null })]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
  expect(screen.getByText('8/22 | 26 Engagements')).toBeTruthy()
})

test('an annotation with a post shows its thumbnail and links to the post', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} />)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/t.jpg')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/p/1')
})

test('a video with a poster shows the poster frame, not a player', () => {
  const video = thumb({ mediaType: 'VIDEO', creative: { kind: 'video', src: 'https://cdn.example.com/v.mp4', poster: 'https://cdn.example.com/p.jpg' } })
  const { container } = render(<AnnotationCallouts items={[A({ thumb: video })]} />)
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/p.jpg')
})

test('an annotation with no post shows its label and no image', () => {
  const { container } = render(<AnnotationCallouts items={[A({ thumb: null })]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
})

test('a post whose creative is gone shows the same placeholder Top Content uses', () => {
  render(<AnnotationCallouts items={[A({ thumb: thumb({ creative: null }) })]} />)
  expect(screen.getByText('creative no longer available')).toBeTruthy()
})

// Dash keeps returning the URL after the CDN purges the file, so the load itself fails.
test('an image that fails to load swaps to the placeholder rather than a broken image', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} />)
  fireEvent.error(container.querySelector('img')!)
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('creative no longer available')).toBeTruthy()
})

// Top Content keeps a live video with no poster rather than calling it gone (creative.ts).
test('a video with no poster shows a muted video tile, not the placeholder', () => {
  const video = thumb({ mediaType: 'VIDEO', creative: { kind: 'video', src: 'https://cdn.example.com/v.mp4', poster: null } })
  const { container } = render(<AnnotationCallouts items={[A({ thumb: video })]} />)
  const tile = container.querySelector('video')
  expect(tile?.getAttribute('src')).toBe('https://cdn.example.com/v.mp4')
  expect(tile?.muted).toBe(true)
  expect(screen.queryByText('creative no longer available')).toBeNull()
})

test('a post with no link still shows its thumbnail, just not as a link', () => {
  const { container } = render(<AnnotationCallouts items={[A({ thumb: thumb({ url: null }) })]} />)
  expect(container.querySelector('img')).toBeTruthy()
  expect(container.querySelector('a')).toBeNull()
})

// The link comes from Dash. Anything but http(s), such as a javascript: URL, is not rendered as a link.
test('a link that is not http or https is not rendered as a link', () => {
  const { container } = render(<AnnotationCallouts items={[A({ thumb: thumb({ url: 'javascript:alert(1)' }) })]} />)
  expect(container.querySelector('img')).toBeTruthy()
  expect(container.querySelector('a')).toBeNull()
})

// No caption crosses the server to client boundary, so the annotation itself describes the picture.
test('the thumbnail is described by its annotation', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} />)
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('8/10 | 50 Engagements')
})

test('no annotations renders nothing at all', () => {
  const { container } = render(<AnnotationCallouts items={[]} />)
  expect(container.firstChild).toBeNull()
})

// THE RENAISSANCE GUARD FOR THE SHARED CHART. v1 passes no annotations, so there must be
// no Annotations button, no row and no dots: the chart is exactly what it was.
test('a chart given no annotations has no button, no row and no dots', () => {
  render(<ChannelTrendChart title="Followers" series={SERIES} />)
  expect(screen.queryByText('Annotations')).toBeNull()
  expect(annotationList()).toBeNull()
  expect(lastMarks()).toBeUndefined()
})

test('a chart given an empty list of annotations looks the same as one given none', () => {
  render(<ChannelTrendChart title="Followers" series={SERIES} annotations={[]} />)
  expect(screen.queryByText('Annotations')).toBeNull()
  expect(annotationList()).toBeNull()
  expect(lastMarks()).toBeUndefined()
})

test('a chart given annotations shows the row, and the button hides and restores it', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  expect(annotationList()).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(annotationList()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(annotationList()).toBeTruthy()
})

test('each annotated day gets a dot, and the button takes the dots away too', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  // The mark type carries the day only: LineChart never drew a label (Paul, #252 review).
  expect(lastMarks()).toEqual([{ x: '2026-08-10' }])
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(lastMarks()).toBeUndefined()
})

test('toggling off the only channel takes the annotations away with the chart', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(annotationList()).toBeNull()
})

// Regression: an earlier commit on this branch accepted marks on EngagementTrend and
// never passed them to the chart, so the engagement graph silently showed nothing.
test('EngagementTrend passes its annotations through to the chart', () => {
  render(<EngagementTrend series={SERIES} annotations={[A()]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
})

test('EngagementTrend keeps its "Engagement Over Time" title unless given another', () => {
  const { unmount } = render(<EngagementTrend series={SERIES} />)
  expect(screen.getByText('Engagement Over Time')).toBeTruthy()
  unmount()
  render(<EngagementTrend series={SERIES} title="Instagram Engagement Graph" />)
  expect(screen.getByText('Instagram Engagement Graph')).toBeTruthy()
})

test('FollowerGraph keeps its "Followers" title unless given another', () => {
  const { unmount } = render(<FollowerGraph series={SERIES} />)
  expect(screen.getByText('Followers')).toBeTruthy()
  unmount()
  render(<FollowerGraph series={SERIES} title="Instagram Follower Growth Graph" />)
  expect(screen.getByText('Instagram Follower Growth Graph')).toBeTruthy()
})

const CONTROLS = { clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'engagements' as const }

test('without controls there is no hide button', () => {
  render(<AnnotationCallouts items={[A()]} />)
  expect(screen.queryByRole('button', { name: 'Hide from client' })).toBeNull()
})

test('staff can hide an annotation: it fades, its dot goes, and one call is made', async () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A({ hidden: false })]} annotationControls={CONTROLS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  expect(screen.getByText('Hidden from client')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Unhide' })).toBeTruthy()
  // The team sees the chart the client sees: the dot goes with the annotation, at once.
  expect(lastMarks()).toEqual([])
  await waitFor(() => expect(setAnnotationHiddenAction).toHaveBeenCalledWith({ ...CONTROLS, day: '2026-08-10', hidden: true }))
})

test('a hidden annotation shows faded, marked, with Unhide', () => {
  const { container } = render(<AnnotationCallouts items={[A({ hidden: true })]} controls={CONTROLS} />)
  expect(container.querySelector('li')?.className).toContain('opacity-40')
  expect(screen.getByText('Hidden from client')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Unhide' })).toBeTruthy()
})

test('a failed hide puts the annotation and its dot back, whether refused or errored', async () => {
  vi.mocked(setAnnotationHiddenAction).mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A({ hidden: false })]} annotationControls={CONTROLS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hide from client' })).toBeTruthy())
  expect(lastMarks()).toEqual([{ x: '2026-08-10' }])
  vi.mocked(setAnnotationHiddenAction).mockRejectedValueOnce(new Error('network'))
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hide from client' })).toBeTruthy())
  expect(screen.queryByText('Hidden from client')).toBeNull()
})

test('an annotation the team already hid gets no dot, so the team sees the chart the client sees', () => {
  const items = [A({ hidden: true }), A({ date: '2026-08-11', label: '8/11 | 38 Engagements', hidden: false })]
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={items} annotationControls={CONTROLS} />)
  expect(lastMarks()).toEqual([{ x: '2026-08-11' }])
})
