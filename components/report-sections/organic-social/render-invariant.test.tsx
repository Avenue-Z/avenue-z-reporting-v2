import { expect, test } from 'vitest'
import { render } from '@testing-library/react'

import { PlatformHeadlines } from './platform-headlines'
import { PALETTE, colorFor } from './trends'
import type { PlatformHeadline } from '@/lib/organic-social/types'

// Review finding #3: the parts goldens mock the data modules to empty, so they snapshot only
// the Suspense skeleton — nothing guards that a real number/color regression on Overview. These
// tests render the presentational leaves with real values and lock the "no numbers move" claim.

// --- #3: real metric values render (the skeleton goldens can't see these) ---
const HEADLINES: PlatformHeadline[] = [
  {
    channel: 'INSTAGRAM', label: 'Instagram',
    kpis: [
      { key: 'followers', label: 'Total Followers', value: 12345, format: 'number', delta: 5.2 },
      { key: 'netNewFollowers', label: 'Net New Followers', value: 210, format: 'number' },
      { key: 'exposure', label: 'Views', value: 98765, format: 'number' },
      { key: 'engagements', label: 'Engagements', value: 4321, format: 'number' },
      { key: 'engagementRate', label: 'Engagement Rate', value: 3.47, format: 'percent', delta: -1.1 },
    ],
  },
  {
    channel: 'FACEBOOK', label: 'Facebook',
    kpis: [
      { key: 'followers', label: 'Total Followers', value: 8000, format: 'number' },
      { key: 'netNewFollowers', label: 'Net New Followers', value: -15, format: 'number' },
      { key: 'exposure', label: 'Views', value: 42000, format: 'number' },
      { key: 'engagements', label: 'Engagements', value: 900, format: 'number' },
      { key: 'engagementRate', label: 'Engagement Rate', value: 1.23, format: 'percent' },
    ],
  },
]

test('Overview headlines render the actual metric values, not a skeleton', () => {
  const { container, getByText } = render(<PlatformHeadlines headlines={HEADLINES} />)
  getByText('12,345') // followers, locale-formatted
  getByText('98,765') // exposure (Views)
  getByText('3.5%')   // engagementRate 3.47 -> pct()
  getByText('Instagram')
  getByText('Facebook')
  expect(container).toMatchSnapshot()
})

// --- #4: the channel color contract, both the equivalent and the divergent case ---
// Overview shows all four channels in CHANNELS order, so the identity-pinned CHANNEL_COLOR is
// byte-identical to the pre-migration positional lookup `PALETTE[channels.indexOf(c)]`.
const ALL_FOUR = ['Instagram', 'Facebook', 'X', 'LinkedIn']

test('all-four case: identity colors equal the old positional lookup (no color moves on Overview)', () => {
  ALL_FOUR.forEach((c, i) => {
    expect(colorFor(c)).toBe(PALETTE[i])
  })
})

test('degraded path: a dropped channel keeps its color, diverging from the old positional lookup', () => {
  // Facebook yields null daily and is dropped by buildTrendSeries; legend becomes [Instagram, X, LinkedIn].
  const remaining = ['Instagram', 'X', 'LinkedIn']
  const oldPositional = (c: string) => PALETTE[remaining.indexOf(c) % PALETTE.length]

  // New: X stays pinned to its own slot; old positional would have shifted it into Facebook's.
  expect(colorFor('X')).toBe(PALETTE[2])
  expect(oldPositional('X')).toBe(PALETTE[1])
  expect(colorFor('X')).not.toBe(oldPositional('X'))

  // Instagram is index 0 either way — unaffected.
  expect(colorFor('Instagram')).toBe(PALETTE[0])
})
