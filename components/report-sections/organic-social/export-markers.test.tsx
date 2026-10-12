import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { HeadlinesSkeleton, TopContentSkeleton, TrendSkeleton } from './skeletons'
import { PlatformHeadlines } from './platform-headlines'
import { findElements } from '@/lib/test-utils/element-tree'

// The PDF export waits until no loading placeholder is left (lib/export/readiness.ts) and keeps each
// marked block on one page (app/export/export-theme.css). These are the markers it relies on.

const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))

test.each([['headlines', HeadlinesSkeleton], ['trend', TrendSkeleton], ['top content', TopContentSkeleton]])(
  'the %s skeleton marks itself as pending', (_, Skeleton) => {
    const { container } = render(<Skeleton />)
    expect(container.querySelector('[data-export-pending]')).not.toBeNull()
  },
)

test('each platform\'s label and KPI row is one unbreakable block', () => {
  const kpi = { key: 'followers', label: 'Total Followers', value: 35, delta: 6.1, format: 'number' }
  const { container } = render(<PlatformHeadlines headlines={[
    { channel: 'INSTAGRAM', label: 'Instagram', kpis: [kpi] }, { channel: 'FACEBOOK', label: 'Facebook', kpis: [kpi] },
  ] as never} />)
  const blocks = container.querySelectorAll('section[data-export-block]')
  expect(blocks).toHaveLength(2)
  expect(blocks[0].querySelector('h3')?.textContent).toBe('Instagram')
})

test('the commentary header, still loading, leaves a pending marker rather than nothing', async () => {
  getClientBySlug.mockResolvedValue({ reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } } })
  const { SharedPartsHeader } = await import('@/components/report-sections/shared/shared-parts-header')
  const tree = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c' })
  const [suspense] = findElements(tree, (e) => e.props.fallback !== undefined)
  const fallback = suspense.props.fallback as { props: Record<string, unknown> }
  expect(fallback.props['data-export-pending']).toBe('')
  expect(fallback.props.hidden).toBe(true)
})
