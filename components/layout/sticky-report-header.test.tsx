import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StickyReportHeader } from './sticky-report-header'

// Export PDF prints the page as it is: after a scroll the header has collapsed its title to
// max-h-0/opacity-0, which would print a PDF with no title. Print restores it and unsticks it.
test('in print the header shows its title even after a scroll collapsed it', () => {
  render(<StickyReportHeader title="Organic Social" subtitle="Renaissance" />)
  const titleBlock = screen.getByRole('heading', { name: 'Organic Social' }).parentElement!.parentElement!
  expect(titleBlock.className).toMatch(/\bprint:max-h-none\b/)
  expect(titleBlock.className).toMatch(/\bprint:opacity-100\b/)
})

test('in print the header is not sticky', () => {
  const { container } = render(<StickyReportHeader title="Organic Social" />)
  expect((container.firstElementChild as HTMLElement).className).toMatch(/\bprint:static\b/)
})
