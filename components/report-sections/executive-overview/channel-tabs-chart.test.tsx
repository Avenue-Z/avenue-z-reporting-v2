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

// Paul CR3 (207) finding: `compareMap[row.name] ?? 0` could not distinguish a
// channel absent from the compare period's response (outside its ranking)
// from a channel genuinely observed at zero prior sessions, so an absent
// channel rendered as "Prior period 0" with no delta, presenting a channel
// that actually grew as if it were brand new.

test('a channel present in current but absent from compare renders the no-prior treatment, not "Prior period 0"', () => {
  const rows: ChannelVolumeRow[] = [
    { name: 'Organic Search', sessions: 100, pct: 60, convRate: 0.04, color: '#39A0FF' },
    { name: 'Referral',       sessions: 40,  pct: 40, convRate: 0.01, color: '#60FF80' },
  ]
  // Organic Search is present in the compare response; Referral is not,
  // e.g. it fell outside the compare period's top-N ranking.
  render(<ChannelTabsChart volumeData={rows} convData={[]} compareMap={{ 'Organic Search': 80 }} />)

  const priorValues = screen.getAllByText('Prior period').map((label) => label.nextElementSibling?.textContent)
  expect(priorValues).toContain('80')
  expect(priorValues).toContain('—')
  expect(priorValues).not.toContain('0')
})

test('a channel with a real zero prior still reads 0, not the no-prior glyph', () => {
  const rows: ChannelVolumeRow[] = [
    { name: 'Organic Search', sessions: 100, pct: 100, convRate: 0.04, color: '#39A0FF' },
  ]
  render(<ChannelTabsChart volumeData={rows} convData={[]} compareMap={{ 'Organic Search': 0 }} />)
  const priorValue = screen.getByText('Prior period').nextElementSibling
  expect(priorValue?.textContent).toBe('0')
})

// Paul CR3 (207) finding: a REJECTED GA4 query flattened to an empty array
// just like a fulfilled-but-empty one, so an outage rendered "No data for
// this period." A false positive claim the period had zero traffic.

test('a failed query renders the "couldn\'t load" state, not No data', () => {
  render(<ChannelTabsChart volumeData={[]} convData={[]} failed />)
  expect(screen.getByText("Couldn't load this data.")).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})

test('an empty-but-not-failed query renders No data, not the "couldn\'t load" state', () => {
  render(<ChannelTabsChart volumeData={[]} convData={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText("Couldn't load this data.")).not.toBeInTheDocument()
})

test('non-empty data renders the chart regardless of the failed flag', () => {
  render(<ChannelTabsChart volumeData={volumeData} convData={convData} failed={false} />)
  expect(screen.getByText('Traffic by Channel')).toBeInTheDocument()
})
