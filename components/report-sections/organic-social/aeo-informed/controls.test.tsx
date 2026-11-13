import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { push, params } = vi.hoisted(() => ({ push: vi.fn(), params: { value: 'section=organic-social&subsection=organic-aeo-informed&dateRange=last_30_days' } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/a-client/reports',
  useSearchParams: () => new URLSearchParams(params.value),
}))

import { ExportModeProvider } from '@/components/export/export-mode'
import { AeoRangeControl, AeoMinControl } from './controls'

beforeEach(() => push.mockReset())

describe('the range control (aeo=)', () => {
  it('shows MoM, YTD and All time (the outline\'s words) with the current one pressed, and choosing one sets aeo and keeps every other param', () => {
    render(<AeoRangeControl value="month" />)
    expect(screen.getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['MoM', 'true'], ['YTD', 'false'], ['All time', 'false']])
    fireEvent.click(screen.getByRole('button', { name: 'YTD' }))
    expect(push).toHaveBeenCalledWith('/dashboard/a-client/reports?section=organic-social&subsection=organic-aeo-informed&dateRange=last_30_days&aeo=ytd')
  })
  it('choosing MoM removes aeo, so the default URL stays clean', () => {
    params.value = 'section=organic-social&aeo=all'
    render(<AeoRangeControl value="all" />)
    fireEvent.click(screen.getByRole('button', { name: 'MoM' }))
    expect(push).toHaveBeenCalledWith('/dashboard/a-client/reports?section=organic-social')
  })
  it('in the PDF export it is the chosen range as text, not buttons', () => {
    render(<ExportModeProvider><AeoRangeControl value="ytd" /></ExportModeProvider>)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText('YTD')).toBeTruthy()
  })
})

describe('the min competitors control (aeomin=)', () => {
  it('offers 1 to 5, shows the current value, and choosing one sets aeomin; 2, the default, removes it', () => {
    params.value = 'section=organic-social'
    render(<AeoMinControl value={2} />)
    const select = screen.getByRole('combobox', { name: 'Min competitors' }) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '3', '4', '5'])
    expect(select.value).toBe('2')
    fireEvent.change(select, { target: { value: '3' } })
    expect(push).toHaveBeenLastCalledWith('/dashboard/a-client/reports?section=organic-social&aeomin=3')
    params.value = 'section=organic-social&aeomin=3'
    fireEvent.change(select, { target: { value: '2' } })
    expect(push).toHaveBeenLastCalledWith('/dashboard/a-client/reports?section=organic-social')
  })
  it('in the PDF export it is text', () => {
    render(<ExportModeProvider><AeoMinControl value={3} /></ExportModeProvider>)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Min competitors: 3')).toBeTruthy()
  })
})
