import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { OutlineTiles } from './outline-tiles'
import { PlatformHeadlines } from './platform-headlines'

const kpi = (key: string, label: string) => ({ key, label, format: 'number' as const, value: 10, delta: 0.5 })

test('an outline tile shows its channel definition; a row with no text shows no badge', () => {
  const { getByText, queryAllByText } = render(
    <OutlineTiles channel="INSTAGRAM" kpis={[kpi('followers', 'Total Followers'), kpi('nothing', 'No Such Row')]} />,
  )
  expect(getByText('The total number of followers you have on this channel.')).toBeTruthy()
  expect(queryAllByText('?')).toHaveLength(1)
})

test("Kenect's Instagram Profile Clicks tile has a badge too (the appendix's Profile Clicks line)", () => {
  const { getByText } = render(<OutlineTiles channel="INSTAGRAM" kpis={[kpi('profileClicks', 'Profile Clicks')]} />)
  expect(getByText('The number of times your profile has been clicked from your posts.')).toBeTruthy()
})

test('the shared platform tiles show the definition for their channel', () => {
  const headline = { channel: 'TWITTER' as const, label: 'X', noData: false, kpis: [kpi('replies', 'Replies')] }
  const { getByText } = render(<PlatformHeadlines headlines={[headline]} />)
  expect(getByText('The number of replies your posts received.')).toBeTruthy()
})

test('a shared Instagram Engagement Rate tile (follower basis) draws no badge; its Facebook twin does', () => {
  const ig = { channel: 'INSTAGRAM' as const, label: 'Instagram', noData: false, kpis: [kpi('engagementRate', 'Engagement Rate')] }
  const fb = { channel: 'FACEBOOK' as const, label: 'Facebook', noData: false, kpis: [kpi('engagementRate', 'Engagement Rate')] }
  expect(render(<PlatformHeadlines headlines={[ig]} />).queryAllByText('?')).toHaveLength(0)
  expect(render(<PlatformHeadlines headlines={[fb]} />).queryAllByText('?')).toHaveLength(1)
})
