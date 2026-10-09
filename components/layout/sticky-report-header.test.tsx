import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StickyReportHeader } from './sticky-report-header'

// Export PDF prints the page as it is: after a scroll the header has collapsed its title to
// max-h-0/opacity-0, which would print a PDF with no title. Print restores it.
test('in print the header shows its title even after a scroll collapsed it', () => {
  render(<StickyReportHeader title="Organic Social" subtitle="Renaissance" />)
  const titleBlock = screen.getByRole('heading', { name: 'Organic Social' }).parentElement!.parentElement!
  expect(titleBlock.className).toMatch(/\bprint:max-h-none\b/)
  expect(titleBlock.className).toMatch(/\bprint:opacity-100\b/)
})

// Do not unstick it in print: exporting a scrolled Executive Overview with a static header printed the
// summary card blank in real Chrome (bisected; sticky prints it). Keep the header as the screen has it.
test('in print the header stays sticky', () => {
  const { container } = render(<StickyReportHeader title="Organic Social" />)
  expect((container.firstElementChild as HTMLElement).className).not.toMatch(/\bprint:static\b/)
})

// The export stamp sits in the header's actions slot. In print the title keeps its full width and the
// row wraps, so a long title ("LinkedIn Advertising") pushes the stamp to its own line instead of
// being clipped by the title block's overflow-hidden.
test('in print a long title is never squeezed by the actions slot', () => {
  render(<StickyReportHeader title="LinkedIn Advertising" subtitle="Renaissance" />)
  const titleBlock = screen.getByRole('heading', { name: 'LinkedIn Advertising' }).parentElement!.parentElement!
  expect(titleBlock.className).toMatch(/\bprint:basis-auto\b/)
  expect(titleBlock.className).toMatch(/\bprint:shrink-0\b/)
  expect(titleBlock.parentElement!.className).toMatch(/\bprint:flex-wrap\b/)
})
