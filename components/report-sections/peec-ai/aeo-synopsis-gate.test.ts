import { describe, expect, test } from 'vitest'
import { showAeoSynopsis, SHOW_AI_NARRATIVE } from '@/lib/constants'

// AEO synopsis restore gate (Avenue Z template only).
//
// showAeoSynopsis controls the 3 AEO tab synopses (Overview, Content Impact,
// PR Influence). It must be ON for the Avenue Z template and OFF for every
// other client while the global SHOW_AI_NARRATIVE flag stays false. These are
// the guardrails: a leak here would restore AI narrative for a live client who
// did not ask for it.
//
// This test lives under components/report-sections/peec-ai/ on purpose: the
// vitest config only collects lib/report-sections, app/actions, and
// components/report-sections. A test under lib/peec/ would never run in CI.
describe('showAeoSynopsis', () => {
  test('the global narrative flag is still off (this gate is the only override)', () => {
    expect(SHOW_AI_NARRATIVE).toBe(false)
  })

  test('ON for the Avenue Z template', () => {
    expect(showAeoSynopsis('avenue-z')).toBe(true)
  })

  test('OFF for a live client (renaissance) — no leak', () => {
    expect(showAeoSynopsis('renaissance')).toBe(false)
  })

  test('OFF for any other client slug', () => {
    expect(showAeoSynopsis('some-other-client')).toBe(false)
  })

  test('OFF when clientSlug is undefined', () => {
    expect(showAeoSynopsis(undefined)).toBe(false)
  })

  test('strict equality — a slug that merely contains "avenue-z" does not match', () => {
    expect(showAeoSynopsis('avenue-z-2')).toBe(false)
    expect(showAeoSynopsis('not-avenue-z')).toBe(false)
  })
})
