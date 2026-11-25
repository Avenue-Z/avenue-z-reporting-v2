import { describe, it, expect, afterEach, vi } from 'vitest'
import { googleToken } from './google'

describe('googleToken', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('throws when GOOGLE_SERVICE_ACCOUNT_KEY is missing', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_KEY', '')
    await expect(googleToken(['https://www.googleapis.com/auth/drive.readonly'])).rejects.toThrow('Missing GOOGLE_SERVICE_ACCOUNT_KEY')
  })
})
