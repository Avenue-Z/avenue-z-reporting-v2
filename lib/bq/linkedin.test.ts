import { describe, expect, test } from 'vitest'
import { buildLiSql, planLiQueries } from './linkedin'

const KPI_FIELDS = ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc', 'landingPageClicks', 'oneClickLeads', 'oneClickLeadsCost', 'oneClickLeadFormOpens', 'leadFormCompletionRate']
const CREATIVE_FIELDS = ['creativeDscName', 'campaignName', 'campaignGroupName', 'creativeStatus', 'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'oneClickLeads', 'oneClickLeadsCost', 'oneClickLeadFormOpens', 'leadFormCompletionRate', 'landingPageClicks']

describe('planLiQueries', () => {
  test('KPI totals: campaign mart, plus landing page clicks from the creative mart (as parity proved)', () => {
    const plan = planLiQueries(KPI_FIELDS)
    expect(plan.map((q) => q.table)).toEqual(['mart_linkedin_campaign_performance', 'mart_linkedin_creative_performance'])
    expect(plan[1].fields).toEqual(['landingPageClicks'])
    expect(plan[0].fields).not.toContain('landingPageClicks')
  })
  test('creative tree: creative mart only', () => {
    expect(planLiQueries(CREATIVE_FIELDS).map((q) => q.table)).toEqual(['mart_linkedin_creative_performance'])
  })
  test('paid media trend: campaign mart by day', () => {
    expect(planLiQueries(['Date', 'spend', 'clicks'])).toEqual([{ table: 'mart_linkedin_campaign_performance', fields: ['Date', 'spend', 'clicks'] }])
  })
  test.each([[['memberRegion', 'spend']], [['approximateUniqueImpressions']], [['Date', 'landingPageClicks']]])('%j is unsupported', (fields) => {
    expect(() => planLiQueries(fields)).toThrow(/unsupported|LinkedIn/)
  })
})

describe('buildLiSql', () => {
  test('vendor rates are 4-dp ratios of sums, 0 on a zero denominator', () => {
    const sql = buildLiSql({ table: 'mart_linkedin_campaign_performance', fields: ['ctr', 'cpm'] })
    expect(sql).toContain('coalesce(round(safe_divide(sum(clicks) * 1, sum(impressions)), 4), 0) as `ctr`')
    expect(sql).toContain('coalesce(round(safe_divide(sum(cost) * 1000, sum(impressions)), 4), 0) as `cpm`')
  })
  test('LinkedIn keys the day lowercase `date`, as its Supermetrics connector does', () => {
    expect(buildLiSql({ table: 'mart_linkedin_campaign_performance', fields: ['Date', 'spend'] })).toContain('cast(event_date as string) as `date`')
  })
  test('maxRows keeps the top rows by spend', () => {
    expect(buildLiSql({ table: 'mart_linkedin_creative_performance', fields: ['creativeDscName', 'spend'] }, 200)).toMatch(/order by sum\(cost\) desc\nlimit 200$/)
  })
})
