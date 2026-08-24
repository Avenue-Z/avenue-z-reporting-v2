import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChannelTabsChart, type ChannelVolumeRow } from './channel-tabs-chart'

// The prior-period figures only mount for the hovered row.
function hoverRow(name: string) {
  const row = screen.getByText(name).closest('div.rounded-md')
  if (!row) throw new Error(`row container for "${name}" not found`)
  fireEvent.mouseEnter(row)
}

// Paul CR (PR 210): the compare channel query is capped at the same limit as
// the display, so a channel inside the current top N that ranked below it in
// the prior period is truncated out of the compare response entirely. `?? 0`
// then coalesced "absent from the response" with "observed at zero", printing
// a confident "Prior period 0" for a channel that in fact had traffic. The
// exec-overview twin distinguishes the two with `in`.

test('a channel absent from the compare response reads the no-prior glyph, not "Prior period 0"', () => {
  const rows: ChannelVolumeRow[] = [
    { name: 'Organic Search', sessions: 100, pct: 60, convRate: 0.04, color: '#39A0FF' },
    { name: 'Referral',       sessions: 40,  pct: 40, convRate: 0.01, color: '#60FF80' },
  ]
  render(<ChannelTabsChart volumeData={rows} convData={[]} compareMap={{ 'Organic Search': 80 }} />)

  hoverRow('Referral')
  expect(screen.getByText('Prior period').nextElementSibling?.textContent).toBe('—')
})

// Companion guard, green before and after: a real observed zero must keep
// reading 0, so the fix above cannot be implemented by blanking every zero.
test('a channel genuinely observed at zero prior sessions still reads 0', () => {
  const rows: ChannelVolumeRow[] = [
    { name: 'Organic Search', sessions: 100, pct: 100, convRate: 0.04, color: '#39A0FF' },
  ]
  render(<ChannelTabsChart volumeData={rows} convData={[]} compareMap={{ 'Organic Search': 0 }} />)

  hoverRow('Organic Search')
  expect(screen.getByText('Prior period').nextElementSibling?.textContent).toBe('0')
})
