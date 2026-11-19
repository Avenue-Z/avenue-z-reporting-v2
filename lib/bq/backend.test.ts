import { afterEach, describe, expect, test, vi } from 'vitest'
import { bqEnabled, logBqFallback } from './backend'
import { BqUnavailable } from './errors'

afterEach(() => vi.unstubAllEnvs())

describe('bqEnabled', () => {
  test('off by default', () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', '')
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    expect(bqEnabled('googleads', 'renaissance')).toBe(false)
  })
  test('on only for a source set to bq and a slug on the allowlist', () => {
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('BQ_CLIENTS', ' renaissance , avenue-z ')
    expect(bqEnabled('googleads', 'renaissance')).toBe(true)
    expect(bqEnabled('googleads', 'avenue-z')).toBe(true)
    expect(bqEnabled('googleads', 'kind-patches')).toBe(false)
    expect(bqEnabled('linkedin', 'renaissance')).toBe(false)
  })
  test('Meta is switched by DATA_BACKEND_META, only when exactly `bq` and allowlisted', () => {
    vi.stubEnv('BQ_CLIENTS', 'renaissance')
    vi.stubEnv('DATA_BACKEND_GOOGLEADS', 'bq')
    vi.stubEnv('DATA_BACKEND_META', 'BQ')
    expect(bqEnabled('meta', 'renaissance')).toBe(false)
    vi.stubEnv('DATA_BACKEND_META', 'bq')
    expect(bqEnabled('meta', 'renaissance')).toBe(true)
    expect(bqEnabled('meta', 'kind-patches')).toBe(false)
  })
  test('an empty allowlist serves nobody', () => {
    vi.stubEnv('DATA_BACKEND_LINKEDIN', 'bq')
    vi.stubEnv('BQ_CLIENTS', '')
    expect(bqEnabled('linkedin', 'renaissance')).toBe(false)
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
  test('says what was served instead: live for LinkedIn, nothing for Google Ads (C3)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logBqFallback('linkedin', 'renaissance', new Error('boom'))
    logBqFallback('googleads', 'renaissance', new Error('boom'), 'none')
    expect(JSON.parse(warn.mock.calls[0][0] as string).served).toBe('live')
    expect(JSON.parse(warn.mock.calls[1][0] as string)).toMatchObject({ event: 'bq_fallback', reason: 'error', served: 'none' })
    warn.mockRestore()
  })
})
