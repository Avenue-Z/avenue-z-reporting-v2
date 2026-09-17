import { expect, test } from 'vitest'
import { assertSingleChannelGraph } from './graph-guard'

// The GRAPH readers here (followers.ts, trends.ts) read
// data.metrics[METRIC].ALL_CHANNELS. That key exists only when Dash groups by TOTAL,
// which it does only for a single channel and a single brand. Probed live 2026-09-17:
//   1 channel            -> ALL_CHANNELS, 7 points
//   2 channels           -> the metrics key is ABSENT entirely
//   2 channels + TOTAL   -> ALL_CHANNELS, but SUMMED across both channels
// An absent metrics key is also exactly what a brand with no such account returns
// (probed: A Place For Mom on TIKTOK and PINTEREST), so response-side detection is
// impossible. The mistake can only be caught on the way out.
test('a single-channel GRAPH request is allowed', () => {
  expect(() => assertSingleChannelGraph('GRAPH', ['INSTAGRAM'])).not.toThrow()
})

test('a multi-channel GRAPH request throws, naming the channels and the reason', () => {
  expect(() => assertSingleChannelGraph('GRAPH', ['INSTAGRAM', 'FACEBOOK'])).toThrow(/ALL_CHANNELS/)
  expect(() => assertSingleChannelGraph('GRAPH', ['INSTAGRAM', 'FACEBOOK'])).toThrow(/INSTAGRAM,FACEBOOK/)
})

// Only GRAPH reads ALL_CHANNELS. TOTAL_METRIC and TOTAL_GROUPED_METRIC read per-channel
// keys and legitimately take several channels, so the guard must not touch them.
test('other report types are untouched, whatever the channel count', () => {
  expect(() => assertSingleChannelGraph('TOTAL_METRIC', ['INSTAGRAM', 'FACEBOOK'])).not.toThrow()
  expect(() => assertSingleChannelGraph('TOTAL_GROUPED_METRIC', ['INSTAGRAM', 'FACEBOOK'])).not.toThrow()
  expect(() => assertSingleChannelGraph('CONTENT', ['INSTAGRAM', 'FACEBOOK'])).not.toThrow()
  expect(() => assertSingleChannelGraph(undefined, ['INSTAGRAM', 'FACEBOOK'])).not.toThrow()
})

test('an empty channel list on GRAPH throws too, rather than silently returning nothing', () => {
  expect(() => assertSingleChannelGraph('GRAPH', [])).toThrow(/exactly one channel/)
})
