import { strict as assert } from 'node:assert'
import { transformLinkedInGeo } from './geo'

const rows = [
  { memberRegion: 'California', spend: '500', impressions: '20000', clicks: '250', oneClickLeads: '10' },
  { memberRegion: 'Texas', spend: '800', impressions: '30000', clicks: '300', oneClickLeads: '12' },
]

const out = transformLinkedInGeo(rows)
assert.equal(out[0].region, 'Texas')   // sorted by spend desc
assert.equal(out[0].spend, 800)
assert.equal(out[0].leads, 12)
assert.equal(out[1].region, 'California')
console.log('ok')
