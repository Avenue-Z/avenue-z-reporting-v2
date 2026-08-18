import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionsTrendChart, type TrendRow } from './sessions-trend-chart'

const row: TrendRow = { date: 'Aug 1', sessions: 100, users: 80, newUsers: 40 }

test('empty data renders the no-data state instead of chart chrome', () => {
  render(<SessionsTrendChart data={[]} />)
  expect(screen.getByText('No data for this period.')).toBeInTheDocument()
  expect(screen.queryByText('Sessions & Users Over Time')).not.toBeInTheDocument()
})

test('non-empty data renders the chart, not the no-data state', () => {
  render(<SessionsTrendChart data={[row]} />)
  expect(screen.getByText('Sessions & Users Over Time')).toBeInTheDocument()
  expect(screen.queryByText('No data for this period.')).not.toBeInTheDocument()
})
