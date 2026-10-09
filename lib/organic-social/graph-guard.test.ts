import { expect, test, vi } from 'vitest'
import { assertSingleChannelGraph, getGraphData } from './graph-guard'

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

// Paul's review: the check must run on the request that is sent, not on a separate literal.
const request = (channels: string[]) => ({
  brandId: 1, channels, reportType: 'GRAPH' as const, timeScale: 'DAILY' as const,
  metrics: ['TOTAL_FOLLOWERS'], startDate: 'S', endDate: 'E',
})

test('getGraphData refuses a multi-channel GRAPH request before anything is sent', async () => {
  const getReportsData = vi.fn()
  const client = { getReportsData } as unknown as Parameters<typeof getGraphData>[0]
  await expect(getGraphData(client, request(['INSTAGRAM', 'FACEBOOK']))).rejects.toThrow(/ALL_CHANNELS/)
  expect(getReportsData).not.toHaveBeenCalled()
})

test('getGraphData sends exactly the request it checked and returns the response', async () => {
  const res = { data: {} }
  const getReportsData = vi.fn<(params: unknown) => Promise<typeof res>>(async () => res)
  const client = { getReportsData } as unknown as Parameters<typeof getGraphData>[0]
  const params = request(['INSTAGRAM'])
  await expect(getGraphData(client, params)).resolves.toBe(res)
  expect(getReportsData).toHaveBeenCalledTimes(1)
  expect(getReportsData.mock.calls[0][0]).toBe(params)
})
