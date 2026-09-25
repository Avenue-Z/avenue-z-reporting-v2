import { Suspense, type ReactNode } from 'react'
import { expect, test, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ChannelTrendChart } from './trends'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'

/**
 * What this pins, and why it exists.
 *
 * `ChannelTrendChart` seeds two pieces of state from its props once, on mount: which channels are
 * switched on, and which days the team has hidden. It never re-seeds either. That is correct only
 * because both report pages wrap the whole section in a Suspense keyed on the tab and the month
 * (`app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`), so a
 * new tab or a new month is a new chart with a fresh seed. That coupling is invisible from this
 * file and nothing else pinned it, so these tests state it.
 *
 * Measured 2026-09-22 before these were written: through that page key, a tab switch and a month
 * change both carry the right hides and the right legend. Only a new answer arriving under the SAME
 * key is stale, which takes an in-place refresh someone else caused and clears on any navigation.
 * Hardening that means `useOptimistic` or an override held per day, never one hash over the whole
 * answer: that reverts a hide still in flight, which is what the third test here guards.
 *
 * Every number, day and slug below is invented.
 */

const setAnnotationHiddenAction = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction }))
// Phase 2b: each card opens from its dot inside the chart, which jsdom cannot draw. This stub lists
// every card the chart is handed, so the same hidden state is read, and the same Hide clicked, as the
// row allowed before.
vi.mock('@/components/charts/line-chart', () => ({
  LineChart: ({ callouts }: { callouts?: { x: string; content: ReactNode }[] }) =>
    <ul>{(callouts ?? []).map((c) => <li key={c.x}>{c.content}</li>)}</ul>,
}))

const instagram: TrendSeries = {
  channels: ['Instagram'],
  points: [{ date: '2026-08-12', Instagram: 9 }, { date: '2026-08-20', Instagram: 7 }],
}
const facebook: TrendSeries = {
  channels: ['Facebook'],
  points: [{ date: '2026-08-12', Facebook: 4 }, { date: '2026-08-20', Facebook: 6 }],
}
const annotation = (date: string, hidden: boolean): ChartAnnotation =>
  ({ date, value: 1, label: `L${date}`, hidden, thumb: null })
const controls = { clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'engagements' as const }

/** The shape the report pages render: the section under a Suspense keyed by tab and month. */
const page = (key: string, series: TrendSeries, annotations: ChartAnnotation[]) => (
  <Suspense key={key}>
    <ChannelTrendChart title="Chart" series={series} annotations={annotations} annotationControls={controls} />
  </Suspense>
)
const KEY_AUGUST_INSTAGRAM = 'organic-social:organic-instagram:custom:2026-08-01,2026-08-31::'
const KEY_AUGUST_FACEBOOK = 'organic-social:organic-facebook:custom:2026-08-01,2026-08-31::'
const KEY_SEPTEMBER_INSTAGRAM = 'organic-social:organic-instagram:custom:2026-09-01,2026-09-30::'

/** Each annotation row and whether it reads as hidden, in the order they are drawn. */
const rows = (c: HTMLElement) => Array.from(c.querySelectorAll('li')).map(
  (li) => `${li.textContent?.match(/L\d{4}-\d{2}-\d{2}/)?.[0]}=${li.innerHTML.includes('opacity-40') ? 'hidden' : 'shown'}`)

test("switching tab draws that tab's own hides and its own line, not the one before", () => {
  const { rerender, container } = render(
    page(KEY_AUGUST_INSTAGRAM, instagram, [annotation('2026-08-12', true), annotation('2026-08-20', false)]))
  expect(rows(container)).toEqual(['L2026-08-12=hidden', 'L2026-08-20=shown'])

  rerender(page(KEY_AUGUST_FACEBOOK, facebook, [annotation('2026-08-12', false), annotation('2026-08-20', true)]))
  expect(rows(container)).toEqual(['L2026-08-12=shown', 'L2026-08-20=hidden'])
  // The legend is seeded the same way, so the same key is what keeps the new channel switched on.
  expect(container.textContent).not.toContain('No data')
})

test("changing month draws that month's own hides", () => {
  const { rerender, container } = render(
    page(KEY_AUGUST_INSTAGRAM, instagram, [annotation('2026-08-12', true), annotation('2026-08-20', false)]))
  rerender(page(KEY_SEPTEMBER_INSTAGRAM, instagram, [annotation('2026-08-12', false), annotation('2026-08-20', true)]))
  expect(rows(container)).toEqual(['L2026-08-12=shown', 'L2026-08-20=hidden'])
})

test('a hide still in flight is not reverted by the answer to the one before it', async () => {
  const nothingHidden = [annotation('2026-08-12', false), annotation('2026-08-20', false)]
  const { rerender, container } = render(page(KEY_AUGUST_INSTAGRAM, instagram, nothingHidden))

  await act(async () => { screen.getAllByRole('button', { name: 'Hide from client' })[0].click() })
  await act(async () => { screen.getAllByRole('button', { name: 'Hide from client' })[0].click() })
  expect(rows(container)).toEqual(['L2026-08-12=hidden', 'L2026-08-20=hidden'])

  // The first hide's write lands and refreshes the route in place: same key, and an answer that
  // knows about that day only. The second hide is still in flight and must stay on screen.
  rerender(page(KEY_AUGUST_INSTAGRAM, instagram, [annotation('2026-08-12', true), annotation('2026-08-20', false)]))
  expect(rows(container)).toEqual(['L2026-08-12=hidden', 'L2026-08-20=hidden'])
  expect(setAnnotationHiddenAction).toHaveBeenCalledTimes(2)
})
