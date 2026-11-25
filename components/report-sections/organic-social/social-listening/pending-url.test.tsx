// Issue #529 (Paul's #518 review): every Social Listening control that writes the URL (the Line / Columns toggles, the
// authors sort, the Brand / Industry pills and Preview as client) builds its next URL from the one before it, even when
// that one has not landed yet. Next only updates useSearchParams once a navigation commits, so building from it alone let
// a second quick click drop the first, and the PDF, which reads the URL, stopped matching the screen.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => {
  const calls: [string, 'replace' | 'push'][] = []
  return { calls, replace: vi.fn((h: string) => { calls.push([h, 'replace']) }), push: vi.fn((h: string) => { calls.push([h, 'push']) }), search: '' }
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: vi.fn() }),
  usePathname: () => '/r',
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock('@/app/actions/social-listening', () => ({ pickSlItemAction: vi.fn() }))

import { nextHref, forgetPendingUrl } from './pending-url'
import { ChartToggle } from './chart-toggle'
import { AuthorSortControl } from './authors-controls'
import { PreviewToggle, TopicPills } from './pills'

const BASE = 'section=organic-social'
const set = (name: string, value: string | null) => (p: URLSearchParams) => { if (value === null) p.delete(name); else p.set(name, value) }

beforeEach(() => { vi.clearAllMocks(); nav.calls.length = 0; nav.search = BASE; forgetPendingUrl() })

describe('nextHref', () => {
  test('with nothing pending, builds from the URL on screen', () => {
    expect(nextHref('/r', BASE, set('slsort', 'reach'))).toBe('/r?section=organic-social&slsort=reach')
  })

  test('a second change before the first lands builds on the first', () => {
    nextHref('/r', BASE, set('slsort', 'reach'))
    expect(nextHref('/r', BASE, set('sl', 'industry'))).toBe('/r?section=organic-social&slsort=reach&sl=industry')
  })

  test('the first landing alone keeps the second pending one', () => {
    const first = nextHref('/r', BASE, set('slsort', 'reach'))
    nextHref('/r', BASE, set('sl', 'industry'))
    expect(nextHref('/r', first.split('?')[1], set('slview', 'client'))).toBe('/r?section=organic-social&slsort=reach&sl=industry&slview=client')
  })

  test('once the newest one lands, nothing is pending', () => {
    const href = nextHref('/r', BASE, set('slsort', 'reach'))
    expect(nextHref('/r', href.split('?')[1], set('slsort', null))).toBe('/r?section=organic-social')
  })

  test('a navigation it did not make (another page, a date change, Back) drops what was pending', () => {
    nextHref('/r', BASE, set('slsort', 'reach'))
    expect(nextHref('/r', 'section=organic-social&dateRange=last_month', set('sl', 'industry'))).toBe('/r?section=organic-social&dateRange=last_month&sl=industry')
    nextHref('/r', BASE, set('slsort', 'reach'))
    expect(nextHref('/other', BASE, set('sl', 'industry'))).toBe('/other?section=organic-social&sl=industry')
  })

  test('removing the last param gives the bare path', () => {
    expect(nextHref('/r', 'slsort=reach', set('slsort', null))).toBe('/r')
  })
})

describe('the controls together', () => {
  test('a toggle, the sort, a second toggle and the Industry pill, all before anything lands, keep every choice', () => {
    render(<>
      <ChartToggle id="b-ytd" initial="line" line={<i>L</i>} columns={<i>C</i>} />
      <ChartToggle id="b-reddit" initial="line" line={<i>L</i>} columns={<i>C</i>} />
      <AuthorSortControl sort="posts" />
      <TopicPills topic="brand" industry brandLabel="Brand" industryLabel="Industry" />
    </>)
    const [ytd, reddit] = screen.getAllByRole('button', { name: 'Columns' })
    fireEvent.click(ytd)
    fireEvent.click(screen.getByRole('button', { name: 'Reach' }))
    fireEvent.click(reddit)
    fireEvent.click(screen.getByRole('button', { name: /Industry/ }))
    expect(nav.calls).toEqual([
      ['/r?section=organic-social&slcols=b-ytd', 'replace'],
      ['/r?section=organic-social&slcols=b-ytd&slsort=reach', 'replace'],
      ['/r?section=organic-social&slcols=b-ytd%2Cb-reddit&slsort=reach', 'replace'],
      ['/r?section=organic-social&slcols=b-ytd%2Cb-reddit&slsort=reach&sl=industry', 'push'],
    ])
  })

  test('Preview as client right after a toggle keeps the toggle', () => {
    render(<><ChartToggle id="b-ytd" initial="line" line={<i>L</i>} columns={<i>C</i>} /><PreviewToggle on={false} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview as client' }))
    expect(nav.push).toHaveBeenCalledWith('/r?section=organic-social&slcols=b-ytd&slview=client')
  })
})
