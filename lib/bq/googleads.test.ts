import { describe, expect, test } from 'vitest'
import { buildAwSql, pickAwMart, toSmRows } from './googleads'
import { BqUnavailable } from './errors'

// Every field list the dashboard sends today (lib/paid-search/*.ts, lib/paid-media/trend.ts).
const CASES: Array<[string[], string]> = [
  [['Cost', 'Clicks', 'Impressions'], 'mart_googleads_campaign_performance'],
  [['ConversionTypeName', 'Conversions'], 'mart_googleads_conversion_action'],
  [['Date', 'Cost', 'Clicks', 'Impressions'], 'mart_googleads_campaign_performance'],
  [['Yearweekiso', 'ConversionTypeName', 'Conversions'], 'mart_googleads_conversion_action'],
  [['Campaignname', 'Cost', 'Clicks', 'Impressions'], 'mart_googleads_campaign_performance'],
  [['Campaignname', 'ConversionTypeName', 'Conversions'], 'mart_googleads_conversion_action'],
  [['Region', 'Metroarea', 'Clicks', 'Cost'], 'mart_googleads_geo_performance'],
  [['Region', 'Metroarea', 'ConversionTypeName', 'Conversions'], 'mart_googleads_geo_conversion'],
  [['Keyword', 'Matchtype', 'Clicks', 'Impressions', 'Cost'], 'mart_googleads_keyword_performance'],
  [['Keyword', 'Matchtype', 'ConversionTypeName', 'Conversions'], 'mart_googleads_keyword_conversion'],
  [['Date', 'Cost', 'Clicks'], 'mart_googleads_campaign_performance'],
]

describe('pickAwMart', () => {
  test.each(CASES)('%j reads %s', (fields, table) => {
    expect(pickAwMart(fields).table).toBe(table)
  })
  test('an unknown field is unsupported, so the caller goes live', () => {
    expect(() => pickAwMart(['Campaignname', 'Cost', 'SearchImpressionShare'])).toThrow(BqUnavailable)
  })
  test('a metric the chosen mart lacks is unsupported (the geo mart has no impressions)', () => {
    expect(() => pickAwMart(['Region', 'Metroarea', 'Impressions'])).toThrow(/geo_performance/)
  })
})

describe('buildAwSql', () => {
  test('sums metrics, groups by dimension expressions, filters account and dates', () => {
    const sql = buildAwSql(['Region', 'Metroarea', 'Clicks', 'Cost'])
    expect(sql).toContain("coalesce(region, '') as `Region`")
    expect(sql).toContain('sum(clicks) as `Clicks`')
    expect(sql).toContain("group by coalesce(region, ''), coalesce(metro_area, '')")
    expect(sql).toContain('cast(ACCOUNT_ID as string) = @account')
    expect(sql).toContain('event_date between date(@start) and date(@end)')
  })
  test('ISO weeks are written year|week, matching Supermetrics Yearweekiso', () => {
    expect(buildAwSql(['Yearweekiso', 'Cost', 'Clicks', 'Impressions'])).toContain("format_date('%G|%V', event_date) as `Yearweekiso`")
  })
  test('grouped conversion rows with zero conversions are dropped, as Supermetrics drops them', () => {
    // Prod holds e.g. Renaissance ISO week 2026|16 with six conversion types at 0; live returns no such
    // rows, so a BigQuery-only 0-lead trend bucket appeared (shadow compare, 2026-10-14).
    expect(buildAwSql(['Yearweekiso', 'ConversionTypeName', 'Conversions'])).toMatch(/\nhaving sum\(t\.conversions\) != 0$/)
    expect(buildAwSql(['ConversionTypeName', 'Conversions'])).toMatch(/having sum\(t\.conversions\) != 0$/)
  })
  test('HAVING qualifies its column: BigQuery aliases are case-insensitive, so a bare `conversions` binds to the summed `Conversions` alias', () => {
    const sql = buildAwSql(['ConversionTypeName', 'Conversions'])
    expect(sql).toMatch(/\bfrom `[^`]+` t\n/)
    expect(sql).not.toMatch(/having sum\(conversions\)/)
  })
  test('metric marts keep every grouped row (no evidence Supermetrics drops them)', () => {
    expect(buildAwSql(['Date', 'Cost', 'Clicks', 'Impressions'])).not.toContain('having')
  })
  test('totals have no group by', () => {
    expect(buildAwSql(['Cost', 'Clicks', 'Impressions'])).not.toContain('group by')
  })
})

describe('toSmRows', () => {
  test('stringifies like Supermetrics and turns NULL into an empty string', () => {
    expect(toSmRows([{ Cost: 12.5, Clicks: 3, Region: null }], ['Region', 'Cost', 'Clicks'])).toEqual([
      { Region: '', Cost: '12.5', Clicks: '3' },
    ])
  })
  test('an empty-range totals row (all NULL sums) reads as zeros downstream', () => {
    const [row] = toSmRows([{ Cost: null, Clicks: null, Impressions: null }], ['Cost', 'Clicks', 'Impressions'])
    expect(Number(row.Cost || 0)).toBe(0)
  })
})
