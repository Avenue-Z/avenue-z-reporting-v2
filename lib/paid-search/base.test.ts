// Run: npx tsx --env-file=.env.local lib/paid-search/base.test.ts
// (--env-file is required: importing ./base transitively loads the DB
//  client, which throws at module init without DATABASE_URL. The helpers under
//  test are pure and need no network.)
import { strict as assert } from 'node:assert'
import { isLeadAction, categoryOf, usd, pct, resolveCompareIso } from './base'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'employer_dental_lead', category: 'employer' as const },
    { name: 'contact_broker_lead', category: 'broker' as const }, // NOT name-derivable
  ],
}
assert.equal(isLeadAction('employer_dental_lead', cfg), true)
assert.equal(isLeadAction('Calls from ads', cfg), false)           // excluded
assert.equal(categoryOf('contact_broker_lead', cfg), 'broker')      // explicit map, not prefix
assert.equal(usd(1234.7), '$1,235')
assert.equal(pct(12.34), '12.3%')

// resolveCompareIso assertions
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', null), null)
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period'), '2025-12-01,2025-12-31')

console.log('ok')
