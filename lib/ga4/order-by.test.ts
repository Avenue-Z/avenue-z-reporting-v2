import { describe, it, expect } from 'vitest'
import { buildRunReportRequest } from './client'

// Paul CR2 finding (207): ga4Query never set orderBys, so GA4 returned channel
// rows in an unspecified order. Combined with `limit: 10` on the channel-group
// queries in executive-overview/index.tsx, that silently truncated an
// arbitrary 10 rows instead of the top 10 by sessions, a client with more
// than 10 channel groups could lose Organic Search entirely, and the dropped
// rows also skewed the share-of-total denominator in reshape.ts.
//
// These tests pin buildRunReportRequest's request-building logic directly
// (no live GA4 client / DB lookup exists to mock at) rather than exercising
// ga4Query end to end.
describe('buildRunReportRequest: orderBys pass-through', () => {
  const dateRange = { startDate: '2026-08-01', endDate: '2026-08-19' }
  const baseParams = { metrics: ['sessions'] }

  it('omits orderBys entirely when the caller does not pass it, preserving prior behavior for every existing caller', () => {
    const req = buildRunReportRequest('properties/123', dateRange, baseParams)
    expect(req).not.toHaveProperty('orderBys')
  })

  it('includes orderBys, unmodified, when the caller passes it', () => {
    const orderBys = [{ metric: { metricName: 'sessions' }, desc: true }]
    const req = buildRunReportRequest('properties/123', dateRange, { ...baseParams, orderBys })
    expect(req.orderBys).toEqual(orderBys)
  })

  it('builds every other field identically whether or not orderBys is passed', () => {
    const orderBys = [{ metric: { metricName: 'sessions' }, desc: true }]
    const withOrder = buildRunReportRequest('properties/123', dateRange, { ...baseParams, orderBys })
    const without = buildRunReportRequest('properties/123', dateRange, baseParams)
    const { orderBys: _drop, ...withoutOrderKey } = withOrder
    expect(withoutOrderKey).toEqual(without)
  })
})
