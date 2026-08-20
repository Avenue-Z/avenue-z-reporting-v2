import { describe, it, expect, vi } from 'vitest'
import { transformPipeline, transformByOwner } from './pipeline'

// Shaped exactly like parseSmRows output for the stage query. Values are numbers
// and booleans at runtime despite the string typing, so fixtures use real types.
const rows = [
  { opportunity_stage_name: 'Closed Lost',       opportunity_is_won: false, opportunity_is_closed: true,  opportunity_probability: 0,   opportunity_count: 5314, opportunity_amount: 407918882.38 },
  { opportunity_stage_name: 'Renewed',           opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 100, opportunity_count: 1822, opportunity_amount: 0 },
  { opportunity_stage_name: 'Closed Won',        opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 100, opportunity_count: 624,  opportunity_amount: 30352228.14 },
  { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25,  opportunity_count: 270,  opportunity_amount: 16333132.59 },
  { opportunity_stage_name: 'Set Up',            opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 5,   opportunity_count: 11,   opportunity_amount: 123238.68 },
  // The trap: Closed Won appears twice when probability is a dimension.
  { opportunity_stage_name: 'Closed Won',        opportunity_is_won: true,  opportunity_is_closed: true,  opportunity_probability: 25,  opportunity_count: 1,    opportunity_amount: 15297.6 },
  // Deliberately hypothetical: in the live data, renewal stages always carry a $0
  // amount, so this row can't happen today. It guards the case where the CRM
  // starts populating renewal amounts, at which point the is_won flag would
  // silently absorb them into closed won if the implementation ever keyed off
  // it instead of the Closed Won stage literal.
  { opportunity_stage_name: 'Renewed Pending Payment', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 26, opportunity_amount: 250000 },
] as unknown as Record<string, string>[]

