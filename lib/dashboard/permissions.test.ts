// lib/dashboard/permissions.test.ts
// Run: npx tsx lib/dashboard/permissions.test.ts
import { strict as assert } from 'node:assert'
import { canEditDashboard } from './permissions'

// INTERNAL_ADMIN edits any client
assert.equal(canEditDashboard('INTERNAL_ADMIN', null, 'renaissance'), true)
assert.equal(canEditDashboard('INTERNAL_ADMIN', 'other', 'renaissance'), true)
// CLIENT_ADMIN edits only its own client
assert.equal(canEditDashboard('CLIENT_ADMIN', 'renaissance', 'renaissance'), true)
assert.equal(canEditDashboard('CLIENT_ADMIN', 'other', 'renaissance'), false)
assert.equal(canEditDashboard('CLIENT_ADMIN', null, 'renaissance'), false)
// read-only / viewer roles never edit
assert.equal(canEditDashboard('INTERNAL_ANALYST', null, 'renaissance'), false)
assert.equal(canEditDashboard('CLIENT_VIEWER', 'renaissance', 'renaissance'), false)
// unknown role denied
assert.equal(canEditDashboard('SOMETHING', 'renaissance', 'renaissance'), false)
console.log('ok')
