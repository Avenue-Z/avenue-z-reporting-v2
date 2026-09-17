/**
 * Guard for the one assumption every GRAPH reader in this folder makes.
 *
 * `followers.ts` and `trends.ts` both read `data.metrics[METRIC].ALL_CHANNELS`. That key
 * only appears when Dash groups the response by TOTAL, and Dash only picks TOTAL when the
 * request carries a single channel and a single brand. Probed live 2026-09-17 against a
 * real brand:
 *
 *   1 channel, no aggregate_by     -> ALL_CHANNELS, 7 points        (what we rely on)
 *   1 channel, aggregate_by=TOTAL  -> ALL_CHANNELS, 7 points        (identical, so adding
 *                                     the parameter buys nothing today)
 *   2 channels, no aggregate_by    -> the `metrics` key is ABSENT
 *   2 channels, aggregate_by=TOTAL -> ALL_CHANNELS, but SUMMED across both channels
 *
 * Batching the per-channel calls into one request is an obvious future optimisation and it
 * would break both of those ways: silently empty without the parameter, silently summed
 * with it. Neither raises an error.
 *
 * It cannot be caught on the response either. An absent `metrics` key is ALSO what a brand
 * with no such account returns (probed: A Place For Mom on TIKTOK and PINTEREST), which is
 * a legitimate, expected state that the callers already handle by rendering no data. So the
 * two are indistinguishable once the response is back, and the check has to happen on the
 * way out.
 *
 * Deliberately NOT sending aggregate_by=TOTAL. It is a no-op today and it would convert the
 * future failure from a visibly empty chart into a plausible-looking wrong number, which is
 * the worse of the two. Dash's own docs recommend always setting it; that advice does not
 * fit a reader keyed on ALL_CHANNELS.
 */
export function assertSingleChannelGraph(reportType: string | undefined, channels: string[]): void {
  if (reportType !== 'GRAPH') return
  if (channels.length === 1) return
  throw new Error(
    `GRAPH requests must carry exactly one channel, got ${channels.length}` +
      (channels.length ? ` (${channels.join(',')})` : '') +
      '. Dash only returns the ALL_CHANNELS key these readers depend on when it groups by ' +
      'TOTAL, which it does for a single channel only. Batching channels returns either no ' +
      'metrics key or a figure summed across channels, and neither raises an error.',
  )
}
