import { describe, it, expect } from 'vitest'
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

  it('divides probability by 100 before weighting', () => {
    const p = transformPipeline(rows, null)
    // 16333132.59 * 0.25 + 123238.68 * 0.05
    expect(p.weightedPipeline.value).toBeCloseTo(4083283.15 + 6161.93, 0)
    // The 100x trap: if not divided, this would be ~408 million.
    expect(p.weightedPipeline.value).toBeLessThan(10_000_000)
  })

  it('computes deltas against a compare set and omits them without one', () => {
    const cmp = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 200, opportunity_amount: 10_000_000 },
    ] as unknown as Record<string, string>[]
    const withCmp = transformPipeline(rows, cmp)
    expect(withCmp.openDeals.delta).toBeCloseTo(((281 - 200) / 200) * 100, 1)
    const noCmp = transformPipeline(rows, null)
    expect(noCmp.openDeals.delta).toBeUndefined()
  })

  it('returns zeros, not throws, on empty input', () => {
    const p = transformPipeline([], null)
    expect(p.openDeals.value).toBe(0)
    expect(p.closedWon.value).toBe(0)
  })

  it('does not let one unparseable amount NaN-poison a tile', () => {
    const badRows = [
      { opportunity_stage_name: 'Proposal Released', opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 25, opportunity_count: 10, opportunity_amount: '1,234.56' },
      { opportunity_stage_name: 'Set Up',             opportunity_is_won: false, opportunity_is_closed: false, opportunity_probability: 5,  opportunity_count: 5,  opportunity_amount: 1000 },
    ] as unknown as Record<string, string>[]
    const p = transformPipeline(badRows, null)
    // The unparseable amount coerces to 0, not NaN, so the tile still reads a real number.
    expect(Number.isFinite(p.totalPipeline.value)).toBe(true)
    expect(p.totalPipeline.value).toBe(1000)
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
    const badAmount = [
      { opportunity_owner: 'Owner A', opportunity_is_closed: false, opportunity_count: 4, opportunity_amount: 'not-a-number' },
    ] as unknown as Record<string, string>[]
    const out = transformByOwner(badAmount, 500)
    expect(out.rows).toEqual([{ owner: 'Owner A', count: 4, amount: 0 }])
  })
})
