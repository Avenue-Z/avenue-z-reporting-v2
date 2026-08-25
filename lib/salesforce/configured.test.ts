import { describe, it, expect, afterEach } from 'vitest'
import { isSalesforceConfigured, canQuerySalesforce } from './configured'
import type { Client } from '@/lib/db/schema'

const ENV_VAR = 'SM_API_KEY_TEST_CLIENT'

/** Only the two fields these predicates read. Cast because the real Client row
 *  has ~40 columns and none of the others affect the answer. */
function client(over: Partial<Client> = {}): Client {
  return {
    salesforceConfig: { salesforceAccountId: '00D15000000Em4GEAS' },
    smApiKeyEnvVar: ENV_VAR,
    ...over,
  } as Client
}

afterEach(() => {
  delete process.env[ENV_VAR]
})

describe('isSalesforceConfigured', () => {
  it('is true with an account id and an env var NAME, whether or not that var is set', () => {
    expect(isSalesforceConfigured(client())).toBe(true)
    process.env[ENV_VAR] = 'key-123'
    expect(isSalesforceConfigured(client())).toBe(true)
  })

  it('is false without an account id', () => {
    expect(isSalesforceConfigured(client({ salesforceConfig: null }))).toBe(false)
  })

  it('is false without an env var name', () => {
    expect(isSalesforceConfigured(client({ smApiKeyEnvVar: null }))).toBe(false)
  })

  it('is false for a null or undefined client', () => {
    expect(isSalesforceConfigured(null)).toBe(false)
    expect(isSalesforceConfigured(undefined)).toBe(false)
  })
})

describe('canQuerySalesforce', () => {
  it('is true only when the named env var actually holds a value', () => {
    process.env[ENV_VAR] = 'key-123'
    expect(canQuerySalesforce(client())).toBe(true)
  })

  it('is false when the env var is unset: salesforceQuery would throw at base.ts:35', () => {
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('is false when the env var is set to an empty string', () => {
    process.env[ENV_VAR] = ''
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('is false without an account id, even with the key set: salesforceQuery throws at base.ts:33', () => {
    process.env[ENV_VAR] = 'key-123'
    expect(canQuerySalesforce(client({ salesforceConfig: null }))).toBe(false)
  })

  it('is false for a null client', () => {
    expect(canQuerySalesforce(null)).toBe(false)
  })
})

describe('the two predicates disagree on exactly one case', () => {
  // This is the whole point of the split. Collapsing them back into one
  // predicate is what reintroduces "Connect your CRM to see this" on a
  // preview deploy that is simply missing the shared Supermetrics key.
  it('configured but unreachable: configured true, queryable false', () => {
    expect(isSalesforceConfigured(client())).toBe(true)
    expect(canQuerySalesforce(client())).toBe(false)
  })

  it('canQuerySalesforce is never true where isSalesforceConfigured is false', () => {
    process.env[ENV_VAR] = 'key-123'
    for (const c of [client({ salesforceConfig: null }), client({ smApiKeyEnvVar: null }), null]) {
      if (!isSalesforceConfigured(c)) expect(canQuerySalesforce(c)).toBe(false)
    }
  })
})
