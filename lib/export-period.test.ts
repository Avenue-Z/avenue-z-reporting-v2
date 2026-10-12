import { expect, test } from 'vitest'
import { exportPeriodLabel } from './export-period'

test('a locked month reads as its dates', () => {
  expect(exportPeriodLabel('custom:2026-09-01,2026-09-30')).toBe('Sep 1 – Sep 30, 2026')
})

// dateRange is a URL param, and this runs in the page outside any error boundary.
test.each(['custom:junk', 'custom:2026-13-45,x'])('a malformed range %s gives no label instead of throwing', (r) => {
  expect(exportPeriodLabel(r)).toBeNull()
})
