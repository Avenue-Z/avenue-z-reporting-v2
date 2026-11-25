import { expect, test, vi } from 'vitest'

vi.mock('@/components/report-sections/organic-social', () => ({ OrganicSocialReport: function OrganicSocialReport() { return null } }))

import { exportReportElement } from './report-element'

const params = { clientSlug: 'c', dateRange: 'custom:2026-10-01,2026-10-31', compareRange: null, models: null }

test('the Social Listening export renders the client view (exporting), and no other tab gets the flag', () => {
  const sl = exportReportElement({ section: 'organic-social', subsectionId: 'organic-social-listening', channel: null, view: 'social-listening', pageTitle: 'Social Listening' }, params)
  expect(sl.props).toMatchObject({ view: 'social-listening', exporting: true })
  expect(sl.props).not.toHaveProperty('sl')
  for (const view of [null, 'influencer', 'aeo-informed'] as const) {
    const el = exportReportElement({ section: 'organic-social', subsectionId: null, channel: null, view, pageTitle: 'x' }, params)
    expect(el.props).not.toHaveProperty('exporting')
  }
})

test('the Social Listening export takes the charts set to columns; without them, and on every other tab, nothing is passed', () => {
  const v = { section: 'organic-social', subsectionId: 'organic-social-listening', channel: null, view: 'social-listening', pageTitle: 'Social Listening' } as const
  expect(exportReportElement(v, { ...params, slCols: ['b-ytd', 'i-sentday'] }).props).toMatchObject({ exporting: true, slCols: ['b-ytd', 'i-sentday'] })
  expect(exportReportElement(v, params).props).not.toHaveProperty('slCols')
  expect(exportReportElement(v, { ...params, slCols: [] }).props).not.toHaveProperty('slCols')
  const ig = exportReportElement({ section: 'organic-social', subsectionId: 'organic-instagram', channel: 'INSTAGRAM', view: null, pageTitle: 'x' }, { ...params, slCols: ['b-ytd'] })
  expect(ig.props).not.toHaveProperty('slCols')
})
