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
})
