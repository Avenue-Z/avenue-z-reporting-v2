'use client'

import { expect, test } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ContentPerformanceRow } from '@/lib/peec/content-performance-rows'
import { ContentPerformanceTable } from './content-performance-table'

function row(over: Partial<ContentPerformanceRow>): ContentPerformanceRow {
  return {
    key: 'k', title: 'Title', url: 'https://x.com/p', slug: '/p', badge: null,
    publishDate: null, lastOptimizedDate: null,
    promptCoverage: null, promptCoverageDelta: null, citationShare: null, citationShareDelta: null,
    aiReferred: null, aiReferredDelta: null, organic: null, organicDelta: null,
    engagementRate: null, engagementRateDelta: null, scopes: ['az', 'all'],
    ...over,
  }
}

const ROWS: ContentPerformanceRow[] = [
  row({ key: 'a', title: 'Alpha guide', url: 'https://x.com/blog/alpha', slug: '/blog/alpha', badge: 'new-optimized', publishDate: '2026-01-05', scopes: ['az', 'all'] }),
  row({ key: 'b', title: 'Bravo page', url: 'https://x.com/bravo', slug: '/bravo', badge: null, scopes: ['all'] }),
]

function renderTable(rows = ROWS, props: { ga4Connected?: boolean; calendarConnected?: boolean } = {}) {
  return render(
    <TooltipProvider>
      <ContentPerformanceTable rows={rows} ga4Connected={props.ga4Connected ?? true} calendarConnected={props.calendarConnected ?? true} />
    </TooltipProvider>,
  )
}

test('defaults to Avenue Z content and shows only az-scoped rows', () => {
  renderTable()
  expect(screen.getByText('Alpha guide')).toBeTruthy()
  expect(screen.queryByText('Bravo page')).toBeNull()
})

test('All cited pages scope shows the remaining rows', () => {
  renderTable()
  fireEvent.click(screen.getByRole('button', { name: 'All cited pages' }))
  expect(screen.getByText('Alpha guide')).toBeTruthy()
  expect(screen.getByText('Bravo page')).toBeTruthy()
})

test('Page cell renders the title and a visible slug link opening the live URL in a new tab', () => {
  renderTable()
  const link = screen.getByRole('link', { name: '/blog/alpha' })
  expect(link.getAttribute('href')).toBe('https://x.com/blog/alpha')
  expect(link.getAttribute('target')).toBe('_blank')
})

test('badge text follows the spec', () => {
  renderTable()
  expect(screen.getByText('New · Optimized')).toBeTruthy()
})

test('headers are Published and Last optimized, never Last updated; AI-referred sessions is renamed', () => {
  const { container } = renderTable()
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent ?? '')
  expect(headers.some((h) => h.includes('Published'))).toBe(true)
  expect(headers.some((h) => h.includes('Last optimized'))).toBe(true)
  expect(headers.some((h) => h.includes('Last updated'))).toBe(false)
  expect(headers.some((h) => h.includes('AI-referred sessions'))).toBe(true)
})

test('null cells render --', () => {
  const { container } = renderTable()
  const cells = Array.from(container.querySelectorAll('tbody tr:first-child td')).map((td) => td.textContent ?? '')
  // Alpha: Last optimized, coverage, share, sessions, organic, engagement are all null
  expect(cells.filter((c) => c.trim() === '--').length).toBeGreaterThanOrEqual(6)
})

test('empty Avenue Z scope with calendar connected shows the V1 copy', () => {
  renderTable([row({ key: 'b', scopes: ['all'] })])
  expect(screen.getByText('No published content yet. A calendar row appears here once its Status is set to Published.')).toBeTruthy()
})

test('empty Avenue Z scope without a calendar asks to connect it', () => {
  renderTable([], { calendarConnected: false })
  expect(screen.getByText(/Connect content calendar/)).toBeTruthy()
})

test('the Published header tooltip states the V1 rule', () => {
  const { container } = renderTable()
  const th = Array.from(container.querySelectorAll('thead th')).find((t) => t.textContent?.includes('Published'))!
  fireEvent.focus(within(th as HTMLElement).getByText('?'))
  const tip = screen.getAllByText(/Status is exactly "Published"/)
  expect(tip.length).toBeGreaterThan(0)
})