describe('transformPipeline', () => {
  it('counts open deals as not-closed only', () => {
    const p = transformPipeline(rows, null)
    expect(p.openDeals.value).toBe(281) // 270 + 11
  })

  it('sums open pipeline amount', () => {
    const p = transformPipeline(rows, null)
    expect(p.totalPipeline.value).toBeCloseTo(16456371.27, 2)
  })

  it('identifies won by the Closed Won stage literal, not the won flag', () => {
    const p = transformPipeline(rows, null)
    // Renewed is won=true but is NOT counted: it carries $0 and is not new business.
    // Renewed Pending Payment is also won=true, IS closed, and carries a non-zero
    // amount, but its stage is not Closed Won, so it is not counted either. This
    // second case is the one a stage === CLOSED_WON check catches and a naive
    // r.isWon check would not: swap the implementation to r.isWon and this fails.
    expect(p.closedWon.value).toBeCloseTo(30352228.14 + 15297.6, 2)
  })

  it('sums both Closed Won rows rather than finding the first', () => {
    const p = transformPipeline(rows, null)
    expect(p.closedWon.value).toBeGreaterThan(30352228.14)
  })

  it('excludes a stage that merely contains "won" but is not the exact literal', () => {
    const withFuzzyWon = [
      ...rows,
      // A plausible wrong implementation is stage.toLowerCase().includes('won'),
      // which would wrongly absorb this row. It is won=true, closed, and carries
      // a real amount, but its stage is not the exact "Closed Won" literal.
      { opportunity_stage_name: 'Closed Won - Renewal', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 3, opportunity_amount: 500000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(withFuzzyWon, null)
    expect(p.closedWon.value).toBeCloseTo(30352228.14 + 15297.6, 2)
  })

  it('selects a client-configured won-stage label instead of the hardcoded default', () => {
    const custom = [
      // Under a custom wonStage, this row counts and the literal 'Closed Won'
      // row (still present, unrelated) does not.
      { opportunity_stage_name: 'Won - Custom', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 2, opportunity_amount: 5000 },
      { opportunity_stage_name: 'Closed Won',   opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: 999999 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(custom, null, 'Won - Custom')
    expect(p.closedWon.value).toBe(5000)
  })

  it('still defaults to the Closed Won literal when no wonStage argument is passed', () => {
    const p = transformPipeline(rows, null)
    expect(p.closedWon.value).toBeCloseTo(30352228.14 + 15297.6, 2)
  })

  it('divides probability by 100 before weighting', () => {
    const p = transformPipeline(rows, null)
    // 16333132.59 * 0.25 + 123238.68 * 0.05
    expect(p.weightedPipeline.value).toBeCloseTo(4083283.15 + 6161.93, 0)
    // The 100x trap: if not divided, this would be ~408 million.
    expect(p.weightedPipeline.value).toBeLessThan(10_000_000)
  })

  it('suppresses delta on the three open tiles even with a healthy nonzero compare set', () => {
    // A compare set with a large, plainly nonzero prior for every open-pipeline
    // field. If openDeals/totalPipeline/weightedPipeline ever got re-wired back
    // to their priors (the bug being fixed here), this is exactly the fixture
    // that would produce a visible, wrong percentage instead of staying silent.
    const cmp = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 200, opportunity_amount: 10_000_000 },
      { opportunity_stage_name: 'Closed Won', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 50, opportunity_amount: 20_000_000 },
    ] as unknown as Record<string, string>[]
    const withCmp = transformPipeline(rows, cmp)
    expect(withCmp.openDeals.delta).toBeUndefined()
    expect(withCmp.totalPipeline.delta).toBeUndefined()
    expect(withCmp.weightedPipeline.delta).toBeUndefined()
    const noCmp = transformPipeline(rows, null)
    expect(noCmp.openDeals.delta).toBeUndefined()
    expect(noCmp.totalPipeline.delta).toBeUndefined()
    expect(noCmp.weightedPipeline.delta).toBeUndefined()
  })

  it('still computes closedWon delta from its own prior, not a cross-wired one', () => {
    // Two distinct nonzero priors so a cross-wired closedWon (e.g. reading
    // totalPipeline's prior instead of its own) shows up as a wrong number
    // rather than a coincidental match.
    const cmp = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 20, opportunity_count: 50, opportunity_amount: 200000 },
      { opportunity_stage_name: 'Closed Won', opportunity_is_won: true, opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 5, opportunity_amount: 999999 },
    ] as unknown as Record<string, string>[]
    const priorClosedWon = 999999
    const p = transformPipeline(rows, cmp)
    expect(p.closedWon.delta).toBeCloseTo(((p.closedWon.value - priorClosedWon) / priorClosedWon) * 100, 4)
    const noCmp = transformPipeline(rows, null)
    expect(noCmp.closedWon.delta).toBeUndefined()
  })

  it('guards against Infinity when the prior closedWon is zero', () => {
    // A compare set that succeeds but has no Closed Won row: prior is 0, and only
    // the prior === 0 guard in pct() stops (current - 0) / 0 from producing
    // Infinity instead of an absent delta. Remove that guard and this fails.
    const cmpNoWon = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 5, opportunity_amount: 1000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(rows, cmpNoWon)
    expect(p.closedWon.delta).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const p = transformPipeline([], null)
    expect(p.openDeals.value).toBe(0)
    expect(p.closedWon.value).toBe(0)
  })

  it('does not let one unparseable amount NaN-poison a tile', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const badRows = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 10, opportunity_amount: '1,234.56' },
      { opportunity_stage_name: 'Set Up',             opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 5,  opportunity_count: 5,  opportunity_amount: 1000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(badRows, null)
    // The unparseable amount coerces to 0, not NaN, so the tile still reads a real number.
    expect(Number.isFinite(p.totalPipeline.value)).toBe(true)
    expect(p.totalPipeline.value).toBe(1000)
    // The bad value is logged, not swallowed silently.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), '1,234.56')
    warnSpy.mockRestore()
  })

  it('does not let a missing (undefined) amount silently read as a real zero', () => {
    // parseSmRows keys rows by the field_id Supermetrics echoes back. A renamed,
    // dropped, or subtly wrong field_id leaves the key absent from the row
    // entirely, which is a DIFFERENT failure than an unparseable string: Number(v
    // ?? 0) evaluates undefined to a real, finite 0, so the old
    // !Number.isFinite(n) guard never fired. A wrong implementation that still
    // does `Number(v ?? 0)` with no separate undefined check passes this
    // fixture's tile-value assertion (it still reads 0) but fails the warn
    // assertion, which is the only thing that would tell an operator the field
    // id broke rather than the client genuinely having no pipeline.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missingField = [
      // opportunity_amount is entirely absent, not '' or null.
      { opportunity_stage_name: 'Proposal Released', opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 10 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(missingField, null)
    expect(p.totalPipeline.value).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing'), undefined)
    warnSpy.mockRestore()
  })

  it('boolean identity: string "true"/"false" produce the same tiles as real booleans', () => {
    // Paul's live-shaped probe: parseSmRows types every value as a string, so a
    // real boolean arriving is an unguaranteed API detail. A wrong implementation
    // comparing with === true only recognizes the real boolean and treats every
    // string form as "not strictly true" -> open, which INFLATES every open tile.
    const stringBooleanRows = rows.map((r) => ({
      ...r,
      opportunity_is_closed: String((r as unknown as { opportunity_is_closed: boolean }).opportunity_is_closed),
    })) as unknown as Record<string, string>[]
    const withBooleans = transformPipeline(rows, null)
    const withStrings = transformPipeline(stringBooleanRows, null)
    expect(withStrings.openDeals.value).toBe(withBooleans.openDeals.value)
    expect(withStrings.totalPipeline.value).toBe(withBooleans.totalPipeline.value)
    expect(withStrings.weightedPipeline.value).toBeCloseTo(withBooleans.weightedPipeline.value, 6)
    expect(withStrings.closedWon.value).toBeCloseTo(withBooleans.closedWon.value, 6)
  })

  it('an unrecognised is_closed value warns and excludes the row from open tiles, never inflates them', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unrecognised = [
      // A plausible wrong fallback direction defaults an unrecognised value to
      // "open" (not closed), which would add this row's count/amount into the
      // open tiles. The safe direction is the opposite: exclude it.
      { opportunity_stage_name: 'Proposal Released', opportunity_is_closed: 'maybe', opportunity_probability: 25, opportunity_count: 1000, opportunity_amount: 999_999_999 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(unrecognised, null)
    expect(p.openDeals.value).toBe(0)
    expect(p.totalPipeline.value).toBe(0)
    expect(p.weightedPipeline.value).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), 'maybe')
    warnSpy.mockRestore()
  })

  it('warns with the stages actually present when nothing matches the configured won stage', () => {
    // A single row whose amount would otherwise render as a real closedWon
    // figure, but under a stage label that doesn't match wonStage (simulating a
    // renamed/re-punctuated stage in the CRM).
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const renamed = [
      { opportunity_stage_name: 'Closed - Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: 5_000_000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(renamed, null)
    expect(p.closedWon.value).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no rows matched won stage'),
      ['Closed - Won'],
    )
    warnSpy.mockRestore()
  })

  it('does not warn about a won-stage mismatch when a match exists', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    transformPipeline(rows, null) // `rows` includes a real 'Closed Won' row
    const noMatchCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('no rows matched won stage'))
    expect(noMatchCalls).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('does not warn about a won-stage mismatch on empty input', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    transformPipeline([], null)
    const noMatchCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('no rows matched won stage'))
    expect(noMatchCalls).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('warns only for the current window, not the compare window, when the prior year has no won stage', () => {
    // A legitimately differently-labelled or empty prior year is normal and must
    // stay silent. The current set matches, the compare set does not; exactly one
    // no-match warn (the current window) must fire, never two. This fails if the
    // compare aggregation is ever passed warnOnNoMatch: true.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cmpNoWon = [
      { opportunity_stage_name: 'Closed - Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: 9_000_000 },
    ] as unknown as Record<string, string>[]
    transformPipeline(rows, cmpNoWon) // `rows` has a real 'Closed Won'; cmp does not
    const noMatchCalls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('no rows matched won stage'))
    expect(noMatchCalls).toHaveLength(0)
    warnSpy.mockRestore()
  })

  it('does not double-count a won-stage row that is not flagged closed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // stage says Closed Won but is_closed is false: a mid-migration/data-entry state.
    const rows = [
      { opportunity_stage_name: 'Closed Won', opportunity_is_closed: false, opportunity_probability: 100, opportunity_count: 3, opportunity_amount: 500000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(rows, null)
    // It is open (not closed), so it counts toward open tiles...
    expect(p.openDeals.value).toBe(3)
    // ...but must NOT also count as closed-won.
    expect(p.closedWon.value).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('won stage but not closed'),
      expect.anything(),
    )
    warn.mockRestore()
  })

  it('withholds the closedWon delta when the prior is negative, not just zero', () => {
    const cur = [{ opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: 100000 }] as unknown as Record<string, string>[]
    const prior = [{ opportunity_stage_name: 'Closed Won', opportunity_is_closed: true, opportunity_probability: 100, opportunity_count: 1, opportunity_amount: -50000 }] as unknown as Record<string, string>[]
    const p = transformPipeline(cur, prior)
    expect(p.closedWon.delta).toBeUndefined()
  })
})

