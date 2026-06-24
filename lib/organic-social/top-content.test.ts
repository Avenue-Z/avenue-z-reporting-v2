// lib/organic-social/top-content.test.ts
// Run: npx tsx --env-file=.env.local lib/organic-social/top-content.test.ts
// (--env-file: importing ./base transitively loads the DB client via ga4/client,
//  which throws at init without DATABASE_URL. The transform under test is pure.)
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformTopContent } from './top-content'
import type { MediaV2Response } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/media-v2.json', import.meta.url), 'utf8')) as MediaV2Response
const rows = transformTopContent(fixture, 10)
assert.ok(rows.length <= 10, 'respects limit')
assert.ok(rows.every((r) => r.sourceType === 'organic'), 'all organic in v1')
assert.ok(rows.every((r) => typeof r.engagements === 'number'), 'numeric engagements')
// sorted by engagements desc
for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].engagements >= rows[i].engagements, 'desc by engagements')
console.log('organic top-content: all assertions passed')
