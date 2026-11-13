import { describe, expect, it } from 'vitest'
import { exportPeriodLabel } from '@/lib/export-period'
import { aeoExportPeriodLabel, aeoStampLabel } from './stamp'

const CLOCK = { today: '2026-11-12', lastCompleteUtcDay: '2026-11-11', liveDayInProgress: false }
const CLIENT = { dashSocialConfig: { brandId: 1, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' } } }
const OCT = 'custom:2026-10-01,2026-10-31'

describe('the export stamp for the AEO tab (spec section 4: the window actually rendered)', () => {
  it('names the range, then the window in the same date format as every other stamp', () => {
    expect(aeoStampLabel('ytd', { start: '2026-01-01', end: '2026-10-31' })).toBe(`YTD, ${exportPeriodLabel('custom:2026-01-01,2026-10-31')}`)
    expect(aeoStampLabel('month', { start: '2026-10-01', end: '2026-10-31' })).toBe(`Month, ${exportPeriodLabel(OCT)}`)
    expect(aeoStampLabel('all', { start: '2026-01-22', end: '2026-10-31' })).toBe(`All time, ${exportPeriodLabel('custom:2026-01-22,2026-10-31')}`)
  })
  it('works the window out the way the section does', () => {
    expect(aeoExportPeriodLabel({ client: CLIENT, servedRange: OCT, range: 'ytd', clock: CLOCK })).toBe(aeoStampLabel('ytd', { start: '2026-01-01', end: '2026-10-31' }))
    expect(aeoExportPeriodLabel({ client: CLIENT, servedRange: OCT, range: 'all', clock: CLOCK })).toBe(aeoStampLabel('all', { start: '2026-01-22', end: '2026-10-31' }))
  })
  it('falls back to the served range\'s own stamp when there is no window (no setting, a month not started, before the first data)', () => {
    expect(aeoExportPeriodLabel({ client: { dashSocialConfig: { brandId: 1 } }, servedRange: OCT, range: 'ytd', clock: CLOCK })).toBe(exportPeriodLabel(OCT))
    expect(aeoExportPeriodLabel({ client: CLIENT, servedRange: 'custom:2026-11-01,2026-11-30', range: 'month', clock: { ...CLOCK, lastCompleteUtcDay: '2026-10-31' } })).toBe(exportPeriodLabel('custom:2026-11-01,2026-11-30'))
    expect(aeoExportPeriodLabel({ client: CLIENT, servedRange: 'custom:2025-12-01,2025-12-31', range: 'all', clock: CLOCK })).toBe(exportPeriodLabel('custom:2025-12-01,2025-12-31'))
  })
  it('an unreadable range is no stamp, as for every other section', () => {
    expect(aeoExportPeriodLabel({ client: CLIENT, servedRange: 'custom:nonsense,x', range: 'month', clock: CLOCK })).toBe(exportPeriodLabel('custom:nonsense,x'))
  })
})
