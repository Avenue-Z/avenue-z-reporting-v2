import { expect, test } from 'vitest'
import { CHART_COLORS } from '@/lib/constants'
import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'
import { colorFor } from './trends'

// Paul's review of PR 247: CHANNEL_COLOR is keyed by display label and typed
// Record<string, string>, so tsc cannot see a channel with no colour. colorFor then falls
// back to PALETTE[0], Instagram's colour, and a chart showing both draws identical lines.
test('every channel label draws in its own colour', () => {
  const labels = Object.values(CHANNEL_LABEL)
  expect(new Set(labels.map(colorFor)).size).toBe(labels.length)
})

test('TikTok draws in the app-wide TikTok colour', () => {
  expect(colorFor('TikTok')).toBe(CHART_COLORS.tiktok)
})
