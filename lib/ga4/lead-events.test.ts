import { describe, expect, test } from 'vitest'
import { leadEventNames, hasLeadEvents, leadEventFilter, sumLeadEventConversions } from './lead-events'
import type { Ga4Config } from '@/lib/db/schema'

describe('leadEventNames', () => {
  test('de-duplicates across sourceEvents', () => {
    const config: Ga4Config = {
      leadEvents: [
        { name: 'a', sourceEvents: ['x', 'y'] },
        { name: 'b', sourceEvents: ['y', 'z'] },
      ],
    }
    expect(leadEventNames(config)).toEqual(['x', 'y', 'z'])
  })

  test('tolerates malformed jsonb rather than throwing — missing/null', () => {
    expect(leadEventNames(null)).toEqual([])
    expect(leadEventNames(undefined)).toEqual([])
    expect(leadEventNames({} as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: null } as unknown as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: [{ name: 'a' }] } as unknown as Ga4Config)).toEqual([])
  })

  // Round-two review finding: `?? []` only guards null/undefined, not a
  // present value of the wrong TYPE. These are the cases that still threw.
  test('tolerates malformed jsonb rather than throwing — wrong type', () => {
    expect(leadEventNames({ leadEvents: 'nope' } as unknown as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: { a: 1 } } as unknown as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: 42 } as unknown as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: [{ name: 'a', sourceEvents: 'nope' }] } as unknown as Ga4Config)).toEqual([])
    expect(leadEventNames({ leadEvents: [{ name: 'a', sourceEvents: { x: 1 } }] } as unknown as Ga4Config)).toEqual([])
  })

  test('drops non-string and blank source-event names rather than sending them to GA4', () => {
    expect(leadEventNames({ leadEvents: [{ name: 'a', sourceEvents: ['', '', 'x'] }] })).toEqual(['x'])
    expect(leadEventNames({ leadEvents: [{ name: 'a', sourceEvents: [null, 1, 'x'] as unknown as string[] }] })).toEqual(['x'])
  })
})

describe('hasLeadEvents', () => {
  test('false for missing/empty config, true once a name resolves', () => {
    expect(hasLeadEvents(null)).toBe(false)
    expect(hasLeadEvents({ leadEvents: [] })).toBe(false)
    expect(hasLeadEvents({ leadEvents: [{ name: 'a', sourceEvents: [] }] })).toBe(false)
    expect(hasLeadEvents({ leadEvents: [{ name: 'a', sourceEvents: ['x'] }] })).toBe(true)
    expect(hasLeadEvents({ leadEvents: 'nope' } as unknown as Ga4Config)).toBe(false)
  })
})

describe('leadEventFilter', () => {
  test('builds an inListFilter over the de-duplicated names', () => {
    const config: Ga4Config = { leadEvents: [{ name: 'a', sourceEvents: ['x', 'x', 'y'] }] }
    expect(leadEventFilter(config)).toEqual({
      filter: { fieldName: 'eventName', inListFilter: { values: ['x', 'y'] } },
    })
  })
})

describe('sumLeadEventConversions', () => {
  test('null/undefined input (fetch failed or never ran) returns null, not 0', () => {
    expect(sumLeadEventConversions(null)).toBeNull()
    expect(sumLeadEventConversions(undefined)).toBeNull()
  })

  test('a successful fetch with no matching rows is a real 0', () => {
    expect(sumLeadEventConversions([])).toBe(0)
  })

  test('sums eventCount across rows', () => {
    expect(sumLeadEventConversions([
      { eventName: 'a', eventCount: 3 },
      { eventName: 'b', eventCount: '4' },
      { eventName: 'c', eventCount: null },
    ])).toBe(7)
  })
})
