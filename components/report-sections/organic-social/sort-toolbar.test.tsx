import { expect, test } from 'vitest'
import { fireEvent, render, renderHook, act } from '@testing-library/react'
import { SortToolbar, useSort } from './sort-toolbar'

// Paul, #334 review item 9: the gallery (SortableTopContent) and the Influencer grid drew the same toolbar from two
// copies. One hook and one toolbar now serve both, so the two tabs cannot drift apart.
test('the sort starts on Engagements when offered, else the first metric, descending', () => {
  expect(renderHook(() => useSort(['engagements', 'impressions'])).result.current).toMatchObject({ sortKey: 'engagements', dir: 'desc' })
  expect(renderHook(() => useSort(['impressions'])).result.current).toMatchObject({ sortKey: 'impressions', dir: 'desc' })
  expect(renderHook(() => useSort()).result.current.metrics.length).toBeGreaterThan(2) // no list: every metric, as before
})

test('clicking the active metric flips the direction; another metric switches to it, descending', () => {
  const { result } = renderHook(() => useSort(['engagements', 'impressions']))
  act(() => result.current.onMetric('engagements'))
  expect([result.current.sortKey, result.current.dir]).toEqual(['engagements', 'asc'])
  act(() => result.current.onMetric('impressions'))
  expect([result.current.sortKey, result.current.dir]).toEqual(['impressions', 'desc'])
})

test('the toolbar marks the active button with its direction and reports clicks', () => {
  const clicked: string[] = []
  const { getByRole, getAllByRole } = render(
    <SortToolbar metrics={[{ key: 'engagements', label: 'Engagements' }, { key: 'impressions', label: 'Views / Impr.' }] as never}
      sortKey="engagements" dir="desc" onMetric={(k) => clicked.push(k)} />,
  )
  expect(getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Engagements ↓', 'true'], ['Views / Impr.', 'false']])
  fireEvent.click(getByRole('button', { name: 'Views / Impr.' }))
  expect(clicked).toEqual(['impressions'])
})
