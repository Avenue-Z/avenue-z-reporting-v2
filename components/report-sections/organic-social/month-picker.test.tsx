import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { MonthOption } from '@/lib/organic-social/reporting-months'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/portal/c/reports',
  useSearchParams: () => new URLSearchParams('section=organic-social&subsection=instagram&dateRange=x&compareRange=previous_year&models=a'),
}))
import { MonthPicker } from './month-picker'

const M = (key: string, label: string, tag: string | null, compareLabel: string, dateRange: string): MonthOption => ({
  key, label, tag, compareLabel, dateRange, compareRange: 'custom:x', live: tag === 'Live, team only', opensOn: `${key}-12`,
})
const MONTHS = [
  M('2026-10', 'October 2026, through Oct 19', 'Live, team only', 'vs Sep 1 to Sep 19', 'custom:2026-10-01,2026-10-19'),
  M('2026-09', 'September 2026', null, 'vs August 2026', 'custom:2026-09-01,2026-09-30'),
]
beforeEach(() => push.mockClear())

test('newest first with tags; the selected month and its comparison shown', () => {
  const { container } = render(<MonthPicker months={MONTHS} value="2026-09" emptyText={null} />)
  expect([...container.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['October 2026, through Oct 19 (Live, team only)', 'September 2026'])
  expect((container.querySelector('select') as HTMLSelectElement).value).toBe('2026-09')
  expect(container.textContent).toContain('vs August 2026')
})

test('choosing a month keeps the other params, sets dateRange and drops compareRange', () => {
  const { container } = render(<MonthPicker months={MONTHS} value="2026-09" emptyText={null} />)
  fireEvent.change(container.querySelector('select')!, { target: { value: '2026-10' } })
  expect(push).toHaveBeenCalledWith('/portal/c/reports?section=organic-social&subsection=instagram&dateRange=custom%3A2026-10-01%2C2026-10-19&models=a')
})

test('no months: a disabled control showing the text, and nothing pushes', () => {
  const { container } = render(<MonthPicker months={[]} value={null} emptyText="Your first report opens on Feb 12" />)
  expect(container.querySelector('select')).toBeNull()
  expect(container.textContent).toBe('Your first report opens on Feb 12')
  expect(push).not.toHaveBeenCalled()
})
