import { afterEach, expect, test, vi } from 'vitest'
import { SHARE_ORIGINS, shareOrigin } from './share-origin'

afterEach(() => { vi.unstubAllEnvs() })

test('the origin is locked per Vercel environment (spec v1.1 §16.2)', () => {
  expect(SHARE_ORIGINS).toEqual({ production: 'https://reporting.avenuez.com', staging: 'https://staging.reporting.avenuez.com' })
  expect(shareOrigin('production')).toBe('https://reporting.avenuez.com')
  expect(shareOrigin('staging')).toBe('https://staging.reporting.avenuez.com')
  for (const env of ['preview', 'development', '', undefined, 'Production']) expect(shareOrigin(env)).toBeNull()
})

test('with no argument it reads VERCEL_TARGET_ENV', () => {
  vi.stubEnv('VERCEL_TARGET_ENV', 'production')
  expect(shareOrigin()).toBe('https://reporting.avenuez.com')
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview')
  expect(shareOrigin()).toBeNull()
})
