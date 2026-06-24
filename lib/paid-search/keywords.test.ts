import { strict as assert } from 'node:assert'
import { transformKeywords } from './keywords'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  Clicks: '80', Impressions: '1000', Cost: '300' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', Clicks: '40', Impressions: '500',  Cost: '500' },
  { Keyword: 'no leads kw',      Matchtype: 'Broad',  Clicks: '10', Impressions: '200',  Cost: '90'  },
]
const leads = [
  { Keyword: 'dental insurance', Matchtype: 'Exact',  ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'broker_group_lead', Conversions: '3' },
  { Keyword: 'broker benefits',  Matchtype: 'Phrase', ConversionTypeName: 'ignored_action',    Conversions: '9' },
]
const rows = transformKeywords(metrics, leads, cfg)

assert.equal(rows[0].keyword, 'broker benefits') // 3 leads ranks first
assert.equal(rows[0].matchType, 'Phrase')
assert.equal(rows[0].leads, 3)                    // 'ignored_action' excluded
assert.equal(rows[1].keyword, 'dental insurance') // 2 leads
assert.equal(rows[1].ctr, 8)                       // 80/1000 = 8%
assert.equal(rows[2].leads, 0)                     // no qualified leads

console.log('ok')
