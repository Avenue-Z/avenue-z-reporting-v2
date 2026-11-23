'use client'

import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 400 }),
  }
})

import { ExportModeProvider } from '@/components/export/export-mode'
import SlopeChart, { SLOPE_SCOPE } from './slope-chart'

const INPUT = {
  aiReferralByPath: new Map<string, [number, number]>([['/a', [10, 30]]]),
  organicByPath: new Map<string, [number, number]>([['/b', [40, 12]]]),
  citationShareByUrlKey: new Map<string, { prior: number; current: number; url: string }>([['x', { prior: 1, current: 3, url: 'https://x.com/p' }]]),
}

test('the default view is labelled as all site pages, with the spec description', () => {
  render(<SlopeChart input={INPUT} compareActive />)
  expect(screen.getByText('All site pages')).toBeTruthy()
  expect(screen.getByText(SLOPE_SCOPE['ai-referral'].description)).toBeTruthy()
  expect(SLOPE_SCOPE['ai-referral'].description).toMatch(/^Every page on the site, not only content Avenue Z created or optimized/)
})

test('Organic keeps the site-pages label; Citation Share switches to all cited pages across the web', () => {
  render(<SlopeChart input={INPUT} compareActive />)
  fireEvent.click(screen.getByRole('button', { name: 'Organic Search Traffic' }))
  expect(screen.getByText('All site pages')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Citation Share' }))
  expect(screen.getByText('All cited pages across the web')).toBeTruthy()
  expect(screen.getByText(SLOPE_SCOPE['citation-share'].description)).toBeTruthy()
  expect(screen.queryByText('All site pages')).toBeNull()
})

test('the PDF export prints the chip and description for the printed metric', () => {
  render(<ExportModeProvider><SlopeChart input={INPUT} compareActive /></ExportModeProvider>)
  expect(screen.getByText('All site pages')).toBeTruthy()
  expect(screen.getByText(SLOPE_SCOPE['ai-referral'].description)).toBeTruthy()
})
