import { describe, expect, test } from 'vitest'
import { buildMetaSql, META_FRESHNESS_TABLE, META_GEO_TABLE, metaAccount, metaHistoryFrom, planMetaQuery } from './meta'

// Every field list the dashboard sends today (the Meta seam table in the C2 plan).
const KPI = ['cost', 'impressions', 'reach', 'Frequency', 'inline_link_clicks', 'CTR', 'CPM', 'CPC', 'landing_page_views', 'cost_per_landing_page_view', 'action_post_engagement']
const CREATIVE = ['ad_name', 'adcampaign_name', 'adset_name', 'adstatus', ...KPI.filter((f) => f !== 'CPM')]
const GEO = ['Region', 'cost', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement']
const TREND = ['Date', 'cost', 'inline_link_clicks']
const SIX = 'having sum(t.cost) != 0 or sum(t.impressions) != 0 or sum(t.clicks) != 0 or sum(t.inline_link_clicks) != 0 or sum(t.landing_page_views) != 0 or sum(t.action_post_engagement) != 0'

describe('metaAccount', () => {
  test('the client row stores act_<id>; the marts store <id>', () => {
    expect(metaAccount('act_1480350426850960')).toBe('1480350426850960')
    expect(metaAccount('1480350426850960')).toBe('1480350426850960')
  })
})

describe('metaHistoryFrom', () => {
  test('Renaissance answers back to 2024-01-01; an account nobody verified has no floor', () => {
    expect(metaHistoryFrom('1480350426850960')).toBe('2024-01-01')
    expect(metaHistoryFrom('999')).toBeNull()
  })
})

describe('planMetaQuery', () => {
  test.each<[string, string[], string, string]>([
    ['KPI totals', KPI, META_FRESHNESS_TABLE, 'totals'],
    ['creative tree', CREATIVE, META_FRESHNESS_TABLE, 'creative'],
    ['geo', GEO, META_GEO_TABLE, 'geo'],
    ['paid media trend', TREND, META_FRESHNESS_TABLE, 'daily'],
  ])('%s', (_name, fields, table, kind) => {
    expect(planMetaQuery(fields)).toEqual({ table, kind })
  })
  test.each([
    [['cost', 'video_views']],
    [['Date', 'reach']],
    [['Date', 'Frequency']],
    [['Region', 'reach']],
    [['Region', 'Date', 'cost']],
    [['Region', 'ad_name', 'cost']],
    [['ad_name', 'Date', 'cost']],
  ])('%j is unsupported', (fields) => {
    expect(() => planMetaQuery(fields)).toThrow(expect.objectContaining({ reason: 'unsupported' }))
  })
})

describe('buildMetaSql', () => {
  test('rates are 4-dp ratios of sums, null on a zero denominator (no coalesce), CTR and CPC on all clicks', () => {
    const sql = buildMetaSql(KPI, 'totals')
    expect(sql).toContain('round(safe_divide(sum(t.clicks) * 1, sum(t.impressions)), 4) as `CTR`')
    expect(sql).toContain('round(safe_divide(sum(t.cost) * 1, sum(t.clicks)), 4) as `CPC`')
    expect(sql).toContain('round(safe_divide(sum(t.cost) * 1000, sum(t.impressions)), 4) as `CPM`')
    expect(sql).toContain('round(safe_divide(sum(t.cost) * 1, sum(t.landing_page_views)), 4) as `cost_per_landing_page_view`')
    expect(sql).not.toContain('coalesce(round')
    expect(sql).toContain('sum(t.inline_link_clicks) as `inline_link_clicks`')
  })
  test('reach and frequency never come from the sums', () => {
    const sql = buildMetaSql(KPI, 'totals')
    expect(sql).not.toMatch(/reach|frequency/i)
    expect(sql).not.toContain('group by')
    expect(sql).not.toContain('having')
  })
  test('filters the account and the window', () => {
    const sql = buildMetaSql(KPI, 'totals')
    expect(sql).toMatch(/\bfrom `[^`]+mart_fbads_creative_performance` t\n/)
    expect(sql).toContain('cast(t.ACCOUNT_ID as string) = @account')
    expect(sql).toContain('t.event_date between date(@start) and date(@end)')
  })
  test('grouped reads drop a row only when all six sums are 0, qualified (aliases are case-insensitive)', () => {
    for (const [fields, kind] of [[CREATIVE, 'creative'], [GEO, 'geo'], [TREND, 'daily']] as const) {
      expect(buildMetaSql([...fields], kind)).toContain(SIX)
    }
  })
  test('dimensions are output under their Supermetrics ids and grouped by their expressions', () => {
    const sql = buildMetaSql(CREATIVE, 'creative')
    expect(sql).toContain("coalesce(ad_name, '') as `ad_name`")
    expect(sql).toContain("coalesce(campaign_name, '') as `adcampaign_name`")
    expect(sql).toContain("coalesce(ad_group_name, '') as `adset_name`")
    expect(sql).toContain("coalesce(ad_status, '') as `adstatus`")
    expect(sql).toContain("group by coalesce(ad_name, ''), coalesce(campaign_name, ''), coalesce(ad_group_name, ''), coalesce(ad_status, '')")
    expect(buildMetaSql(GEO, 'geo')).toContain("coalesce(region, '') as `Region`")
    expect(buildMetaSql(TREND, 'daily')).toContain('cast(event_date as string) as `Date`')
  })
  test('a creative read asking for reach also selects how many ads each row groups, and one of them', () => {
    const sql = buildMetaSql(CREATIVE, 'creative')
    expect(sql).toContain('count(distinct t.AD_ID) as _n_ads, any_value(cast(t.AD_ID as string)) as _ad_id')
    expect(buildMetaSql(CREATIVE.filter((f) => f !== 'reach' && f !== 'Frequency'), 'creative')).not.toContain('_n_ads')
  })
  test('maxRows keeps the top rows by cost', () => {
    expect(buildMetaSql(CREATIVE, 'creative', 200)).toMatch(/order by sum\(t\.cost\) desc\nlimit 200$/)
    expect(buildMetaSql(GEO, 'geo', 500)).toMatch(/order by sum\(t\.cost\) desc\nlimit 500$/)
    expect(buildMetaSql(TREND, 'daily')).not.toContain('limit')
  })
})
