import type { Client } from '@/lib/db/schema'

/**
 * Whether this CLIENT has a CRM configured. Row state only, and deliberately
 * does NOT read process.env.
 *
 * sm_api_key_env_var names the client's shared Supermetrics key, which Meta,
 * Paid Search, LinkedIn and the configurable dashboard read too. Whether that
 * variable holds a value is a property of the deployment, not of the client, so
 * a preview or staging build missing it would otherwise render "Connect your
 * CRM to see this" to a client who is fully configured. Use this to decide what
 * to TELL the reader; use canQuerySalesforce to decide whether to FETCH.
 */
export function isSalesforceConfigured(client: Client | null | undefined): boolean {
  return !!(client?.salesforceConfig?.salesforceAccountId && client?.smApiKeyEnvVar)
}

/**
 * Whether THIS DEPLOYMENT can actually run the query: exactly the conjunction
 * salesforceQuery enforces (base.ts:33 and :35). Used to skip a fetch that is
 * certain to throw, never to decide connectedness.
 */
export function canQuerySalesforce(client: Client | null | undefined): boolean {
  const envVar = client?.smApiKeyEnvVar
  return isSalesforceConfigured(client) && !!(envVar && process.env[envVar])
}