describe('transformByOwner', () => {
  const owners = [
    { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 10, opportunity_amount: 500 },
    { opportunity_owner: 'Owner B', opportunity_is_closed: false, opportunity_count: 30, opportunity_amount: 100 },
  ] as unknown as Record<string, string>[]

  it('sorts by count descending', () => {
    const out = transformByOwner(owners, 500)
    expect(out.rows.map(r => r.owner)).toEqual(['Owner B', 'Owner A'])
  })

  it('flags truncation when the row count hits maxRows', () => {
    expect(transformByOwner(owners, 2).truncated).toBe(true)
    expect(transformByOwner(owners, 500).truncated).toBe(false)
  })

  it('excludes closed rows from the open-deals owner breakdown', () => {
    const withClosed = [
      ...owners,
      { opportunity_owner: 'Owner A', opportunity_is_closed: true, opportunity_count: 999, opportunity_amount: 999999 },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(withClosed, 500)
    // Owner A's closed row must not inflate her open count/amount.
    expect(out.rows.find(r => r.owner === 'Owner A')).toEqual({ owner: 'Owner A', count: 10, amount: 500 })
  })

  it('sums two open rows for the same owner into one entry', () => {
    const split = [
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 10, opportunity_amount: 500 },
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 5,  opportunity_amount: 250 },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(split, 500)
    expect(out.rows).toEqual([{ owner: 'Owner A', count: 15, amount: 750 }])
  })

  it('falls back to Unassigned for a blank owner, not just a missing one', () => {
    const blank = [
      { opportunity_owner: '', opportunity_is_closed: false, opportunity_count: 3, opportunity_amount: 90 },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(blank, 500)
    expect(out.rows).toEqual([{ owner: 'Unassigned', count: 3, amount: 90 }])
  })

  it('does not let one unparseable amount NaN-poison an owner total', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const badAmount = [
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 4, opportunity_amount: 'not-a-number' },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(badAmount, 500)
    expect(out.rows).toEqual([{ owner: 'Owner A', count: 4, amount: 0 }])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), 'not-a-number')
    warnSpy.mockRestore()
  })

  it('judges truncation on raw row count, not the aggregated output row count', () => {
    const raw = [
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 10, opportunity_amount: 500 },
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 5,  opportunity_amount: 250 },
      { opportunity_owner: 'Owner X', opportunity_is_closed: true,  opportunity_count: 999, opportunity_amount: 999999 },
    ] as unknown as Record<string, string>[]
    // 3 raw rows: two open rows for the same owner (aggregate to one output row)
    // plus a closed row (filtered out entirely). Raw count (3) and output count
    // (1) diverge, so this is the case that pins truncation to the raw count.
    const out = transformByOwner(raw, 3)
    expect(out.rows).toHaveLength(1)
    expect(out.truncated).toBe(true)
  })

  it('excludes a closed row expressed as the string "true", not just the real boolean', () => {
    // A wrong implementation comparing with !== true (bare identity) treats a
    // stringified 'true' as "not strictly true" and keeps the row as open,
    // inflating Owner A's count/amount. Real booleans and string forms must
    // agree on the same result.
    const withStringClosed = [
      ...owners,
      { opportunity_owner: 'Owner A', opportunity_is_closed: 'true', opportunity_count: 999, opportunity_amount: 999999 },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(withStringClosed, 500)
    expect(out.rows.find(r => r.owner === 'Owner A')).toEqual({ owner: 'Owner A', count: 10, amount: 500 })
  })

  it('an unrecognised is_closed value warns and excludes the owner row, never inflates the breakdown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unrecognised = [
      { opportunity_owner: 'Owner A', opportunity_is_closed: 'unknown', opportunity_count: 500, opportunity_amount: 50000 },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(unrecognised, 500)
    expect(out.rows).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[salesforce]'), 'unknown')
    warnSpy.mockRestore()
  })
})
