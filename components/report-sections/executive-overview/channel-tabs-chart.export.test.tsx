import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { ChannelTabsChart, type ChannelVolumeRow, type ChannelConvRow } from './channel-tabs-chart'

const volumeData: ChannelVolumeRow[] = [
  { name: 'Organic Search', sessions: 750, pct: 75, convRate: 0.04, color: '#39A0FF' },
  { name: 'Direct', sessions: 250, pct: 25, convRate: 0.02, color: '#60FF80' },
]
const convData: ChannelConvRow[] = [{ name: 'Organic Search', sessions: 750, convRate: 0.04, color: '#39A0FF' }]
const sourceMediumMap = { 'Organic Search': [{ name: 'google / organic', sessions: 700 }] }
const inExport = () => render(<ExportModeProvider>
  <ChannelTabsChart volumeData={volumeData} convData={convData} compareMap={{ 'Organic Search': 500 }} sourceMediumMap={sourceMediumMap} />
</ExportModeProvider>).container

// Spec 2026-10-09 E3: By Volume, sorted by sessions, no breakdowns, no controls.
test('the export names its view as a label and prints no tabs, sort buttons, arrows or hint', () => {
  const container = inExport()
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(screen.getByText('By Volume', { selector: '[data-export-toggle-label]' })).toBeTruthy()
  expect(screen.queryByText('By Conversion')).toBeNull()
  expect(container.textContent).not.toMatch(/[↓↑]/)
  expect(container.querySelector('[data-export-hide]')?.textContent).toContain('?')
})

test('rows print their default layout only: no hover layer, no Prior period, no source/medium', () => {
  const container = inExport()
  expect(screen.queryByText('Prior period')).toBeNull()
  expect(screen.queryByText('google / organic')).toBeNull()
  expect(screen.getByText('75%')).toBeTruthy()
  // Outside the hidden hint (which keeps its own cursor class, display: none in the export).
  expect(container.querySelector(':not([data-export-hide] *)[class*="cursor"]')).toBeNull()
})

test('the chart is one dark-panel block and channel names wrap', () => {
  const container = inExport()
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart') && root.hasAttribute('data-export-wrap')).toBe(true)
})

test('the live chart keeps its tabs and sort buttons', () => {
  const { container } = render(<ChannelTabsChart volumeData={volumeData} convData={convData} />)
  expect(container.querySelectorAll('button').length).toBe(4)
})
