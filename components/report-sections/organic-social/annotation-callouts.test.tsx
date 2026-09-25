import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
const lastCallouts = () => vi.mocked(LineChart).mock.lastCall?.[0].callouts

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
  expect(lastCallouts()).toBeUndefined()
})

test('a chart given an empty list of annotations looks the same as one given none', () => {
  render(<ChannelTrendChart title="Followers" series={SERIES} annotations={[]} />)
  expect(screen.queryByText('Annotations')).toBeNull()
  expect(annotationList()).toBeNull()
  expect(lastMarks()).toBeUndefined()
  expect(lastCallouts()).toBeUndefined()
})

// Phase 2b: the graph shows dots only, and each card opens from its dot, so the cards go to the chart.
test('a chart given annotations hands its cards to the chart, and the button hides and restores them', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  expect(lastCallouts()?.map((c) => c.x)).toEqual(['2026-08-10'])
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(lastCallouts()).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(lastCallouts()?.map((c) => c.x)).toEqual(['2026-08-10'])
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
  const drawn = vi.mocked(LineChart).mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  // The chart itself goes (the empty state replaces it), so no card and no dot can be drawn.
  expect(vi.mocked(LineChart).mock.calls.length).toBe(drawn)
  expect(screen.getByText('No data for this period.')).toBeTruthy()
  expect(annotationList()).toBeNull()
})

// Regression: an earlier commit on this branch accepted marks on EngagementTrend and
// never passed them to the chart, so the engagement graph silently showed nothing.
test('EngagementTrend passes its annotations through to the chart', () => {
  render(<EngagementTrend series={SERIES} annotations={[A()]} />)
  expect(lastCallouts()?.map((c) => c.label)).toEqual(['8/10 | 50 Engagements'])
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

// Phase 2b: the card opens from its dot inside the chart; render the card the chart is handed.
const lastCard = () => render(<>{lastCallouts()![0].content}</>).container

test('staff can hide an annotation: it fades, its dot goes, and one call is made', async () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A({ hidden: false })]} annotationControls={CONTROLS} />)
  fireEvent.click(within(lastCard()).getByRole('button', { name: 'Hide from client' }))
  const card = lastCard()
  expect(within(card).getByText('Hidden from client')).toBeTruthy()
  expect(within(card).getByRole('button', { name: 'Unhide' })).toBeTruthy()
  expect(lastCallouts()![0].muted).toBe(true)
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

test('a draft-only annotation dims less than a hidden one, so its draft stays easy to read', () => {
  const draft = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } }
  const { container } = render(<AnnotationCallouts items={[A({ noteOnly: true, noteEditor: draft })]} />)
  const cls = container.querySelector('li')!.className.split(' ')
  expect(cls).toContain('opacity-80')
  expect(cls).not.toContain('opacity-40')
})

test('a failed hide puts the annotation and its dot back, whether refused or errored', async () => {
  vi.mocked(setAnnotationHiddenAction).mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A({ hidden: false })]} annotationControls={CONTROLS} />)
  fireEvent.click(within(lastCard()).getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(lastCallouts()![0].muted).toBe(false))
  expect(lastMarks()).toEqual([{ x: '2026-08-10' }])
  vi.mocked(setAnnotationHiddenAction).mockRejectedValueOnce(new Error('network'))
  fireEvent.click(within(lastCard()).getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(lastCallouts()![0].muted).toBe(false))
  expect(lastMarks()).toEqual([{ x: '2026-08-10' }])
  expect(within(lastCard()).queryByText('Hidden from client')).toBeNull()
})

test('an annotation the team already hid gets no dot, so the team sees the chart the client sees', () => {
  const items = [A({ hidden: true }), A({ date: '2026-08-11', label: '8/11 | 38 Engagements', hidden: false })]
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={items} annotationControls={CONTROLS} />)
  expect(lastMarks()).toEqual([{ x: '2026-08-11' }])
})

// --- Nothing the team hid may reach an exported PDF (Paul, 2026-09-23) ----------------------
// Export PDF is window.print() of the page (components/export-pdf-button.tsx), and `.no-print`
// is the existing convention for anything that must not print (app/globals.css). A hidden
// callout is rendered for staff so they can unhide it, so without these classes a PDF exported
// from a client's view carries the very callouts the team hid from that client.

test('a hidden callout never prints, and a visible one still does', () => {
  const { container } = render(
    <AnnotationCallouts items={[A(), A({ date: '2026-08-22', hidden: true })]} controls={CONTROLS} />,
  )
  const rows = [...container.querySelectorAll('li')]
  expect(rows).toHaveLength(2)
  expect(rows[0].className).not.toContain('no-print')
  expect(rows[1].className).toContain('no-print')
})

test('the Hide control never prints, on any row: it is a control, not content', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} controls={CONTROLS} />)
  expect(container.querySelector('button')?.className).toContain('no-print')
})

test('an all-hidden list never prints, so the PDF gets no empty gap where it was', () => {
  const allHidden = render(
    <AnnotationCallouts items={[A({ hidden: true }), A({ date: '2026-08-22', hidden: true })]} controls={CONTROLS} />,
  )
  expect(allHidden.container.querySelector('ul')?.className).toContain('no-print')
  // The list keeps its own margin when its rows are hidden (Tailwind v4 gives a non-last child
  // margin-block-end), so hiding only the rows would leave a gap in the printed page.
  const mixed = render(<AnnotationCallouts items={[A(), A({ date: '2026-08-22', hidden: true })]} controls={CONTROLS} />)
  expect(mixed.container.querySelector('ul')?.className).not.toContain('no-print')
})

test('a client, who has no controls, sees no hidden rows at all: hides are applied on the server', () => {
  // Belt and braces beside the print rules: the client payload should never carry a hidden item,
  // so this pins that the print fix is a second line of defence, not the only one.
  const { container } = render(<AnnotationCallouts items={[A(), A({ date: '2026-08-22', value: 26 })]} />)
  expect(container.querySelectorAll('li')).toHaveLength(2)
  expect(container.querySelector('button')).toBeNull()
})
