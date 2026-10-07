import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { OutlineTiles } from './outline-tiles'
import { PlatformHeadlines } from './platform-headlines'

const kpi = (key: string, label: string) => ({ key, label, format: 'number' as const, value: 10, delta: 0.5 })

test('an outline tile shows its channel definition; a row with no text shows no badge', () => {
  const { getByText, queryAllByText } = render(
    <OutlineTiles channel="INSTAGRAM" kpis={[kpi('followers', 'Total Followers'), kpi('profileClicks', 'Profile Clicks')]} />,
  )
  expect(getByText('The total number of followers you have on this channel.')).toBeTruthy()
  expect(queryAllByText('?')).toHaveLength(1)
})

test('the shared platform tiles show the definition for their channel', () => {
  const headline = { channel: 'TWITTER' as const, label: 'X', noData: false, kpis: [kpi('replies', 'Replies')] }
  const { getByText } = render(<PlatformHeadlines headlines={[headline]} />)
  expect(getByText('The number of replies your posts received.')).toBeTruthy()
})
