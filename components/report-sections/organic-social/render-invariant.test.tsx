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
    channel: 'INSTAGRAM', label: 'Instagram', exposureLabel: 'Views',
    followers: 12345, netNewFollowers: 210, exposure: 98765, engagements: 4321, engagementRate: 3.47,
    deltas: { followers: 5.2, engagementRate: -1.1 },
  },
  {
    channel: 'FACEBOOK', label: 'Facebook', exposureLabel: 'Views',
    followers: 8000, netNewFollowers: -15, exposure: 42000, engagements: 900, engagementRate: 1.23,
  },
]

test('Overview headlines render the actual metric values, not a skeleton', () => {
  const { container, getByText } = render(<PlatformHeadlines headlines={HEADLINES} />)
  getByText('12,345') // followers, locale-formatted
  getByText('98,765') // exposure (Views)
  getByText('3.5%')   // engagementRate 3.47 -> toFixed(1) + suffix
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
