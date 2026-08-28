import type { PipelineData } from '@/lib/salesforce/types'
import { KpiCard } from './kpi-card'
import { fmtNum, fmtUsd } from './reshape'

const NULL_GLYPH = '—'

/**
 * Order matters: the block renders tiles, then the owner list, then the caveat
 * region. The region is LAST because one of its lines describes the owner list
 * as well as the tiles (unrecognizedClosedFlags counts owner-query rows too,
 * pipeline.ts:295), and a caveat printed above the list would visually
 * disclaim only the numbers.
 */
export function PipelinePerformance({ data }: { data: PipelineData }) {
  const {
    openDeals, totalPipeline, closedWon, weightedPipeline,
    byOwner, ownersTruncated, stageTruncated, unrecognizedClosedFlags,
    wonStageUnmatched, openUnavailable, wonUnavailable,
    campaignScoped, campaignUnmatched,
  } = data

  // KpiCard tests `delta !== undefined` BEFORE `comparisonExpected`
  // (kpi-card.tsx:61-77), so a tile can render the null glyph as its value with
  // a confident percentage underneath it. Closed Won's delta is exactly -100
  // whenever the current fetch degraded to 0 against a healthy prior year
  // (pipeline.ts:194 + :105-111), so this is a live wire, not a hypothetical.
  //
  // Two separate reasons to withhold it, per the design doc section 3.4:
  //   - the VALUE is gone      (wonUnavailable, wonStageUnmatched)
  //   - the BASELINE is corrupt (stageTruncated, unrecognizedClosedFlags: both
  //     also fire on the prior-year won query, so the ratio is unsafe even
  //     though each total is merely low)
  // Do not "restore" this by reading closedWon.delta directly.
  const wonValueGone   = wonUnavailable || wonStageUnmatched
  const baselineDirty  = stageTruncated || unrecognizedClosedFlags > 0
  const wonDelta       = wonValueGone || baselineDirty ? undefined : closedWon.delta
  // The greyed null-glyph placeholder KpiCard renders under comparisonExpected
  // is honest wherever a comparison was genuinely expected and merely cannot
  // arrive. It comes off only when the tile could not be loaded at all: an
  // unloadable tile promises nothing.
  const wonComparisonExpected = !wonUnavailable

  // wonUnavailable wins over wonStageUnmatched: "could not load" is the more
  // fundamental statement, and only one subValue slot exists per tile.
  const wonCaveat =
    wonUnavailable   ? "Couldn't load closed-won data."
    : wonStageUnmatched ? 'No deals matched the won stage; it may have been renamed.'
    : 'Year to date'

  const openCaveat = openUnavailable ? "Couldn't load open pipeline." : 'Open as of today'
  const openValue = (k: { value: number }, fmt: (n: number) => string) =>
    openUnavailable ? NULL_GLYPH : fmt(k.value)

  const caveats: string[] = []
  if (campaignUnmatched) {
    // Leads the caveat list: it explains all four tiles at once, and it is the
    // only one that means the figures describe nothing rather than describing
    // something imperfectly. A bare $0 here reads as "the agency sourced
    // nothing", when the likelier cause is a campaign renamed in the CRM.
    caveats.push(
      'No deals matched the agency-sourced campaigns, so these totals are 0. ' +
      'The campaigns may have been renamed.',
    )
  }
  if (stageTruncated) {
    caveats.push('Deal totals hit the row limit and may be undercounted.')
  }
  if (unrecognizedClosedFlags > 0) {
    // Rows, never "N deals": the open and won query windows overlap, so one bad
    // deal can contribute more than once (types.ts, unrecognizedClosedFlags).
    // Names the owner breakdown too, because the count spans the owner query
    // and transformByOwner drops unreadable rows (pipeline.ts:295, :208).
    caveats.push(
      `${unrecognizedClosedFlags.toLocaleString()} rows had an unreadable open/closed status, ` +
      'so these totals and the owner breakdown are shifted by an unknown amount.',
    )
  }

  const ownerMax = byOwner?.length ? Math.max(...byOwner.map((o) => o.count)) : 0

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-muted">
        Open pipeline is as of today. Closed won is year to date.
        {/* Whole-org and scoped figures differ by orders of magnitude and carry
            identical tile titles, so the reader has nothing but this line to
            tell them apart. It sits with the window labels because it is the
            same kind of statement: what these numbers cover. */}
        {campaignScoped && ' Scoped to agency-sourced campaigns.'}
      </p>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard title="Open Deals"        value={openValue(openDeals, fmtNum)}        subValue={openCaveat} />
        <KpiCard title="Total Pipeline"    value={openValue(totalPipeline, fmtUsd)}    subValue={openCaveat} />
        <KpiCard
          title="Closed Won"
          value={wonValueGone ? NULL_GLYPH : fmtUsd(closedWon.value)}
          delta={wonDelta}
          deltaLabel="vs same period last year"
          comparisonExpected={wonComparisonExpected}
          subValue={wonCaveat}
        />
        <KpiCard title="Weighted Pipeline" value={openValue(weightedPipeline, fmtUsd)} subValue={openCaveat} />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Open Deals by Owner
        </h3>
        {byOwner === null ? (
          // null is a FAILED fetch. Collapsing it into the [] rendering would
          // misreport an outage as "this client has no owners", which is the
          // exact confusion the null/empty distinction exists to prevent.
          <p className="text-sm text-text-muted">Owner breakdown unavailable.</p>
        ) : byOwner.length === 0 ? (
          <p className="text-sm text-text-muted">No open deals by owner.</p>
        ) : (
          <div className="space-y-2">
            {byOwner.map((o) => (
              <div key={o.owner} data-testid="owner-row" className="flex items-center gap-3 text-sm">
                <span className="w-40 flex-shrink-0 truncate text-text-muted">{o.owner}</span>
                <span className="h-2 flex-1 rounded bg-white/[0.06]">
                  <span
                    className="block h-2 rounded bg-brand-green"
                    // ownerMax === 0 is every owner at a zero count. Short-circuit
                    // rather than dividing, which would emit width: NaN%.
                    style={{ width: ownerMax === 0 ? '0%' : `${(o.count / ownerMax) * 100}%` }}
                  />
                </span>
                <span className="w-12 flex-shrink-0 text-right font-bold text-white">{fmtNum(o.count)}</span>
              </div>
            ))}
          </div>
        )}
        {ownersTruncated && (
          // Stays with the list rather than joining the caveat region below: it
          // is a statement about this list's completeness, not about any number.
          <p className="text-xs text-text-muted">Owner list may be incomplete.</p>
        )}
      </div>

      {caveats.length > 0 && (
        <div data-testid="caveat" className="space-y-1">
          {caveats.map((c) => (
            <p key={c} className="text-xs text-text-muted">{c}</p>
          ))}
        </div>
      )}
    </div>
  )
}
