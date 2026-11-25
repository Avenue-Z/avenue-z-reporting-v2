// The Line / Columns toggle (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit C, D3): every
// viewer gets it, it starts on the view the URL names (the line unless the chart is in slcols), a click switches the
// chart at once and writes the choice to the URL, and the PDF draws only the chosen view, with no buttons.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/c/reports',
  useSearchParams: () => new URLSearchParams(nav.search),
}))

import { ExportModeProvider } from '@/components/export/export-mode'
import { ChartToggle } from './chart-toggle'
import { forgetPendingUrl } from './pending-url'

const LINE = <div data-view="line" />
const COLS = <div data-view="columns" />
const shown = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-view]')).map((e) => e.getAttribute('data-view'))

beforeEach(() => { forgetPendingUrl(); nav.replace.mockReset(); nav.search = 'section=organic-social&subsection=organic-social-listening' })

describe('ChartToggle', () => {
  test('starts on the line, with Line pressed', () => {
    const { container } = render(<ChartToggle id="b-ytd" initial="line" line={LINE} columns={COLS} />)
    expect(shown(container)).toEqual(['line'])
    expect(screen.getByRole('button', { name: 'Line' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Columns' }).getAttribute('aria-pressed')).toBe('false')
  })

  test('starts on the columns when the URL named this chart', () => {
    const { container } = render(<ChartToggle id="b-ytd" initial="columns" line={LINE} columns={COLS} />)
    expect(shown(container)).toEqual(['columns'])
  })

  test('Columns switches the chart at once and adds the chart to slcols, keeping every other param', () => {
    nav.search = 'section=organic-social&subsection=organic-social-listening&slcols=i-sentday&sl=brand'
    const { container } = render(<ChartToggle id="b-ytd" initial="line" line={LINE} columns={COLS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }))
    expect(shown(container)).toEqual(['columns'])
    expect(nav.replace).toHaveBeenCalledWith(
      '/dashboard/c/reports?section=organic-social&subsection=organic-social-listening&slcols=b-ytd%2Ci-sentday&sl=brand', { scroll: false })
  })

  test('Line takes the chart out of slcols, and drops the param when it is the last one', () => {
    nav.search = 'section=organic-social&slcols=b-ytd'
    render(<ChartToggle id="b-ytd" initial="columns" line={LINE} columns={COLS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    expect(nav.replace).toHaveBeenCalledWith('/dashboard/c/reports?section=organic-social', { scroll: false })
  })

  test('pressing the view already shown does nothing', () => {
    render(<ChartToggle id="b-ytd" initial="line" line={LINE} columns={COLS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    expect(nav.replace).not.toHaveBeenCalled()
  })

  // Issue #529 (Paul's #518 review): the URL only changes once a navigation lands, so the mock keeps the same search here.
  test('two charts switched before the first navigation lands both reach slcols', () => {
    nav.search = 'section=organic-social&sl=brand'
    render(<><ChartToggle id="b-ytd" initial="line" line={LINE} columns={COLS} /><ChartToggle id="b-reddit" initial="line" line={LINE} columns={COLS} /></>)
    const [ytd, reddit] = screen.getAllByRole('button', { name: 'Columns' })
    fireEvent.click(ytd)
    fireEvent.click(reddit)
    expect(nav.replace).toHaveBeenLastCalledWith('/dashboard/c/reports?section=organic-social&sl=brand&slcols=b-ytd%2Cb-reddit', { scroll: false })
  })

  test('follows a new view from the server, so the screen never disagrees with the URL', () => {
    const { container, rerender } = render(<ChartToggle id="b-ytd" initial="columns" line={LINE} columns={COLS} />)
    expect(shown(container)).toEqual(['columns'])
    rerender(<ChartToggle id="b-ytd" initial="line" line={LINE} columns={COLS} />)
    expect(shown(container)).toEqual(['line'])
    expect(screen.getByRole('button', { name: 'Line' }).getAttribute('aria-pressed')).toBe('true')
  })

  test('in the PDF: only the chosen view, no buttons', () => {
    const { container } = render(
      <ExportModeProvider><ChartToggle id="b-ytd" initial="columns" line={LINE} columns={COLS} /></ExportModeProvider>,
    )
    expect(shown(container)).toEqual(['columns'])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
