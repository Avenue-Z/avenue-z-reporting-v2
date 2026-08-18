import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChannelTabsChart, type ChannelVolumeRow, type ChannelConvRow } from './channel-tabs-chart'

const volumeData: ChannelVolumeRow[] = [
  { name: 'Organic Search', sessions: 750, pct: 75, convRate: 0.04, color: '#39A0FF' },
  { name: 'Direct', sessions: 250, pct: 25, convRate: 0.02, color: '#60FF80' },
]

const convData: ChannelConvRow[] = [
  { name: 'Organic Search', sessions: 750, convRate: 0.04, color: '#39A0FF' },
]

test('empty volume data renders the no-data state instead of tabs and column headers', () => {
  render(<ChannelTabsChart volumeData={[]} convData={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText('Traffic by Channel')).not.toBeInTheDocument()
})

test('non-empty volume data renders the chart, not the no-data state', () => {
  render(<ChannelTabsChart volumeData={volumeData} convData={convData} />)
  expect(screen.getByText('Traffic by Channel')).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

test('the volume tab renders each row\'s share of total, matching the tooltip\'s promise', () => {
  render(<ChannelTabsChart volumeData={volumeData} convData={convData} />)
  expect(screen.getByText('75%')).toBeInTheDocument()
  expect(screen.getByText('25%')).toBeInTheDocument()
})
