import { expect, test } from 'vitest'
import { channelShareDenominator } from './channel-share'

// Paul CR (PR 210): share-of-channel was divided by the sum of the returned
// rows, which the channel query caps at `limit`. Any traffic outside the top N
// made every percentage share-of-top-N instead of share-of-total — so the same
// client and window read differently here than on the Overview page, which is
// the divergence this branch exists to close. Rule mirrors reshape.ts.

test('divides by the true period total, not the sum of the returned top-N rows', () => {
  const rows = [{ sessions: 400 }, { sessions: 300 }]
  expect(channelShareDenominator(rows, 1000)).toBe(1000)
})

test('falls back to the row sum when the totals query returned nothing usable', () => {
  const rows = [{ sessions: 400 }, { sessions: 300 }]
  expect(channelShareDenominator(rows, null)).toBe(700)
  expect(channelShareDenominator(rows, undefined)).toBe(700)
  expect(channelShareDenominator(rows, 0)).toBe(700)
})

test('treats a missing sessions value as zero rather than NaN', () => {
  expect(channelShareDenominator([{ sessions: 400 }, {}], null)).toBe(400)
})
