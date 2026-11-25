import { afterEach, describe, expect, test, vi } from 'vitest'
import { designFromWriteProblem, kitActive, logMalformedDesignFrom, parseDesignFrom } from './design-from'
import { DESIGN_FROM_ROWS, rowConfig } from '@/lib/test-utils/design-from-rows'
import { clockFor } from './reporting-months'

afterEach(() => vi.restoreAllMocks())

describe('kitActive: the rule, row by row (spec section 3)', () => {
  test.each(DESIGN_FROM_ROWS)('$name', (row) => {
    expect(kitActive({ dashSocialConfig: rowConfig(row) }, row.month)).toBe(row.kit)
  })
  test('the year boundary: 2026-01 is old on 2025-12 and kit on 2026-01', () => {
    const client = { dashSocialConfig: { brandId: 1, designFrom: '2026-01' } }
    expect(kitActive(client, '2025-12')).toBe(false)
    expect(kitActive(client, '2026-01')).toBe(true)
  })
})

describe('parseDesignFrom', () => {
  test.each([null, undefined, {}, { dashSocialConfig: null }, { dashSocialConfig: [] }, { dashSocialConfig: { brandId: 1 } }])(
    'absent: %j', (client) => {
      expect(parseDesignFrom(client)).toEqual({ kind: 'absent' })
    })
  test('valid', () => {
    expect(parseDesignFrom({ dashSocialConfig: { designFrom: '2026-11' } })).toEqual({ kind: 'ok', month: '2026-11' })
  })
  test.each([null, '2026-13', '2026-1', 202611, '2026-11-01', ' 2026-11', '2026-00'])('malformed: %j', (value) => {
    expect(parseDesignFrom({ dashSocialConfig: { designFrom: value } })).toEqual({ kind: 'malformed', value })
  })
})

describe('logMalformedDesignFrom', () => {
  const line = (value: unknown) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logMalformedDesignFrom('c', value)
    expect(spy).toHaveBeenCalledTimes(1)
    return spy.mock.calls[0][0] as string
  }
  test('the slug and the value, once, via console.error', () => {
    expect(line('2026-13')).toBe('[organic-social] designFrom setting is invalid slug=c value="2026-13"')
  })
  test('a long value is cut to 32 characters', () => {
    expect(line('x'.repeat(100))).toBe(`[organic-social] designFrom setting is invalid slug=c value="${'x'.repeat(32)}"`)
  })
  test('a value with a newline or a line separator stays on one line', () => {
    expect(line('a\nb')).toBe('[organic-social] designFrom setting is invalid slug=c value="a\\nb"')
    expect(line('a\u2028b')).toBe('[organic-social] designFrom setting is invalid slug=c value="a\\u2028b"')
  })
  test('a non-string value is logged as its string', () => {
    expect(line(202611)).toBe('[organic-social] designFrom setting is invalid slug=c value="202611"')
    expect(line(null)).toBe('[organic-social] designFrom setting is invalid slug=c value="null"')
  })
})

describe('designFromWriteProblem (the pin script refuses, Decisions 6 and 7)', () => {
  const clock = clockFor(new Date('2026-11-24T15:00:00Z'))
  const cfg = { brandId: 1, reportingMonths: { firstMonth: '2026-08' } }
  test('a month no client can see yet is fine', () => {
    expect(designFromWriteProblem(cfg, '2026-11', clock)).toBeNull()
    expect(designFromWriteProblem(cfg, '2027-01', clock)).toBeNull()
  })
  test('a month a client can already see is refused, naming it', () => {
    expect(designFromWriteProblem(cfg, '2026-10', clock)).toMatch(/2026-10/)
    expect(designFromWriteProblem(cfg, '2026-08', clock)).toMatch(/2026-10/)
  })
  test('a value that is not YYYY-MM is refused, naming the format', () => {
    expect(designFromWriteProblem(cfg, 'nope', clock)).toMatch(/YYYY-MM/)
  })
  test('no reportingMonths, or one that does not parse, is refused, naming it', () => {
    expect(designFromWriteProblem({ brandId: 1 }, '2026-11', clock)).toMatch(/reportingMonths/)
    expect(designFromWriteProblem({ brandId: 1, reportingMonths: null }, '2026-11', clock)).toMatch(/reportingMonths/)
    expect(designFromWriteProblem({ brandId: 1, reportingMonths: { firstMonth: 'x' } }, '2026-11', clock)).toMatch(/reportingMonths/)
    expect(designFromWriteProblem(null, '2026-11', clock)).toMatch(/dash_social_config/)
  })
  test('reportingMonths with a bad optional key is refused, naming the key (a client is then shown no months, which would pass the delivered-month check)', () => {
    expect(designFromWriteProblem({ brandId: 1, reportingMonths: { firstMonth: '2026-08', opensOnDay: 99 } }, '2026-09', clock)).toMatch(/opensOnDay/)
    expect(designFromWriteProblem({ brandId: 1, reportingMonths: { firstMonth: '2026-08', clientMonths: 0 } }, '2026-12', clock)).toMatch(/clientMonths/)
  })
  test('a config that already has designFrom is refused, naming it', () => {
    expect(designFromWriteProblem({ ...cfg, designFrom: '2026-12' }, '2026-11', clock)).toMatch(/already.*designFrom/)
  })
})
