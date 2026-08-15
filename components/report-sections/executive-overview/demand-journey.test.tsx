import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemandJourney, type DemandStage } from './demand-journey'

const live: DemandStage = {
  key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
  metric: '89,234', subMetric: '2.1% conv. rate', delta: 15.4,
  color: '#4285F4',
  stats: [{ label: 'Active Users', value: '62,108' }],
}

const unconnected: DemandStage = {
  key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
  color: '#F5A623',
  connected: false,
}

test('a connected stage renders its metric', () => {
  render(<DemandJourney stages={[live]} />)
  expect(screen.getByText('89,234')).toBeInTheDocument()
})

test('an unconnected stage renders the needs-connection treatment instead of a metric', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText(/Not connected/i)).toBeInTheDocument()
})

test('an unconnected stage still shows its source label, so the row reads as a funnel', () => {
  render(<DemandJourney stages={[unconnected]} />)
  expect(screen.getByText('Pipeline')).toBeInTheDocument()
})

test('an unconnected stage renders no delta, so no false arrow appears', () => {
  const { container } = render(<DemandJourney stages={[unconnected]} />)
  expect(container.textContent ?? '').not.toMatch(/%/)
})

test('an unconnected stage with a stale delta still renders no arrow', () => {
  const { container } = render(<DemandJourney stages={[{ ...unconnected, delta: 5.2 }]} />)
  expect(container.textContent ?? '').not.toMatch(/%/)
})

test('all four stages render together in one row', () => {
  const stages = [live, { ...live, key: 'aeo', source: 'AEO' }, unconnected, { ...unconnected, key: 'inbound', source: 'Inbound Funnel' }]
  render(<DemandJourney stages={stages} />)
  expect(screen.getAllByText(/Not connected/i)).toHaveLength(2)
})
