// Run: npx tsx --env-file=.env.local lib/meta/base.test.ts
import { strict as assert } from 'node:assert'
import { resolveCompareIso } from './base'

assert.equal(resolveCompareIso('2026-01-01,2026-01-31', null), null)
assert.equal(resolveCompareIso('2026-01-01,2026-01-31', 'previous_period'), '2025-12-01,2025-12-31')

console.log('ok')
