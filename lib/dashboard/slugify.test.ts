// lib/dashboard/slugify.test.ts
// Run: npx tsx lib/dashboard/slugify.test.ts
import { strict as assert } from 'node:assert'
import { slugify } from './slugify'

assert.equal(slugify('Love Bug'), 'love-bug')
assert.equal(slugify('Begin Health'), 'begin-health')
assert.equal(slugify('  Elix  '), 'elix')
assert.equal(slugify('A&W Root Beer!'), 'a-w-root-beer')
assert.equal(slugify('Already-Slugged'), 'already-slugged')
console.log('ok')
