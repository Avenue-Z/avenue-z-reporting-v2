import { describe, expect, test } from 'vitest'
import { leadEventNames, hasLeadEvents, leadEventFilter, sumLeadEventConversions, deriveConversions } from './lead-events'
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

  test('drops non-string and blank (including whitespace-only) source-event names rather than sending them to GA4', () => {
    expect(leadEventNames({ leadEvents: [{ name: 'a', sourceEvents: ['', '  ', '\t', 'x'] }] })).toEqual(['x'])
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

  test('sums eventCount across rows, and a null cell (0) is not the same as an unparseable one', () => {
    expect(sumLeadEventConversions([
      { eventName: 'a', eventCount: 3 },
      { eventName: 'b', eventCount: '4' },
      { eventName: 'c', eventCount: null },
    ])).toBe(7)
  })

  // Round-three review finding: `Number(x) || 0` silently turned an
  // unparseable row (a GA4 response-shape change, a metric-header mismatch)
  // into a 0 contribution — a plausible-looking but quietly wrong total,
  // with no dash and no error. An unparseable row now fails the whole sum.
  test('a row with an unparseable eventCount fails the whole sum rather than silently contributing 0', () => {
    expect(sumLeadEventConversions([
      { eventName: 'a', eventCount: 3 },
      { eventName: 'b', eventCount: 'not-a-number' },
    ])).toBeNull()
    expect(sumLeadEventConversions([
      { eventName: 'a', eventCount: 3 },
      { eventName: 'b', eventCount: undefined as unknown as null },
    ])).toBeNull()
  })
})

/**
 * PR #235 round three, both reviewers: `index.tsx` and `stages.ts` each had
 * their own copy of this three-way branch, and the compare-period copy in
 * `index.tsx` shipped with zero test coverage — reverting it to `??` left
 * the full suite green, the same way the main-period copy did at round two.
 * Pinning the ONE shared function both call sites now delegate to closes
 * every copy at once, structurally, rather than requiring a render-level
 * test per surface per period.
 */
describe('deriveConversions', () => {
  const raw = { conversions: 300, conversionRate: 0.05 }

  test('unconfigured (undefined): returns the raw GA4 metrics unchanged', () => {
    expect(deriveConversions(undefined, raw.conversions, raw.conversionRate, 1000)).toEqual({
      conversions: 300, conversionRate: 0.05,
    })
  })

  test('configured but failed (null): dashes both fields, never the raw count', () => {
    expect(deriveConversions(null, raw.conversions, raw.conversionRate, 1000)).toEqual({
      conversions: null, conversionRate: null,
    })
  })

  test('configured and successful: uses the real number, rate derived from it over sessions', () => {
    expect(deriveConversions(42, raw.conversions, raw.conversionRate, 1000)).toEqual({
      conversions: 42, conversionRate: 0.042,
    })
  })

  test('a genuine 0 is a real value, not treated as failure', () => {
    expect(deriveConversions(0, raw.conversions, raw.conversionRate, 1000)).toEqual({
      conversions: 0, conversionRate: 0,
    })
  })

  test('sessions 0 or undefined dashes the rate rather than dividing by zero', () => {
    expect(deriveConversions(42, raw.conversions, raw.conversionRate, 0)).toEqual({
      conversions: 42, conversionRate: null,
    })
    expect(deriveConversions(42, raw.conversions, raw.conversionRate, undefined)).toEqual({
      conversions: 42, conversionRate: null,
    })
  })
})
