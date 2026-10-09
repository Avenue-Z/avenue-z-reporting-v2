import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { DemandJourney, type DemandStage } from './demand-journey'

const live: DemandStage = {
  key: 'ga4', source: 'Web Analytics', label: 'Site Sessions', metric: '89,234', subMetric: '2.1% conv. rate', delta: 15.4,
  color: '#39A0FF', heroLabel: 'sessions in the last 30 days', stats: [{ label: 'Active Users', value: '62,108' }],
  spark: [{ date: '1', sessions: 1 }, { date: '2', sessions: 3 }],
}
const unconnected: DemandStage = { key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline', color: '#8A8A8A', connected: false,
  heroLabel: 'open pipeline as of today', stats: [{ label: 'Open Deals', value: '12' }] }
const inExport = (stages: DemandStage[]) => render(<ExportModeProvider><DemandJourney stages={stages} /></ExportModeProvider>).container

// Spec 2026-10-09 E2: paper has no hover, and these numbers appear nowhere else on the page.
test('the export prints every connected card expanded: both labels and the stats list, visibly', () => {
  const container = inExport([live])
  for (const text of ['2.1% conv. rate', 'sessions in the last 30 days', 'Active Users', '62,108']) {
    // Visible, not merely present: nothing on the way up is collapsed or transparent.
    for (let n: HTMLElement | null = screen.getByText(text); n && n !== container; n = n.parentElement) {
      const collapsed = (n.style.maxHeight !== '' && parseFloat(n.style.maxHeight) === 0) || n.style.opacity === '0'
      expect(collapsed).toBe(false)
    }
  }
})

test('a card that is not connected prints only its needs-connection copy, never stats', () => {
  inExport([unconnected])
  expect(screen.getByText('Not connected')).toBeTruthy()
  expect(screen.queryByText('Open Deals')).toBeNull()
  expect(screen.queryByText('open pipeline as of today')).toBeNull()
})

test('a one-row Journey is one dark-panel block, each card a block, with no hover styling', () => {
  const container = inExport([live, unconnected])
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block') && root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelectorAll('[data-export-block]')).toHaveLength(1 + 2)
  expect(container.querySelector('.cursor-default')).toBeNull()
})

// Final review, Important 2: four expanded cards (two rows at the 979 px export width) run ~730 px, more than page 1 has
// under the header, so a whole-Journey block would leave page 1 a header strip or split anyway. Two rows break between
// rows instead; each card stays whole.
test('a two-row Journey is not one block: it breaks between rows, each card whole', () => {
  const four = ['aeo', 'ga4', 'inbound', 'pipeline'].map((key) => ({ ...live, key }))
  const container = inExport(four)
  const root = container.firstElementChild as HTMLElement
  expect(root.hasAttribute('data-export-block')).toBe(false)
  expect(root.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelectorAll('[data-export-block]')).toHaveLength(4)
})

test('the live Journey still collapses until hovered', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('Active Users').closest('[style*="max-height: 0"]')).not.toBeNull()
})
