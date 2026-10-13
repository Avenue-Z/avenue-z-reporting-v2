import { afterEach, describe, expect, test, vi } from 'vitest'
import { useBq, logBqFallback } from './backend'
import { BqUnavailable } from './errors'

afterEach(() => vi.unstubAllEnvs())

describe('useBq', () => {
  test('off by default', () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', '')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    expect(useBq('googleads', 'renaissance')).toBe(false)
  })
  test('on only for a source set to bq and a slug on the allowlist', () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', ' renaissance , avenue-z ')
    expect(useBq('googleads', 'renaissance')).toBe(true)
    expect(useBq('googleads', 'avenue-z')).toBe(true)
    expect(useBq('googleads', 'kind-patches')).toBe(false)
    expect(useBq('linkedin', 'renaissance')).toBe(false)
  })
  test('an empty allowlist serves nobody', () => {
    vi.stubEnv('DATA_BACKEND_LINKEDIN', 'bq')
    vi.stubEnv('BQ_CLIENTS', '')
    expect(useBq('linkedin', 'renaissance')).toBe(false)
  })
})

describe('logBqFallback', () => {
  test('logs one JSON line with source, slug and reason', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logBqFallback('linkedin', 'renaissance', new BqUnavailable('stale', 'through 2026-10-11'))
    const line = JSON.parse(warn.mock.calls[0][0] as string)
    expect(line).toMatchObject({ event: 'bq_fallback', source: 'linkedin', slug: 'renaissance', reason: 'stale' })
    logBqFallback('linkedin', 'renaissance', new Error('boom'))
    expect(JSON.parse(warn.mock.calls[1][0] as string).reason).toBe('error')
    warn.mockRestore()
  })
})
