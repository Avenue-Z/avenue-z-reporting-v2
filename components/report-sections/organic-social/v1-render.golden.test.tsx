import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

// Recharts draws nothing inside ResponsiveContainer in jsdom, because it measures 0 by 0.
// A fixed size makes these snapshots capture the real chart: lines, axes, legend, dots.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})

import { FollowerGraph } from './follower-graph'
import { EngagementTrend } from './trends'
import { LineChart } from '@/components/charts/line-chart'
import type { TrendSeries } from '@/lib/organic-social/types'

// THE RENAISSANCE GUARD FOR WHAT ITS CHARTS DRAW. Written before any annotation work,
// against the code Renaissance runs today: v1 of both Organic Social graphs, and the
// shared line chart its Paid Media section uses. Every later commit on this branch must
// leave these snapshots byte-identical. The numbers are made up.
const DAYS = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
const ONE: TrendSeries = {
  channels: ['Instagram'],
  points: DAYS.map((date, i) => ({ date, Instagram: 500 + i * 3 + (i % 5) * 7 })),
}
const MANY: TrendSeries = {
  channels: ['Instagram', 'Facebook', 'X', 'LinkedIn'],
  points: DAYS.map((date, i) => ({
    date, Instagram: 10 + ((i * 7) % 23), Facebook: 3 + ((i * 5) % 17), X: (i * 3) % 4, LinkedIn: 20 + (i % 9),
  })),
}
const EMPTY: TrendSeries = { channels: ['Instagram'], points: [] }
// Recharts and React number the ids they generate with counters shared across this file, so an
// id depends on how many charts rendered before it, and one failing test would shift every
// snapshot after it. Normalizing those numbers makes each snapshot stand alone: a change shows
// up only in the test it belongs to. Everything the chart draws is still captured exactly.
const norm = (h: string) => h.replace(/recharts\d+-/g, 'recharts#-').replace(/_r_[0-9a-z]+_/g, '_r_#_')
const html = (el: ReactElement) => norm(render(el).container.innerHTML)

test('v1 follower graph, one channel', () => {
  const out = html(<FollowerGraph series={ONE} />)
  expect(out).toContain('recharts-line') // the chart really drew, so the snapshot means something
  expect(out).toMatchSnapshot()
})

test('v1 follower graph, no data', () => {
  expect(html(<FollowerGraph series={EMPTY} />)).toMatchSnapshot()
})

test('v1 engagement graph, four channels (Overview)', () => {
  expect(html(<EngagementTrend series={MANY} />)).toMatchSnapshot()
})

test('v1 engagement graph, one channel (platform tab)', () => {
  expect(html(<EngagementTrend series={ONE} />)).toMatchSnapshot()
})

test('v1 engagement graph, one channel toggled off, then all of them', () => {
  const { container } = render(<EngagementTrend series={MANY} />)
  fireEvent.click(screen.getByRole('button', { name: 'Facebook' }))
  expect(norm(container.innerHTML)).toMatchSnapshot()
  for (const name of ['Instagram', 'X', 'LinkedIn']) fireEvent.click(screen.getByRole('button', { name }))
  expect(norm(container.innerHTML)).toMatchSnapshot()
})

test('v1 follower graph, its only channel toggled off and back on', () => {
  const { container } = render(<FollowerGraph series={ONE} />)
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(norm(container.innerHTML)).toMatchSnapshot()
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(norm(container.innerHTML)).toMatchSnapshot()
})

test('Paid Media shaped chart, no marks', () => {
  const yKeys = [{ key: 'Instagram', color: '#ffffff', label: 'Meta' }, { key: 'Facebook' }]
  expect(html(<LineChart data={MANY.points} xKey="date" yKeys={yKeys} valueFormat="currency-cents" />)).toMatchSnapshot()
})
